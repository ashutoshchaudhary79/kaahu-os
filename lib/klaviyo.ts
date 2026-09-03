const REVISION = process.env.KLAVIYO_API_REVISION?.trim() || "2026-07-15";
const BASE = "https://a.klaviyo.com/api";

type JsonApiItem = { id: string; attributes?: Record<string, unknown>; links?: { next?: string | null } };
type JsonApiResponse = { data?: JsonApiItem[] | JsonApiItem; links?: { next?: string | null }; errors?: Array<{ detail?: string; title?: string }> };
type Statistics = { recipients?: number; delivered?: number; open_rate?: number; click_rate?: number; conversion_uniques?: number; conversion_rate?: number; conversion_value?: number; revenue_per_recipient?: number; unsubscribe_rate?: number; spam_complaint_rate?: number };
type ReportResult = { groupings?: Record<string, string>; statistics?: Statistics };
type ReportResponse = { data?: { attributes?: { results?: ReportResult[] } }; errors?: Array<{ detail?: string; title?: string }> };
type AggregateResponse = { data?: { attributes?: { data?: Array<{ measurements?: Record<string, number[]> }> } }; errors?: Array<{ detail?: string; title?: string }> };
type SeriesResult = { groupings?: Record<string, string>; statistics?: Record<string, number[]> };
type SeriesResponse = { data?: { attributes?: { date_times?: string[]; results?: SeriesResult[] } }; errors?: Array<{ detail?: string; title?: string }> };
type MetricSeriesResponse = { data?: { attributes?: { dates?: string[]; data?: Array<{ dimensions?: string[]; measurements?: Record<string, number[]> }> } }; errors?: Array<{ detail?: string; title?: string }> };

export type KlaviyoPerformance = {
  id: string; name: string; channel: string; recipients: number; delivered: number; openRate: number; clickRate: number;
  conversions: number; conversionRate: number; revenue: number; revenuePerRecipient: number; unsubscribeRate: number; spamComplaintRate: number;
  parentId?: string;
  parentName?: string;
};

export type KlaviyoSummary = {
  source: "klaviyo"; from: string; to: string;
  attributedRevenue: number;
  abandonedCart: { triggered: number; completed: number; recoveryRate: number; revenueRecovered: number };
  campaigns: KlaviyoPerformance[];
  flows: KlaviyoPerformance[];
  flowMessages: KlaviyoPerformance[];
  flowGroups: Array<{ key: "welcome" | "post_purchase" | "other"; name: string; rows: KlaviyoPerformance[] }>;
  listHealth: { currentEmailListSize: number; subscribed: number; unsubscribed: number; netGrowth: number; growthRate: number | null; unsubscribeRate: number; spamComplaintRate: number };
};

export type KlaviyoHistoricalRange = {
  campaigns: Array<KlaviyoPerformance & { date: string }>;
  flowMessages: Array<KlaviyoPerformance & { date: string }>;
  listHealth: Array<{ date: string; currentEmailListSize: number; subscribed: number; unsubscribed: number; netGrowth: number }>;
};

function apiKey() {
  const value = process.env.KLAVIYO_PRIVATE_API_KEY?.trim();
  if (!value) throw new Error("KLAVIYO_PRIVATE_API_KEY is not configured");
  return value;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url.startsWith("http") ? url : `${BASE}${url}`, {
      ...init,
      headers: { Authorization: `Klaviyo-API-Key ${apiKey()}`, accept: "application/vnd.api+json", revision: REVISION, ...(init?.body ? { "content-type": "application/vnd.api+json" } : {}), ...init?.headers },
      cache: "no-store",
    });
    const body = (await response.json()) as T & { errors?: Array<{ detail?: string; title?: string }> };
    if (response.status === 429 && attempt === 0) {
      const detail = body.errors?.[0]?.detail ?? "";
      const suggested = Number(detail.match(/available in (\d+) seconds?/i)?.[1]);
      const retryAfter = Number(response.headers.get("retry-after"));
      const seconds = Number.isFinite(retryAfter) ? retryAfter : Number.isFinite(suggested) ? suggested : 10;
      await new Promise((resolve) => setTimeout(resolve, Math.max(seconds, 1) * 1000));
      continue;
    }
    if (!response.ok || body.errors?.length) throw new Error(body.errors?.[0]?.detail ?? body.errors?.[0]?.title ?? `Klaviyo request failed (${response.status})`);
    return body;
  }
  throw new Error("Klaviyo remained rate limited after retry");
}

async function allPages(path: string) {
  const items: JsonApiItem[] = [];
  let url: string | null = `${BASE}${path}`;
  for (let page = 0; url && page < 100; page += 1) {
    const body: JsonApiResponse = await request<JsonApiResponse>(url);
    const data = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
    items.push(...data);
    url = body.links?.next ?? null;
  }
  if (url) throw new Error("Klaviyo pagination exceeded the safety limit");
  return items;
}

const statistics = ["recipients", "delivered", "open_rate", "click_rate", "conversion_uniques", "conversion_rate", "conversion_value", "revenue_per_recipient", "unsubscribe_rate", "spam_complaint_rate"];

async function report(type: "flow" | "campaign", from: string, to: string, conversionMetricId: string) {
  const groupBy = type === "flow"
    ? ["flow_message_id", "flow_id", "flow_message_name", "flow_name", "send_channel"]
    : ["campaign_message_id", "campaign_id", "campaign_message_name", "send_channel"];
  const body = await request<ReportResponse>(`/${type}-values-reports/`, { method: "POST", body: JSON.stringify({ data: { type: `${type}-values-report`, attributes: { timeframe: { start: `${from}T00:00:00Z`, end: `${to}T23:59:59Z` }, conversion_metric_id: conversionMetricId, statistics, group_by: groupBy } } }) });
  return body.data?.attributes?.results ?? [];
}

function rows(results: ReportResult[], type: "flow" | "campaign") {
  return results.map((result): KlaviyoPerformance => {
    const group = result.groupings ?? {}; const stat = result.statistics ?? {};
    return {
      id: group[`${type}_message_id`] ?? group[`${type}_id`] ?? "unknown",
      name: group[`${type}_message_name`] ?? group[`${type}_name`] ?? `Unnamed ${type}`,
      parentId: group[`${type}_id`], parentName: group[`${type}_name`],
      channel: group.send_channel ?? "unknown", recipients: stat.recipients ?? 0, delivered: stat.delivered ?? 0,
      openRate: stat.open_rate ?? 0, clickRate: stat.click_rate ?? 0, conversions: stat.conversion_uniques ?? 0,
      conversionRate: stat.conversion_rate ?? 0, revenue: stat.conversion_value ?? 0, revenuePerRecipient: stat.revenue_per_recipient ?? 0,
      unsubscribeRate: stat.unsubscribe_rate ?? 0, spamComplaintRate: stat.spam_complaint_rate ?? 0,
    };
  });
}

function combine(name: string, source: KlaviyoPerformance[]): KlaviyoPerformance {
  const delivered = source.reduce((sum, row) => sum + row.delivered, 0);
  const recipients = source.reduce((sum, row) => sum + row.recipients, 0);
  const weighted = (key: "openRate" | "clickRate" | "unsubscribeRate" | "spamComplaintRate") => delivered ? source.reduce((sum, row) => sum + row[key] * row.delivered, 0) / delivered : 0;
  const conversions = source.reduce((sum, row) => sum + row.conversions, 0); const revenue = source.reduce((sum, row) => sum + row.revenue, 0);
  return { id: name, name, channel: "mixed", recipients, delivered, openRate: weighted("openRate"), clickRate: weighted("clickRate"), conversions, conversionRate: delivered ? conversions / delivered : 0, revenue, revenuePerRecipient: delivered ? revenue / delivered : 0, unsubscribeRate: weighted("unsubscribeRate"), spamComplaintRate: weighted("spamComplaintRate") };
}

async function metricCount(metricId: string | undefined, from: string, to: string) {
  if (!metricId) return 0;
  const body = await request<AggregateResponse>("/metric-aggregates/", { method: "POST", body: JSON.stringify({ data: { type: "metric-aggregate", attributes: { measurements: ["count"], filter: [`greater-or-equal(datetime,${from}T00:00:00)`, `less-than(datetime,${to}T23:59:59)`], metric_id: metricId, interval: "day", timezone: "America/Los_Angeles" } } }) });
  return (body.data?.attributes?.data ?? []).reduce((sum, row) => sum + (row.measurements?.count ?? []).reduce((inner, value) => inner + value, 0), 0);
}

type KlaviyoLookupContext = {
  placedOrderId: string;
  subscribedMetricId?: string;
  unsubscribedMetricId?: string;
  currentEmailListSize: number;
};

let lookupContextPromise: Promise<KlaviyoLookupContext> | null = null;

export function createKlaviyoSyncContext(): Promise<KlaviyoLookupContext> {
  if (!lookupContextPromise) lookupContextPromise = (async () => {
  const [metrics, lists] = await Promise.all([allPages("/metrics/"), allPages("/lists/?page%5Bsize%5D=10")]);
  const metricId = (name: string) => metrics.find((item) => item.attributes?.name === name)?.id;
  const placedOrderId = metricId("Placed Order");
  if (!placedOrderId) throw new Error("Klaviyo Placed Order metric was not found");
    const emailList = lists.find((item) => /email/i.test(String(item.attributes?.name ?? "")));
    const currentEmailListSize = emailList ? (await allPages(`/lists/${emailList.id}/profiles/?page%5Bsize%5D=100&fields%5Bprofile%5D=id`)).length : 0;
    return { placedOrderId, subscribedMetricId: metricId("Subscribed to Email Marketing"), unsubscribedMetricId: metricId("Unsubscribed from Email Marketing"), currentEmailListSize };
  })();
  return lookupContextPromise;
}

export async function getKlaviyoSummaryWithContext(from: string, to: string, context: KlaviyoLookupContext): Promise<KlaviyoSummary> {
  const flowResults = await report("flow", from, to, context.placedOrderId);
  const campaignResults = await report("campaign", from, to, context.placedOrderId);
  const subscribed = await metricCount(context.subscribedMetricId, from, to);
  const unsubscribed = await metricCount(context.unsubscribedMetricId, from, to);
  const flowMessages = rows(flowResults, "flow");
  const campaignMessages = rows(campaignResults, "campaign").sort((a, b) => b.revenue - a.revenue || b.recipients - a.recipients);
  const flowNames = new Map(flowResults.map((result) => [result.groupings?.flow_message_id ?? "", result.groupings?.flow_name ?? "Unnamed flow"]));
  const groupedFlows = new Map<string, KlaviyoPerformance[]>();
  for (const row of flowMessages) { const name = flowNames.get(row.id) ?? "Unnamed flow"; groupedFlows.set(name, [...(groupedFlows.get(name) ?? []), row]); }
  const flows = Array.from(groupedFlows.entries()).map(([name, grouped]) => combine(name, grouped)).sort((a, b) => b.revenue - a.revenue || b.recipients - a.recipients);
  const abandonedRows = flows.filter((flow) => /added to cart|abandon.*(?:cart|checkout)/i.test(flow.name));
  const abandoned = combine("Abandoned cart", abandonedRows);
  const welcome = flows.filter((flow) => /welcome/i.test(flow.name));
  const postPurchase = flows.filter((flow) => /post.?purchase|order confirmation|thank.?you/i.test(flow.name));
  const other = flows.filter((flow) => !abandonedRows.includes(flow) && !welcome.includes(flow) && !postPurchase.includes(flow));
  const allPerformance = [...campaignMessages, ...flowMessages]; const delivered = allPerformance.reduce((sum, row) => sum + row.delivered, 0);
  const weightedRate = (key: "unsubscribeRate" | "spamComplaintRate") => delivered ? allPerformance.reduce((sum, row) => sum + row[key] * row.delivered, 0) / delivered : 0;
  const currentEmailListSize = context.currentEmailListSize;
  const netGrowth = subscribed - unsubscribed; const estimatedStart = Math.max(currentEmailListSize - netGrowth, 0);
  return {
    source: "klaviyo", from, to,
    attributedRevenue: allPerformance.reduce((sum, row) => sum + row.revenue, 0),
    abandonedCart: { triggered: abandoned.recipients, completed: abandoned.conversions, recoveryRate: abandoned.recipients ? abandoned.conversions / abandoned.recipients : 0, revenueRecovered: abandoned.revenue },
    campaigns: campaignMessages, flows, flowMessages,
    flowGroups: [{ key: "welcome", name: "Welcome series", rows: welcome }, { key: "post_purchase", name: "Post-purchase", rows: postPurchase }, { key: "other", name: "Other live flows", rows: other }],
    listHealth: { currentEmailListSize, subscribed, unsubscribed, netGrowth, growthRate: estimatedStart ? netGrowth / estimatedStart : null, unsubscribeRate: weightedRate("unsubscribeRate"), spamComplaintRate: weightedRate("spamComplaintRate") },
  };
}

export async function getKlaviyoSummary(from: string, to: string): Promise<KlaviyoSummary> {
  return getKlaviyoSummaryWithContext(from, to, await createKlaviyoSyncContext());
}

function addDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

async function metricSeries(metricId: string | undefined, from: string, to: string): Promise<Map<string, number>> {
  if (!metricId) return new Map();
  const body = await request<MetricSeriesResponse>("/metric-aggregates/", {
    method: "POST",
    body: JSON.stringify({ data: { type: "metric-aggregate", attributes: {
      measurements: ["count"],
      filter: [`greater-or-equal(datetime,${from}T00:00:00)`, `less-than(datetime,${addDay(to)}T00:00:00)`],
      metric_id: metricId,
      interval: "day",
      timezone: "America/Los_Angeles",
      page_size: 500,
    } } }),
  });
  const dates = body.data?.attributes?.dates ?? [];
  const counts = body.data?.attributes?.data?.[0]?.measurements?.count ?? [];
  return new Map(dates.map((date, index) => [date.slice(0, 10), counts[index] ?? 0]));
}

export async function getKlaviyoHistoricalRange(from: string, to: string): Promise<KlaviyoHistoricalRange> {
  if ((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000 > 366) {
    throw new Error("Klaviyo historical report ranges cannot exceed one year");
  }
  const context = await createKlaviyoSyncContext();
  const campaignItems = await allPages(`/campaigns/?filter=${encodeURIComponent('equals(messages.channel,"email")')}&page%5Bsize%5D=50`);
  const campaignMeta = new Map(campaignItems.map((item) => [item.id, item.attributes ?? {}]));
  const campaignResults = await report("campaign", from, to, context.placedOrderId);

  const seriesResponses: SeriesResponse[] = [];
  for (let chunkFrom = from; chunkFrom <= to; chunkFrom = shiftDay(chunkFrom, 60)) {
    const candidateTo = shiftDay(chunkFrom, 59);
    const chunkTo = candidateTo < to ? candidateTo : to;
    // Reporting endpoints allow only two steady requests per minute.
    await new Promise((resolve) => setTimeout(resolve, 30_500));
    seriesResponses.push(await request<SeriesResponse>("/flow-series-reports/", {
      method: "POST",
      body: JSON.stringify({ data: { type: "flow-series-report", attributes: {
        timeframe: { start: `${chunkFrom}T00:00:00Z`, end: `${chunkTo}T23:59:59Z` },
        interval: "daily",
        conversion_metric_id: context.placedOrderId,
        statistics,
        group_by: ["flow_message_id", "flow_id", "flow_message_name", "flow_name", "send_channel"],
      } } }),
    }));
  }

  const campaigns = rows(campaignResults, "campaign").flatMap((row) => {
    const meta = campaignMeta.get(row.parentId ?? "");
    const timestamp = String(meta?.send_time ?? meta?.scheduled_at ?? meta?.created_at ?? "");
    return timestamp ? [{ ...row, name: String(meta?.name ?? row.name), date: timestamp.slice(0, 10) }] : [];
  });
  const flowMessages: Array<KlaviyoPerformance & { date: string }> = [];
  for (const series of seriesResponses) {
    const dateTimes = series.data?.attributes?.date_times ?? [];
    for (const result of series.data?.attributes?.results ?? []) {
      const group = result.groupings ?? {}; const stats = result.statistics ?? {};
      for (let index = 0; index < dateTimes.length; index += 1) {
        const value = (key: string) => stats[key]?.[index] ?? 0;
        const recipients = value("recipients"); const delivered = value("delivered"); const conversions = value("conversion_uniques"); const revenue = value("conversion_value");
        if (![recipients, delivered, conversions, revenue, value("open_rate"), value("click_rate")].some(Boolean)) continue;
        flowMessages.push({
          id: group.flow_message_id ?? group.flow_id ?? "unknown", parentId: group.flow_id, parentName: group.flow_name,
          name: group.flow_message_name ?? group.flow_name ?? "Unnamed flow", channel: group.send_channel ?? "unknown",
          recipients, delivered, openRate: value("open_rate"), clickRate: value("click_rate"), conversions,
          conversionRate: value("conversion_rate"), revenue, revenuePerRecipient: value("revenue_per_recipient"),
          unsubscribeRate: value("unsubscribe_rate"), spamComplaintRate: value("spam_complaint_rate"), date: dateTimes[index].slice(0, 10),
        });
      }
    }
  }

  const [subscribed, unsubscribed] = await Promise.all([
    metricSeries(context.subscribedMetricId, from, to),
    metricSeries(context.unsubscribedMetricId, from, to),
  ]);
  const dateList: string[] = [];
  for (let day = from; day <= to; day = addDay(day)) dateList.push(day);
  let size = context.currentEmailListSize;
  const listHealth = [...dateList].reverse().map((date) => {
    const added = subscribed.get(date) ?? 0; const removed = unsubscribed.get(date) ?? 0; const netGrowth = added - removed;
    const row = { date, currentEmailListSize: size, subscribed: added, unsubscribed: removed, netGrowth };
    size = Math.max(size - netGrowth, 0);
    return row;
  }).reverse();
  return { campaigns, flowMessages, listHealth };
}
