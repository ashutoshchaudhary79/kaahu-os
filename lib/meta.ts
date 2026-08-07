const META_API_VERSION = process.env.META_API_VERSION?.trim() || "v24.0";

type MetaAction = { action_type: string; value: string };

type InsightRow = {
  date_start: string;
  date_stop: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
};

type MetaPage<T> = {
  data?: T[];
  paging?: { next?: string };
  error?: { message?: string; code?: number };
};

export type MetaDaily = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  landingPageViews: number;
  addToCart: number;
  checkoutInitiated: number;
  purchases: number;
  purchaseValue: number;
};

export type MetaCampaign = {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  landingPageViews: number;
  purchases: number;
  purchaseValue: number;
  ctr: number;
  cpc: number;
  roas: number;
  cpa: number | null;
};

export type MetaSummary = {
  source: "meta";
  from: string;
  to: string;
  accountId: string;
  spend: number;
  impressions: number;
  clicks: number;
  landingPageViews: number;
  addToCart: number;
  checkoutInitiated: number;
  purchases: number;
  purchaseValue: number;
  daily: MetaDaily[];
  campaigns: MetaCampaign[];
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function number(value?: string): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, decimals = 2): number {
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function action(actions: MetaAction[] | undefined, canonical: string, fallbacks: string[] = []): number {
  const values = new Map((actions ?? []).map((item) => [item.action_type, number(item.value)]));
  if (values.has(canonical)) return values.get(canonical) ?? 0;
  for (const fallback of fallbacks) {
    if (values.has(fallback)) return values.get(fallback) ?? 0;
  }
  return 0;
}

function normalizeRow(row: InsightRow): MetaDaily {
  return {
    date: row.date_start,
    spend: round(number(row.spend)),
    impressions: number(row.impressions),
    clicks: action(row.actions, "link_click", ["inline_link_click"]) || number(row.clicks),
    landingPageViews: action(row.actions, "landing_page_view", ["omni_landing_page_view"]),
    addToCart: action(row.actions, "offsite_conversion.fb_pixel_add_to_cart", ["add_to_cart", "omni_add_to_cart"]),
    checkoutInitiated: action(row.actions, "offsite_conversion.fb_pixel_initiate_checkout", ["initiate_checkout", "omni_initiated_checkout"]),
    purchases: action(row.actions, "offsite_conversion.fb_pixel_purchase", ["purchase", "omni_purchase"]),
    purchaseValue: round(action(row.action_values, "offsite_conversion.fb_pixel_purchase", ["purchase", "omni_purchase"])),
  };
}

async function fetchAll<T>(path: string, params: URLSearchParams): Promise<T[]> {
  const token = requiredEnv("META_ACCESS_TOKEN");
  let url: string | null = `https://graph.facebook.com/${META_API_VERSION}/${path}?${params.toString()}`;
  const rows: T[] = [];
  let pages = 0;

  while (url) {
    if (++pages > 100) throw new Error("Meta pagination exceeded the safety limit");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = (await response.json()) as MetaPage<T>;
    if (!response.ok || body.error) {
      throw new Error(body.error?.message ?? `Meta API request failed (${response.status})`);
    }
    rows.push(...(body.data ?? []));
    url = body.paging?.next ?? null;
  }
  return rows;
}

function insightParams(from: string, to: string, level: "account" | "campaign") {
  return new URLSearchParams({
    time_range: JSON.stringify({ since: from, until: to }),
    level,
    fields: level === "campaign"
      ? "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values"
      : "spend,impressions,clicks,actions,action_values",
    action_report_time: "conversion",
    use_account_attribution_setting: "true",
    limit: "500",
    ...(level === "account" ? { time_increment: "1" } : {}),
  });
}

export async function getMetaSummary(from: string, to: string): Promise<MetaSummary> {
  const accountIdValue = requiredEnv("META_AD_ACCOUNT_ID");
  const accountId = accountIdValue.startsWith("act_") ? accountIdValue : `act_${accountIdValue}`;
  const [dailyRows, campaignRows] = await Promise.all([
    fetchAll<InsightRow>(`${accountId}/insights`, insightParams(from, to, "account")),
    fetchAll<InsightRow>(`${accountId}/insights`, insightParams(from, to, "campaign")),
  ]);

  const daily = dailyRows.map(normalizeRow).sort((a, b) => a.date.localeCompare(b.date));
  const total = daily.reduce((sum, row) => ({
    spend: sum.spend + row.spend,
    impressions: sum.impressions + row.impressions,
    clicks: sum.clicks + row.clicks,
    landingPageViews: sum.landingPageViews + row.landingPageViews,
    addToCart: sum.addToCart + row.addToCart,
    checkoutInitiated: sum.checkoutInitiated + row.checkoutInitiated,
    purchases: sum.purchases + row.purchases,
    purchaseValue: sum.purchaseValue + row.purchaseValue,
  }), { spend: 0, impressions: 0, clicks: 0, landingPageViews: 0, addToCart: 0, checkoutInitiated: 0, purchases: 0, purchaseValue: 0 });

  const campaigns = campaignRows.map((row): MetaCampaign => {
    const normalized = normalizeRow(row);
    const spend = normalized.spend;
    return {
      id: row.campaign_id ?? row.campaign_name ?? "unknown",
      name: row.campaign_name ?? "Unnamed campaign",
      spend,
      impressions: normalized.impressions,
      clicks: normalized.clicks,
      landingPageViews: normalized.landingPageViews,
      purchases: normalized.purchases,
      purchaseValue: normalized.purchaseValue,
      ctr: normalized.impressions ? round((normalized.clicks / normalized.impressions) * 100) : 0,
      cpc: normalized.clicks ? round(spend / normalized.clicks) : 0,
      roas: spend ? round(normalized.purchaseValue / spend) : 0,
      cpa: normalized.purchases ? round(spend / normalized.purchases) : null,
    };
  }).sort((a, b) => b.spend - a.spend);

  return {
    source: "meta",
    from,
    to,
    accountId,
    spend: round(total.spend),
    impressions: total.impressions,
    clicks: total.clicks,
    landingPageViews: total.landingPageViews,
    addToCart: total.addToCart,
    checkoutInitiated: total.checkoutInitiated,
    purchases: total.purchases,
    purchaseValue: round(total.purchaseValue),
    daily,
    campaigns,
  };
}
