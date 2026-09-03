const META_API_VERSION = process.env.META_API_VERSION?.trim() || "v24.0";

type MetaAction = { action_type: string; value: string };

type InsightRow = {
  date_start: string;
  date_stop: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  comscore_market?: string;
  region?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
};

type MetaPage<T> = {
  data?: T[];
  paging?: { next?: string };
  error?: { message?: string; code?: number };
};

type MetaCampaignDefinition = { id: string; name: string; objective?: string };
type MetaAdCreative = { id: string; name?: string; campaign?: { id: string } | null; creative?: { id: string; name?: string; thumbnail_url?: string; image_url?: string } | null };
export type FunnelRole = "tofu" | "mofu" | "sales";

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
  frequency: number;
  clicks: number;
  landingPageViews: number;
  addToCart: number;
  checkoutInitiated: number;
  purchases: number;
  purchaseValue: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
  cpa: number | null;
};

export type MetaBreakdownRow = MetaCampaign;

export type MetaFunnelAd = {
  id: string;
  name: string;
  campaignName: string;
  objective: string;
  role: FunnelRole;
  spend: number;
  impressions: number;
  clicks: number;
  landingPageViews: number;
  addToCart: number;
  checkoutInitiated: number;
  purchases: number;
};

export type MetaMarket = {
  name: string;
  spend: number;
  spendShare: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
};

export type MetaMarketSummary = {
  source: "meta";
  from: string;
  to: string;
  totalSpend: number;
  dimension: "comscore" | "state";
  markets: MetaMarket[];
};

export type MetaCampaignDaily = MetaDaily & {
  campaignId: string;
  campaignName: string;
  objective: string | null;
  reach: number;
};

export type MetaEntityDaily = MetaDaily & {
  level: "adset" | "ad";
  entityId: string;
  parentId: string;
  campaignId: string | null;
  name: string;
  campaignName: string | null;
  objective: string | null;
  reach: number;
};

export type MetaCreative = { adId: string; campaignId: string | null; adName: string; creativeId: string | null; thumbnailUrl: string | null };

export type MetaMarketDaily = MetaMarket & { date: string };

export class MetaRateLimitError extends Error {}

let metaPauseUntil = 0;
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function usagePercent(response: Response): number {
  const raw = response.headers.get("x-business-use-case-usage");
  if (!raw) return 0;
  try {
    const usage = JSON.parse(raw) as Record<string, Array<Record<string, number>>>;
    return Math.max(0, ...Object.values(usage).flatMap((entries) => entries.flatMap((entry) => [entry.call_count ?? 0, entry.total_cputime ?? 0, entry.total_time ?? 0])));
  } catch {
    return 0;
  }
}

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
  dailyAds: Array<{ date: string; ads: MetaBreakdownRow[] }>;
  ads: MetaFunnelAd[];
  campaigns: Array<MetaCampaign & { objective: string; role: FunnelRole }>;
};

export type MetaCampaignDetail = {
  id: string;
  from: string;
  to: string;
  daily: MetaDaily[];
  ads: Array<{ id: string; name: string; spend: number; thumbnailUrl: string | null }>;
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

function funnelRole(objective: string | undefined, campaignName: string): FunnelRole {
  const value = objective?.toUpperCase() ?? "";
  if (["OUTCOME_AWARENESS", "BRAND_AWARENESS", "REACH", "VIDEO_VIEWS"].includes(value)) return "tofu";
  if (["OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES", "STORE_VISITS"].includes(value)) return "sales";
  if (["OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION", "LINK_CLICKS", "TRAFFIC", "POST_ENGAGEMENT", "LEAD_GENERATION"].includes(value)) return "mofu";
  if (/awareness|tofu|reach|video/i.test(campaignName)) return "tofu";
  if (/sales|sale|conversion|purchase|bofu|catalog/i.test(campaignName)) return "sales";
  return "mofu";
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
    if (Date.now() < metaPauseUntil) await sleep(metaPauseUntil - Date.now());
    let body: MetaPage<T> | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      body = (await response.json()) as MetaPage<T>;
      const usage = usagePercent(response);
      if (usage >= 100) throw new MetaRateLimitError("Meta usage limit reached; run stopped cleanly");
      if (usage > 80) {
        console.warn(`Meta API usage is ${usage}%; pausing before the next request`);
        metaPauseUntil = Date.now() + 5_000;
      }
      if (body.error && [4, 17].includes(body.error.code ?? 0) && attempt < 4) {
        await sleep(Math.min(5_000 * (2 ** attempt), 300_000));
        continue;
      }
      if (!response.ok || body.error) throw new Error(body.error?.message ?? `Meta API request failed (${response.status})`);
      break;
    }
    if (!body) throw new Error("Meta API returned no response");
    rows.push(...(body.data ?? []));
    url = body.paging?.next ?? null;
  }
  return rows;
}

export async function getMetaCampaignDaily(from: string, to: string): Promise<MetaCampaignDaily[]> {
  const accountIdValue = requiredEnv("META_AD_ACCOUNT_ID");
  const accountId = accountIdValue.startsWith("act_") ? accountIdValue : `act_${accountIdValue}`;
  const params = insightParams(from, to, "campaign");
  params.set("time_increment", "1");
  const [insights, definitions] = await Promise.all([
    fetchAll<InsightRow>(`${accountId}/insights`, params),
    fetchAll<MetaCampaignDefinition>(`${accountId}/campaigns`, new URLSearchParams({ fields: "id,name,objective", limit: "500" })),
  ]);
  const objectives = new Map(definitions.map((campaign) => [campaign.id, campaign.objective ?? null]));
  return insights.map((row) => ({
    ...normalizeRow(row),
    campaignId: row.campaign_id ?? "unknown",
    campaignName: row.campaign_name ?? "Unnamed campaign",
    objective: objectives.get(row.campaign_id ?? "") ?? null,
    reach: number(row.reach),
  }));
}

export async function getMetaEntityDaily(from: string, to: string, level: "adset" | "ad"): Promise<MetaEntityDaily[]> {
  const accountIdValue = requiredEnv("META_AD_ACCOUNT_ID");
  const accountId = accountIdValue.startsWith("act_") ? accountIdValue : `act_${accountIdValue}`;
  const fields = level === "adset"
    ? "campaign_id,campaign_name,adset_id,adset_name,spend,impressions,reach,clicks,actions,action_values"
    : "campaign_id,campaign_name,adset_id,ad_id,ad_name,spend,impressions,reach,clicks,actions,action_values";
  const params = new URLSearchParams({
    time_range: JSON.stringify({ since: from, until: to }), level, fields,
    action_report_time: "conversion", use_account_attribution_setting: "true", time_increment: "1", limit: "500",
  });
  const [insights, definitions] = await Promise.all([
    fetchAll<InsightRow>(`${accountId}/insights`, params),
    fetchAll<MetaCampaignDefinition>(`${accountId}/campaigns`, new URLSearchParams({ fields: "id,name,objective", limit: "500" })),
  ]);
  const objectives = new Map(definitions.map((campaign) => [campaign.id, campaign.objective ?? null]));
  return insights.map((row) => {
    const normalized = normalizeRow(row);
    const entityId = level === "adset" ? row.adset_id : row.ad_id;
    const name = level === "adset" ? row.adset_name : row.ad_name;
    const parentId = level === "adset" ? row.campaign_id : row.adset_id;
    return {
      ...normalized, level, entityId: entityId ?? name ?? "unknown", parentId: parentId ?? "unknown",
      campaignId: row.campaign_id ?? null, name: name ?? `Unnamed ${level}`,
      campaignName: row.campaign_name ?? null, objective: objectives.get(row.campaign_id ?? "") ?? null,
      reach: number(row.reach),
    };
  });
}

export async function getMetaCreatives(): Promise<MetaCreative[]> {
  const accountIdValue = requiredEnv("META_AD_ACCOUNT_ID");
  const accountId = accountIdValue.startsWith("act_") ? accountIdValue : `act_${accountIdValue}`;
  const rows = await fetchAll<MetaAdCreative>(`${accountId}/ads`, new URLSearchParams({
    fields: "id,name,campaign{id},creative{id,name,thumbnail_url,image_url}", limit: "500",
  }));
  return rows.map((ad) => ({
    adId: ad.id, campaignId: ad.campaign?.id ?? null, adName: ad.name ?? "Unnamed ad",
    creativeId: ad.creative?.id ?? null, thumbnailUrl: ad.creative?.thumbnail_url ?? ad.creative?.image_url ?? null,
  }));
}

export async function getMetaMarketDaily(from: string, to: string, dimension: "comscore" | "state"): Promise<MetaMarketDaily[]> {
  const accountIdValue = requiredEnv("META_AD_ACCOUNT_ID");
  const accountId = accountIdValue.startsWith("act_") ? accountIdValue : `act_${accountIdValue}`;
  const params = new URLSearchParams({
    time_range: JSON.stringify({ since: from, until: to }),
    level: "account",
    breakdowns: dimension === "comscore" ? "comscore_market" : "region",
    fields: "spend,impressions,clicks,actions",
    action_report_time: "conversion",
    use_account_attribution_setting: "true",
    time_increment: "1",
    limit: "500",
  });
  const insightRows = await fetchAll<InsightRow>(`${accountId}/insights`, params);
  const spendByDate = new Map<string, number>();
  for (const row of insightRows) spendByDate.set(row.date_start, (spendByDate.get(row.date_start) ?? 0) + number(row.spend));
  return insightRows.map((row) => {
    const normalized = normalizeRow(row);
    const total = spendByDate.get(row.date_start) ?? 0;
    return {
      date: row.date_start,
      name: (dimension === "comscore" ? row.comscore_market : row.region) ?? `Unknown ${dimension}`,
      spend: normalized.spend,
      spendShare: total ? round((normalized.spend / total) * 100) : 0,
      impressions: normalized.impressions,
      clicks: normalized.clicks,
      ctr: normalized.impressions ? round((normalized.clicks / normalized.impressions) * 100, 4) : 0,
      cpm: normalized.impressions ? round((normalized.spend / normalized.impressions) * 1000) : 0,
    };
  });
}

function insightParams(from: string, to: string, level: "account" | "campaign") {
  return new URLSearchParams({
    time_range: JSON.stringify({ since: from, until: to }),
    level,
    fields: level === "campaign"
      ? "campaign_id,campaign_name,spend,impressions,reach,clicks,actions,action_values"
      : "spend,impressions,clicks,actions,action_values",
    action_report_time: "conversion",
    use_account_attribution_setting: "true",
    limit: "500",
    ...(level === "account" ? { time_increment: "1" } : {}),
  });
}

function performanceRow(row: InsightRow, level: "campaign" | "adset" | "ad"): MetaBreakdownRow {
  const normalized = normalizeRow(row);
  const spend = normalized.spend;
  const identifiers = level === "campaign"
    ? [row.campaign_id, row.campaign_name]
    : level === "adset"
      ? [row.adset_id, row.adset_name]
      : [row.ad_id, row.ad_name];
  return {
    id: identifiers[0] ?? identifiers[1] ?? "unknown",
    name: identifiers[1] ?? `Unnamed ${level}`,
    spend,
    impressions: normalized.impressions,
    frequency: Number(row.reach) ? round(normalized.impressions / Number(row.reach)) : 0,
    clicks: normalized.clicks,
    landingPageViews: normalized.landingPageViews,
    addToCart: normalized.addToCart,
    checkoutInitiated: normalized.checkoutInitiated,
    purchases: normalized.purchases,
    purchaseValue: normalized.purchaseValue,
    ctr: normalized.impressions ? round((normalized.clicks / normalized.impressions) * 100) : 0,
    cpc: normalized.clicks ? round(spend / normalized.clicks) : 0,
    cpm: normalized.impressions ? round((spend / normalized.impressions) * 1000) : 0,
    roas: spend ? round(normalized.purchaseValue / spend) : 0,
    cpa: normalized.purchases ? round(spend / normalized.purchases) : null,
  };
}

export async function getMetaBreakdown(from: string, to: string, level: "adset" | "ad", parentId: string): Promise<MetaBreakdownRow[]> {
  const accountIdValue = requiredEnv("META_AD_ACCOUNT_ID");
  const accountId = accountIdValue.startsWith("act_") ? accountIdValue : `act_${accountIdValue}`;
  const fields = level === "adset"
    ? "adset_id,adset_name,spend,impressions,reach,clicks,actions,action_values"
    : "ad_id,ad_name,spend,impressions,reach,clicks,actions,action_values";
  const params = new URLSearchParams({
    time_range: JSON.stringify({ since: from, until: to }),
    level,
    fields,
    filtering: JSON.stringify([{ field: level === "adset" ? "campaign.id" : "adset.id", operator: "EQUAL", value: parentId }]),
    action_report_time: "conversion",
    use_account_attribution_setting: "true",
    limit: "500",
  });
  const rows = await fetchAll<InsightRow>(`${accountId}/insights`, params);
  return rows.map((row) => performanceRow(row, level)).sort((a, b) => b.spend - a.spend);
}

export async function getMetaCampaignDetail(campaignId: string, from: string, to: string): Promise<MetaCampaignDetail> {
  const dailyParams = new URLSearchParams({
    time_range: JSON.stringify({ since: from, until: to }),
    level: "campaign",
    fields: "spend,impressions,clicks,actions,action_values",
    action_report_time: "conversion",
    use_account_attribution_setting: "true",
    time_increment: "1",
    limit: "500",
  });
  const adInsightParams = new URLSearchParams({
    time_range: JSON.stringify({ since: from, until: to }),
    level: "ad",
    fields: "ad_id,ad_name,spend,impressions,clicks,actions,action_values",
    filtering: JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaignId }]),
    action_report_time: "conversion",
    use_account_attribution_setting: "true",
    limit: "500",
  });
  const creativeParams = new URLSearchParams({ fields: "id,name,creative{id,name,thumbnail_url,image_url}", limit: "500" });
  const [dailyRows, adInsightRows, creativeRows] = await Promise.all([
    fetchAll<InsightRow>(`${campaignId}/insights`, dailyParams),
    fetchAll<InsightRow>(`${campaignId}/insights`, adInsightParams),
    fetchAll<MetaAdCreative>(`${campaignId}/ads`, creativeParams),
  ]);
  const thumbnails = new Map(creativeRows.map((ad) => [ad.id, ad.creative?.thumbnail_url ?? ad.creative?.image_url ?? null]));
  return {
    id: campaignId,
    from,
    to,
    daily: dailyRows.map(normalizeRow).sort((a, b) => a.date.localeCompare(b.date)),
    ads: adInsightRows.map((row) => ({
      id: row.ad_id ?? row.ad_name ?? "unknown",
      name: row.ad_name ?? "Unnamed ad",
      spend: normalizeRow(row).spend,
      thumbnailUrl: thumbnails.get(row.ad_id ?? "") ?? null,
    })).sort((a, b) => b.spend - a.spend),
  };
}

export async function getMetaMarketSummary(from: string, to: string, dimension: "comscore" | "state"): Promise<MetaMarketSummary> {
  const accountIdValue = requiredEnv("META_AD_ACCOUNT_ID");
  const accountId = accountIdValue.startsWith("act_") ? accountIdValue : `act_${accountIdValue}`;
  const params = new URLSearchParams({
    time_range: JSON.stringify({ since: from, until: to }),
    level: "account",
    breakdowns: dimension === "comscore" ? "comscore_market" : "region",
    fields: "spend,impressions,clicks,actions",
    action_report_time: "conversion",
    use_account_attribution_setting: "true",
    limit: "500",
  });
  const rows = await fetchAll<InsightRow>(`${accountId}/insights`, params);
  const totalSpend = rows.reduce((sum, row) => sum + number(row.spend), 0);
  const markets = rows.map((row): MetaMarket => {
    const normalized = normalizeRow(row);
    return {
      name: (dimension === "comscore" ? row.comscore_market : row.region) ?? `Unknown ${dimension === "comscore" ? "market" : "state"}`,
      spend: round(normalized.spend),
      spendShare: totalSpend ? round((normalized.spend / totalSpend) * 100) : 0,
      impressions: normalized.impressions,
      clicks: normalized.clicks,
      ctr: normalized.impressions ? round((normalized.clicks / normalized.impressions) * 100) : 0,
      cpm: normalized.impressions ? round((normalized.spend / normalized.impressions) * 1000) : 0,
    };
  }).sort((a, b) => b.spend - a.spend);
  return { source: "meta", from, to, totalSpend: round(totalSpend), dimension, markets };
}

export async function getMetaSummary(from: string, to: string): Promise<MetaSummary> {
  const accountIdValue = requiredEnv("META_AD_ACCOUNT_ID");
  const accountId = accountIdValue.startsWith("act_") ? accountIdValue : `act_${accountIdValue}`;
  const dailyAdParams = new URLSearchParams({
    time_range: JSON.stringify({ since: from, until: to }),
    level: "ad",
    fields: "ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks,actions,action_values",
    action_report_time: "conversion",
    use_account_attribution_setting: "true",
    time_increment: "1",
    limit: "500",
  });
  const [dailyRows, campaignRows, dailyAdRows, campaignDefinitions] = await Promise.all([
    fetchAll<InsightRow>(`${accountId}/insights`, insightParams(from, to, "account")),
    fetchAll<InsightRow>(`${accountId}/insights`, insightParams(from, to, "campaign")),
    fetchAll<InsightRow>(`${accountId}/insights`, dailyAdParams),
    fetchAll<MetaCampaignDefinition>(`${accountId}/campaigns`, new URLSearchParams({ fields: "id,name,objective", limit: "500" })),
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

  const objectiveByCampaign = new Map(campaignDefinitions.map((campaign) => [campaign.id, campaign.objective ?? ""]));
  const campaigns = campaignRows.map((row) => {
    const objective = objectiveByCampaign.get(row.campaign_id ?? "") ?? "";
    return { ...performanceRow(row, "campaign"), objective, role: funnelRole(objective, row.campaign_name ?? "") };
  }).sort((a, b) => b.spend - a.spend);
  const dailyAdMap = new Map<string, MetaBreakdownRow[]>();
  for (const row of dailyAdRows) {
    const ads = dailyAdMap.get(row.date_start) ?? [];
    ads.push(performanceRow(row, "ad"));
    dailyAdMap.set(row.date_start, ads);
  }
  const dailyAds = Array.from(dailyAdMap, ([date, ads]) => ({
    date,
    ads: ads.sort((a, b) => b.spend - a.spend).slice(0, 3),
  })).sort((a, b) => a.date.localeCompare(b.date));
  const adMap = new Map<string, MetaFunnelAd>();
  for (const row of dailyAdRows) {
    const normalized = normalizeRow(row);
    const id = row.ad_id ?? row.ad_name ?? "unknown";
    const current = adMap.get(id) ?? {
      id,
      name: row.ad_name ?? "Unnamed ad",
      campaignName: row.campaign_name ?? "Unknown campaign",
      objective: objectiveByCampaign.get(row.campaign_id ?? "") ?? "",
      role: funnelRole(objectiveByCampaign.get(row.campaign_id ?? ""), row.campaign_name ?? ""),
      spend: 0,
      impressions: 0,
      clicks: 0,
      landingPageViews: 0,
      addToCart: 0,
      checkoutInitiated: 0,
      purchases: 0,
    };
    current.spend = round(current.spend + normalized.spend);
    current.impressions += normalized.impressions;
    current.clicks += normalized.clicks;
    current.landingPageViews += normalized.landingPageViews;
    current.addToCart += normalized.addToCart;
    current.checkoutInitiated += normalized.checkoutInitiated;
    current.purchases += normalized.purchases;
    adMap.set(id, current);
  }
  const ads = Array.from(adMap.values()).filter((ad) => ad.spend > 0);

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
    dailyAds,
    ads,
    campaigns,
  };
}
