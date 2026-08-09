const REVISION = process.env.KLAVIYO_API_REVISION?.trim() || "2026-07-15";
const BASE = "https://a.klaviyo.com/api";

type JsonApiItem = { id: string; attributes?: Record<string, unknown>; links?: { next?: string | null } };
type JsonApiResponse = { data?: JsonApiItem[] | JsonApiItem; links?: { next?: string | null }; errors?: Array<{ detail?: string; title?: string }> };
type Statistics = { recipients?: number; delivered?: number; open_rate?: number; click_rate?: number; conversion_uniques?: number; conversion_rate?: number; conversion_value?: number; revenue_per_recipient?: number; unsubscribe_rate?: number; spam_complaint_rate?: number };
type ReportResult = { groupings?: Record<string, string>; statistics?: Statistics };
type ReportResponse = { data?: { attributes?: { results?: ReportResult[] } }; errors?: Array<{ detail?: string; title?: string }> };
type AggregateResponse = { data?: { attributes?: { data?: Array<{ measurements?: Record<string, number[]> }> } }; errors?: Array<{ detail?: string; title?: string }> };

export type KlaviyoPerformance = {
  id: string; name: string; channel: string; recipients: number; delivered: number; openRate: number; clickRate: number;
  conversions: number; conversionRate: number; revenue: number; revenuePerRecipient: number; unsubscribeRate: number; spamComplaintRate: number;
};

export type KlaviyoSummary = {
  source: "klaviyo"; from: string; to: string;
  attributedRevenue: number;
  abandonedCart: { triggered: number; completed: number; recoveryRate: number; revenueRecovered: number };
  campaigns: KlaviyoPerformance[];
  flows: KlaviyoPerformance[];
  flowGroups: Array<{ key: "welcome" | "post_purchase" | "other"; name: string; rows: KlaviyoPerformance[] }>;
  listHealth: { currentEmailListSize: number; subscribed: number; unsubscribed: number; netGrowth: number; growthRate: number | null; unsubscribeRate: number; spamComplaintRate: number };
};

function apiKey() {
  const value = process.env.KLAVIYO_PRIVATE_API_KEY?.trim();
  if (!value) throw new Error("KLAVIYO_PRIVATE_API_KEY is not configured");
  return value;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url.startsWith("http") ? url : `${BASE}${url}`, {
    ...init,
    headers: { Authorization: `Klaviyo-API-Key ${apiKey()}`, accept: "application/vnd.api+json", revision: REVISION, ...(init?.body ? { "content-type": "application/vnd.api+json" } : {}), ...init?.headers },
    cache: "no-store",
  });
  const body = (await response.json()) as T & { errors?: Array<{ detail?: string; title?: string }> };
  if (!response.ok || body.errors?.length) throw new Error(body.errors?.[0]?.detail ?? body.errors?.[0]?.title ?? `Klaviyo request failed (${response.status})`);
  return body;
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

export async function getKlaviyoSummary(from: string, to: string): Promise<KlaviyoSummary> {
  const [metrics, lists] = await Promise.all([allPages("/metrics/"), allPages("/lists/?page%5Bsize%5D=10")]);
  const metricId = (name: string) => metrics.find((item) => item.attributes?.name === name)?.id;
  const placedOrderId = metricId("Placed Order");
  if (!placedOrderId) throw new Error("Klaviyo Placed Order metric was not found");
  const [flowResults, campaignResults, subscribed, unsubscribed] = await Promise.all([
    report("flow", from, to, placedOrderId), report("campaign", from, to, placedOrderId),
    metricCount(metricId("Subscribed to Email Marketing"), from, to), metricCount(metricId("Unsubscribed from Email Marketing"), from, to),
  ]);
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
  const emailList = lists.find((item) => /email/i.test(String(item.attributes?.name ?? "")));
  const currentEmailListSize = emailList ? (await allPages(`/lists/${emailList.id}/profiles/?page%5Bsize%5D=100&fields%5Bprofile%5D=id`)).length : 0;
  const netGrowth = subscribed - unsubscribed; const estimatedStart = Math.max(currentEmailListSize - netGrowth, 0);
  return {
    source: "klaviyo", from, to,
    attributedRevenue: allPerformance.reduce((sum, row) => sum + row.revenue, 0),
    abandonedCart: { triggered: abandoned.recipients, completed: abandoned.conversions, recoveryRate: abandoned.recipients ? abandoned.conversions / abandoned.recipients : 0, revenueRecovered: abandoned.revenue },
    campaigns: campaignMessages, flows,
    flowGroups: [{ key: "welcome", name: "Welcome series", rows: welcome }, { key: "post_purchase", name: "Post-purchase", rows: postPurchase }, { key: "other", name: "Other live flows", rows: other }],
    listHealth: { currentEmailListSize, subscribed, unsubscribed, netGrowth, growthRate: estimatedStart ? netGrowth / estimatedStart : null, unsubscribeRate: weightedRate("unsubscribeRate"), spamComplaintRate: weightedRate("spamComplaintRate") },
  };
}
