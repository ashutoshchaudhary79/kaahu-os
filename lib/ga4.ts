import { createSign } from "node:crypto";

const CHANNELS = ["Organic Search", "Direct", "Paid Social", "Email", "Referral"] as const;
const FUNNEL_EVENTS = ["view_item", "add_to_cart", "begin_checkout", "purchase"] as const;

type Value = { value?: string };
type ReportRow = { dimensionValues?: Value[]; metricValues?: Value[] };
type ReportResponse = { rows?: ReportRow[]; error?: { message?: string } };
type ReportRequest = {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  dimensionFilter?: unknown;
  limit?: string;
  orderBys?: unknown[];
};

export type Ga4Summary = {
  source: "ga4";
  from: string;
  to: string;
  totals: { sessions: number; users: number; newUsers: number; returningUsers: number; purchases: number; revenue: number; conversionRate: number };
  dailyChannels: Array<{ date: string; channel: string; visitorType: string; sessions: number; users: number; newUsers: number; purchases: number; revenue: number }>;
  funnel: Array<{ event: string; events: number; stepRate: number | null; sessionRate: number }>;
  channels: Array<{ channel: string; sessions: number; users: number; purchases: number; conversionRate: number; revenue: number }>;
  devices: Array<{ device: string; sessions: number; users: number; purchases: number; conversionRate: number; revenue: number }>;
  landingPages: Array<{ page: string; sessions: number; users: number; engagementRate: number; bounceRate: number; viewItem: number; addToCart: number; beginCheckout: number; purchases: number }>;
};

export type Ga4DailyBreakdowns = {
  funnel: Array<{ date: string; event: string; events: number }>;
  devices: Array<{ date: string; device: string; sessions: number; users: number; purchases: number; revenue: number }>;
  landingPages: Array<{ date: string; page: string; sessions: number; users: number; engagementRate: number; bounceRate: number; viewItem: number; addToCart: number; beginCheckout: number; purchases: number }>;
};

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function requiredEnv(name: "GA4_PROPERTY_ID" | "GA4_CLIENT_EMAIL" | "GA4_PRIVATE_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function privateKey() {
  let value = requiredEnv("GA4_PRIVATE_KEY");
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  value = value.replace(/\\r?\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  if (!value.includes("-----BEGIN PRIVATE KEY-----") || !value.includes("-----END PRIVATE KEY-----")) {
    throw new Error("GA4_PRIVATE_KEY is not a valid PEM private key");
  }
  return value;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: requiredEnv("GA4_CLIENT_EMAIL"),
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(privateKey());
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  const body = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description ?? `GA4 authentication failed (${response.status})`);
  return body.access_token;
}

async function runReport(token: string, request: ReportRequest) {
  const propertyId = requiredEnv("GA4_PROPERTY_ID").replace(/^properties\//, "");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(request),
      cache: "no-store",
    });
    const body = (await response.json()) as ReportResponse;
    const exhausted = response.status === 429 || /RESOURCE_EXHAUSTED/i.test(body.error?.message ?? "");
    if (exhausted && attempt < 4) {
      await sleep(2_000 * (2 ** attempt));
      continue;
    }
    if (!response.ok || body.error) throw new Error(body.error?.message ?? `GA4 report failed (${response.status})`);
    return body.rows ?? [];
  }
  throw new Error("GA4 quota remained exhausted after retries");
}

const numberAt = (row: ReportRow, index: number) => Number(row.metricValues?.[index]?.value ?? 0);
const textAt = (row: ReportRow, index: number) => row.dimensionValues?.[index]?.value ?? "(not set)";
const eventFilter = { filter: { fieldName: "eventName", inListFilter: { values: [...FUNNEL_EVENTS] } } };
const ga4Date = (value: string) => value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");

export async function getGa4DailyBreakdowns(from: string, to: string): Promise<Ga4DailyBreakdowns> {
  const token = await accessToken();
  const dateRanges = [{ startDate: from, endDate: to }];
  const [funnelRows, deviceRows, landingRows, landingEventRows] = await Promise.all([
    runReport(token, { dateRanges, dimensions: [{ name: "date" }, { name: "eventName" }], metrics: [{ name: "eventCount" }], dimensionFilter: eventFilter, limit: "100000" }),
    runReport(token, { dateRanges, dimensions: [{ name: "date" }, { name: "deviceCategory" }], metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }], limit: "100000" }),
    runReport(token, { dateRanges, dimensions: [{ name: "date" }, { name: "landingPage" }], metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "engagementRate" }, { name: "bounceRate" }], limit: "100000" }),
    runReport(token, { dateRanges, dimensions: [{ name: "date" }, { name: "landingPage" }, { name: "eventName" }], metrics: [{ name: "eventCount" }], dimensionFilter: eventFilter, limit: "100000" }),
  ]);
  const eventsByPageDay = new Map<string, Record<string, number>>();
  for (const row of landingEventRows) {
    const key = `${textAt(row, 0)}\0${textAt(row, 1)}`;
    const events = eventsByPageDay.get(key) ?? {};
    events[textAt(row, 2)] = numberAt(row, 0);
    eventsByPageDay.set(key, events);
  }
  return {
    funnel: funnelRows.map((row) => ({ date: ga4Date(textAt(row, 0)), event: textAt(row, 1), events: numberAt(row, 0) })),
    devices: deviceRows.map((row) => ({ date: ga4Date(textAt(row, 0)), device: textAt(row, 1), sessions: numberAt(row, 0), users: numberAt(row, 1), purchases: numberAt(row, 2), revenue: numberAt(row, 3) })),
    landingPages: landingRows.map((row) => {
      const rawDate = textAt(row, 0); const page = textAt(row, 1); const events = eventsByPageDay.get(`${rawDate}\0${page}`) ?? {};
      return { date: ga4Date(rawDate), page, sessions: numberAt(row, 0), users: numberAt(row, 1), engagementRate: numberAt(row, 2), bounceRate: numberAt(row, 3), viewItem: events.view_item ?? 0, addToCart: events.add_to_cart ?? 0, beginCheckout: events.begin_checkout ?? 0, purchases: events.purchase ?? 0 };
    }),
  };
}

export async function getGa4Summary(from: string, to: string): Promise<Ga4Summary> {
  const token = await accessToken();
  const dateRanges = [{ startDate: from, endDate: to }];
  const [totalRows, audienceRows, dailyRows, funnelRows, channelRows, deviceRows, landingRows, landingEventRows] = await Promise.all([
    runReport(token, { dateRanges, dimensions: [], metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "newUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }] }),
    runReport(token, { dateRanges, dimensions: [{ name: "newVsReturning" }], metrics: [{ name: "totalUsers" }] }),
    runReport(token, { dateRanges, dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }, { name: "newVsReturning" }], metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "newUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }], limit: "100000", orderBys: [{ dimension: { dimensionName: "date" } }] }),
    runReport(token, { dateRanges, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], dimensionFilter: eventFilter }),
    runReport(token, { dateRanges, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }], limit: "10000" }),
    runReport(token, { dateRanges, dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }], limit: "10000" }),
    runReport(token, { dateRanges, dimensions: [{ name: "landingPage" }], metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "engagementRate" }, { name: "bounceRate" }], limit: "10000", orderBys: [{ metric: { metricName: "sessions" }, desc: true }] }),
    runReport(token, { dateRanges, dimensions: [{ name: "landingPage" }, { name: "eventName" }], metrics: [{ name: "eventCount" }], dimensionFilter: eventFilter, limit: "100000" }),
  ]);

  const dailyChannels = dailyRows.map((row) => ({
    date: ga4Date(textAt(row, 0)), channel: textAt(row, 1), visitorType: textAt(row, 2),
    sessions: numberAt(row, 0), users: numberAt(row, 1), newUsers: numberAt(row, 2), purchases: numberAt(row, 3), revenue: numberAt(row, 4),
  }));
  const channelMap = new Map(channelRows.map((row) => [textAt(row, 0), row]));
  const channels = CHANNELS.map((channel) => {
    const row = channelMap.get(channel); const sessions = row ? numberAt(row, 0) : 0; const purchases = row ? numberAt(row, 2) : 0;
    return { channel, sessions, users: row ? numberAt(row, 1) : 0, purchases, conversionRate: sessions ? purchases / sessions : 0, revenue: row ? numberAt(row, 3) : 0 };
  });
  const devices = deviceRows.map((row) => { const sessions = numberAt(row, 0); const purchases = numberAt(row, 2); return { device: textAt(row, 0), sessions, users: numberAt(row, 1), purchases, conversionRate: sessions ? purchases / sessions : 0, revenue: numberAt(row, 3) }; });
  const eventCounts = new Map(funnelRows.map((row) => [textAt(row, 0), numberAt(row, 0)]));
  const totalRow = totalRows[0];
  const totalSessions = totalRow ? numberAt(totalRow, 0) : 0;
  const funnel = FUNNEL_EVENTS.map((event, index) => { const events = eventCounts.get(event) ?? 0; const prior = index ? eventCounts.get(FUNNEL_EVENTS[index - 1]) ?? 0 : 0; return { event, events, stepRate: index ? (prior ? events / prior : 0) : null, sessionRate: totalSessions ? events / totalSessions : 0 }; });
  const eventsByPage = new Map<string, Record<string, number>>();
  for (const row of landingEventRows) { const page = textAt(row, 0); const events = eventsByPage.get(page) ?? {}; events[textAt(row, 1)] = numberAt(row, 0); eventsByPage.set(page, events); }
  const landingPages = landingRows.map((row) => { const events = eventsByPage.get(textAt(row, 0)) ?? {}; return { page: textAt(row, 0), sessions: numberAt(row, 0), users: numberAt(row, 1), engagementRate: numberAt(row, 2), bounceRate: numberAt(row, 3), viewItem: events.view_item ?? 0, addToCart: events.add_to_cart ?? 0, beginCheckout: events.begin_checkout ?? 0, purchases: events.purchase ?? 0 }; });
  const users = totalRow ? numberAt(totalRow, 1) : 0;
  const newUsers = totalRow ? numberAt(totalRow, 2) : 0;
  const returningUsers = numberAt(audienceRows.find((row) => textAt(row, 0) === "returning") ?? {}, 0);
  const purchases = totalRow ? numberAt(totalRow, 3) : 0;
  const revenue = totalRow ? numberAt(totalRow, 4) : 0;
  return { source: "ga4", from, to, totals: { sessions: totalSessions, users, newUsers, returningUsers, purchases, revenue, conversionRate: totalSessions ? purchases / totalSessions : 0 }, dailyChannels, funnel, channels, devices, landingPages };
}
