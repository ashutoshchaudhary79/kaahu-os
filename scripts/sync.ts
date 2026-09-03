import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import type { PoolClient } from "pg";
import { getDatabasePool } from "../lib/db";
import { getGa4DailyBreakdowns, getGa4Summary } from "../lib/ga4";
import { getKlaviyoHistoricalRange } from "../lib/klaviyo";
import { getMetaCampaignDaily, getMetaCreatives, getMetaEntityDaily, getMetaMarketDaily, MetaRateLimitError } from "../lib/meta";
import { getShopifySummary } from "../lib/shopify";

export type Source = "shopify" | "meta" | "ga4" | "klaviyo";
type RunStatus = "success" | "partial" | "failed";
type SyncResult = { rows: number; status?: RunStatus; message: string };

const SOURCES: Source[] = ["shopify", "meta", "ga4", "klaviyo"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDay(date);
}

function days(from: string, to: string): string[] {
  const result: string[] = [];
  for (let day = from; day <= to; day = shiftDay(day, 1)) result.push(day);
  return result;
}

function parseArgs() {
  const values = new Map(process.argv.slice(2).filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=")];
  }));
  const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith("--") && !arg.includes("=")));
  const sourceValue = values.get("source") ?? "all";
  if (sourceValue !== "all" && !SOURCES.includes(sourceValue as Source)) throw new Error(`Invalid --source: ${sourceValue}`);
  const from = values.get("from"); const to = values.get("to");
  if ((from && !to) || (!from && to)) throw new Error("--from and --to must be supplied together");
  if ((from && !DATE_PATTERN.test(from)) || (to && !DATE_PATTERN.test(to))) throw new Error("Dates must use YYYY-MM-DD");
  if (from && to && from > to) throw new Error("--from cannot be after --to");
  if (flags.has("--since-last") && (from || to)) throw new Error("--since-last cannot be combined with --from/--to");
  return { sources: sourceValue === "all" ? SOURCES : [sourceValue as Source], from, to, sinceLast: flags.has("--since-last"), dryRun: flags.has("--dry-run") };
}

function hashEmail(email: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized ? createHash("sha256").update(normalized).digest("hex") : null;
}

function numericId(value: string): string {
  return value.match(/\/(\d+)$/)?.[1] ?? value;
}

function redact(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const key of ["DATABASE_URL", "SHOPIFY_ACCESS_TOKEN", "SHOPIFY_API_SECRET", "META_ACCESS_TOKEN", "GA4_PRIVATE_KEY", "KLAVIYO_PRIVATE_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const secret = process.env[key];
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]");
}

async function rangeFor(source: Source, requestedFrom: string | undefined, requestedTo: string | undefined, sinceLast: boolean) {
  const today = isoDay(new Date());
  if (requestedFrom && requestedTo) return { from: requestedFrom, to: requestedTo };
  if (sinceLast) {
    const result = await getDatabasePool().query<{ range_to: string | null }>(
      "select range_to::text from sync_runs where source = $1 and status = 'success' order by range_to desc nulls last, run_at desc limit 1",
      [source],
    );
    const last = result.rows[0]?.range_to;
    return { from: last ? shiftDay(last, -3) : shiftDay(today, -3), to: today };
  }
  return { from: shiftDay(today, -3), to: today };
}

async function syncShopify(from: string, to: string, dryRun: boolean): Promise<SyncResult> {
  const summary = await getShopifySummary(from, to);
  if (!summary.hasReadAllOrders && from < shiftDay(isoDay(new Date()), -60)) {
    console.warn(`Shopify lacks read_all_orders; results before ${shiftDay(isoDay(new Date()), -60)} may be incomplete`);
  }
  const customerIds = summary.orders.filter((order) => order.customerId).length;
  const customerHashes = summary.orders.filter((order) => hashEmail(order.customerEmail)).length;
  const attributed = summary.orders.filter((order) => order.utmSource || order.utmMedium || order.utmCampaign).length;
  const lineItems = summary.orders.reduce((sum, order) => sum + order.lineItems.length, 0);
  const message = `${summary.orders.length} orders, ${lineItems} line items; customer_id ${customerIds}, customer_hash ${customerHashes}, UTM-attributed ${attributed}`;
  if (dryRun) return { rows: summary.orders.length + lineItems, message };

  const client = await getDatabasePool().connect();
  try {
    await client.query("begin");
    for (const order of summary.orders) {
      await client.query(
        `insert into shopify_orders
          (order_id, order_number, customer_id, customer_hash, customer_name, discount_codes, placed_at, financial_status, fulfillment_status,
           subtotal, discounts, total, currency, destination_city, destination_state, destination_country,
           sales_channel, item_count, landing_site, referring_site, utm_source, utm_medium, utm_campaign, attribution, synced_at)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,now())
         on conflict (order_id) do update set
           order_number=excluded.order_number,
           customer_id=coalesce(excluded.customer_id,shopify_orders.customer_id),
           customer_hash=coalesce(excluded.customer_hash,shopify_orders.customer_hash),
           customer_name=coalesce(excluded.customer_name,shopify_orders.customer_name),
           discount_codes=excluded.discount_codes,
           placed_at=excluded.placed_at, financial_status=excluded.financial_status,
           fulfillment_status=excluded.fulfillment_status, subtotal=excluded.subtotal,
           discounts=excluded.discounts, total=excluded.total, currency=excluded.currency,
           destination_city=coalesce(excluded.destination_city,shopify_orders.destination_city),
           destination_state=coalesce(excluded.destination_state,shopify_orders.destination_state),
           destination_country=coalesce(excluded.destination_country,shopify_orders.destination_country),
           sales_channel=coalesce(excluded.sales_channel,shopify_orders.sales_channel), item_count=excluded.item_count,
           landing_site=coalesce(excluded.landing_site,shopify_orders.landing_site),
           referring_site=coalesce(excluded.referring_site,shopify_orders.referring_site),
           utm_source=coalesce(excluded.utm_source,shopify_orders.utm_source),
           utm_medium=coalesce(excluded.utm_medium,shopify_orders.utm_medium),
           utm_campaign=coalesce(excluded.utm_campaign,shopify_orders.utm_campaign),
           attribution=coalesce(excluded.attribution,shopify_orders.attribution), synced_at=now()`,
        [numericId(order.id), order.name, order.customerId, hashEmail(order.customerEmail), order.customer, JSON.stringify(order.discountCodes), order.createdAt,
          order.financialStatus.toLowerCase(), order.fulfillmentStatus.toLowerCase(), order.subtotal, order.discounts,
          order.total, summary.currency, order.city === "—" ? null : order.city, order.region === "—" ? null : order.region,
          order.country === "—" ? null : order.country, order.channel, order.itemQuantity, order.landingSite,
          order.referringSite, order.utmSource, order.utmMedium, order.utmCampaign,
          order.attribution ? JSON.stringify(order.attribution) : null],
      );
      await client.query("delete from shopify_order_line_items where order_id = $1", [numericId(order.id)]);
      for (const item of order.lineItems) await client.query(
        `insert into shopify_order_line_items (order_id,product_id,variant_id,product_title,variant_title,quantity,price)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [numericId(order.id), item.productId, item.variantId, item.productTitle, item.variantTitle, item.quantity, item.price],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback"); throw error;
  } finally { client.release(); }
  return { rows: summary.orders.length + lineItems, message };
}

async function syncMeta(from: string, to: string, dryRun: boolean): Promise<SyncResult> {
  const [campaignRows, adsetRows, adRows, creatives, stateRows, comscoreRows] = await Promise.all([
    getMetaCampaignDaily(from, to), getMetaEntityDaily(from, to, "adset"), getMetaEntityDaily(from, to, "ad"),
    getMetaCreatives(), getMetaMarketDaily(from, to, "state"), getMetaMarketDaily(from, to, "comscore"),
  ]);
  const totalRows = campaignRows.length + adsetRows.length + adRows.length + creatives.length + stateRows.length + comscoreRows.length;
  const message = `${campaignRows.length} campaign-days, ${adsetRows.length} ad-set days, ${adRows.length} ad-days, ${creatives.length} creatives, ${stateRows.length} state-days, ${comscoreRows.length} market-days`;
  if (dryRun) return { rows: totalRows, message };
  const client = await getDatabasePool().connect();
  try {
    await client.query("begin");
    const campaigns = new Map(campaignRows.map((row) => [row.campaignId, row]));
    await client.query(
      `insert into ad_campaigns (platform,campaign_id,name,objective,updated_at)
       select 'meta',x.campaign_id,x.name,x.objective,now()
       from jsonb_to_recordset($1::jsonb) as x(campaign_id text,name text,objective text)
       on conflict (platform,campaign_id) do update set name=excluded.name,objective=excluded.objective,updated_at=now()`,
      [JSON.stringify(Array.from(campaigns.values()).map((row) => ({ campaign_id: row.campaignId, name: row.campaignName, objective: row.objective })))],
    );
    await client.query(
      `insert into channel_spend_daily
        (date,platform,campaign_id,spend,impressions,reach,link_clicks,landing_page_views,add_to_cart,checkout_initiated,platform_reported_purchases,platform_reported_purchase_value,synced_at)
       select x.date::date,'meta',x.campaign_id,x.spend,x.impressions,x.reach,x.link_clicks,x.landing_page_views,x.add_to_cart,x.checkout_initiated,x.purchases,x.purchase_value,now()
       from jsonb_to_recordset($1::jsonb) as x(date text,campaign_id text,spend numeric,impressions bigint,reach bigint,link_clicks bigint,landing_page_views bigint,add_to_cart bigint,checkout_initiated bigint,purchases integer,purchase_value numeric)
       on conflict (date,platform,campaign_id) do update set spend=excluded.spend,impressions=excluded.impressions,
       reach=excluded.reach,link_clicks=excluded.link_clicks,landing_page_views=excluded.landing_page_views,
       add_to_cart=excluded.add_to_cart,checkout_initiated=excluded.checkout_initiated,platform_reported_purchases=excluded.platform_reported_purchases,
       platform_reported_purchase_value=excluded.platform_reported_purchase_value,synced_at=now()`,
      [JSON.stringify(campaignRows.map((row) => ({ date: row.date, campaign_id: row.campaignId, spend: row.spend, impressions: row.impressions, reach: row.reach, link_clicks: row.clicks, landing_page_views: row.landingPageViews, add_to_cart: row.addToCart, checkout_initiated: row.checkoutInitiated, purchases: row.purchases, purchase_value: row.purchaseValue })))],
    );
    await client.query(
      `insert into meta_entity_daily
       (date,level,entity_id,parent_id,campaign_id,name,campaign_name,objective,spend,impressions,reach,link_clicks,landing_page_views,add_to_cart,checkout_initiated,purchases,purchase_value,synced_at)
       select x.date::date,x.level,x.entity_id,x.parent_id,x.campaign_id,x.name,x.campaign_name,x.objective,x.spend,x.impressions,x.reach,x.link_clicks,x.landing_page_views,x.add_to_cart,x.checkout_initiated,x.purchases,x.purchase_value,now()
       from jsonb_to_recordset($1::jsonb) as x(date text,level text,entity_id text,parent_id text,campaign_id text,name text,campaign_name text,objective text,spend numeric,impressions bigint,reach bigint,link_clicks bigint,landing_page_views bigint,add_to_cart bigint,checkout_initiated bigint,purchases integer,purchase_value numeric)
       on conflict (date,level,entity_id) do update set parent_id=excluded.parent_id,campaign_id=excluded.campaign_id,name=excluded.name,campaign_name=excluded.campaign_name,objective=excluded.objective,spend=excluded.spend,impressions=excluded.impressions,reach=excluded.reach,link_clicks=excluded.link_clicks,landing_page_views=excluded.landing_page_views,add_to_cart=excluded.add_to_cart,checkout_initiated=excluded.checkout_initiated,purchases=excluded.purchases,purchase_value=excluded.purchase_value,synced_at=now()`,
      [JSON.stringify([...adsetRows, ...adRows].map((row) => ({ date: row.date, level: row.level, entity_id: row.entityId, parent_id: row.parentId, campaign_id: row.campaignId, name: row.name, campaign_name: row.campaignName, objective: row.objective, spend: row.spend, impressions: row.impressions, reach: row.reach, link_clicks: row.clicks, landing_page_views: row.landingPageViews, add_to_cart: row.addToCart, checkout_initiated: row.checkoutInitiated, purchases: row.purchases, purchase_value: row.purchaseValue })))],
    );
    await client.query(
      `insert into meta_ad_creatives (ad_id,campaign_id,ad_name,creative_id,thumbnail_url,synced_at)
       select x.ad_id,x.campaign_id,x.ad_name,x.creative_id,x.thumbnail_url,now()
       from jsonb_to_recordset($1::jsonb) as x(ad_id text,campaign_id text,ad_name text,creative_id text,thumbnail_url text)
       on conflict (ad_id) do update set campaign_id=excluded.campaign_id,ad_name=excluded.ad_name,
       creative_id=excluded.creative_id,thumbnail_url=excluded.thumbnail_url,synced_at=now()`,
      [JSON.stringify(creatives.map((row) => ({ ad_id: row.adId, campaign_id: row.campaignId, ad_name: row.adName, creative_id: row.creativeId, thumbnail_url: row.thumbnailUrl })))],
    );
    for (const [dimension, rows] of [["state", stateRows], ["comscore_market", comscoreRows]] as const) {
      await client.query(
        `insert into channel_geo_spend (date,platform,dimension,geo_value,spend,impressions,link_clicks,ctr,cpm,synced_at)
         select x.date::date,'meta',$2,x.geo_value,x.spend,x.impressions,x.link_clicks,x.ctr,x.cpm,now()
         from jsonb_to_recordset($1::jsonb) as x(date text,geo_value text,spend numeric,impressions bigint,link_clicks bigint,ctr numeric,cpm numeric)
         on conflict (date,platform,dimension,geo_value) do update set
         spend=excluded.spend,impressions=excluded.impressions,link_clicks=excluded.link_clicks,ctr=excluded.ctr,cpm=excluded.cpm,synced_at=now()`,
        [JSON.stringify(rows.map((row) => ({ date: row.date, geo_value: row.name, spend: row.spend, impressions: row.impressions, link_clicks: row.clicks, ctr: row.ctr, cpm: row.cpm }))), dimension],
      );
    }
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  return { rows: totalRows, message };
}

async function syncGa4(from: string, to: string, dryRun: boolean): Promise<SyncResult> {
  const summary = await getGa4Summary(from, to);
  const breakdowns = await getGa4DailyBreakdowns(from, to);
  const rows = summary.dailyChannels.length + breakdowns.funnel.length + breakdowns.devices.length + breakdowns.landingPages.length;
  const message = `${summary.dailyChannels.length} channel-days, ${breakdowns.funnel.length} funnel rows, ${breakdowns.devices.length} device rows, ${breakdowns.landingPages.length} landing-page rows`;
  if (dryRun) return { rows, message };
  const client = await getDatabasePool().connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into ga4_channel_daily (date,channel,visitor_type,sessions,users,new_users,purchases,revenue,synced_at)
       select x.date::date,x.channel,x.visitor_type,x.sessions,x.users,x.new_users,x.purchases,x.revenue,now()
       from jsonb_to_recordset($1::jsonb) as x(date text,channel text,visitor_type text,sessions integer,users integer,new_users integer,purchases integer,revenue numeric)
       on conflict (date,channel,visitor_type) do update set sessions=excluded.sessions,users=excluded.users,new_users=excluded.new_users,purchases=excluded.purchases,revenue=excluded.revenue,synced_at=now()`,
      [JSON.stringify(summary.dailyChannels.map((row) => ({ date: row.date, channel: row.channel, visitor_type: row.visitorType, sessions: row.sessions, users: row.users, new_users: row.newUsers, purchases: row.purchases, revenue: row.revenue })))],
    );
    await client.query(
      `insert into ga4_funnel_daily (date,event,events,synced_at)
       select x.date::date,x.event,x.events,now() from jsonb_to_recordset($1::jsonb) as x(date text,event text,events integer)
       on conflict (date,event) do update set events=excluded.events,synced_at=now()`,
      [JSON.stringify(breakdowns.funnel)],
    );
    await client.query(
      `insert into ga4_device_daily (date,device,sessions,users,purchases,revenue,synced_at)
       select x.date::date,x.device,x.sessions,x.users,x.purchases,x.revenue,now()
       from jsonb_to_recordset($1::jsonb) as x(date text,device text,sessions integer,users integer,purchases integer,revenue numeric)
       on conflict (date,device) do update set sessions=excluded.sessions,users=excluded.users,purchases=excluded.purchases,revenue=excluded.revenue,synced_at=now()`,
      [JSON.stringify(breakdowns.devices)],
    );
    await client.query(
      `insert into ga4_landing_page_daily (date,page,sessions,users,engagement_rate,bounce_rate,view_item,add_to_cart,begin_checkout,purchases,synced_at)
       select x.date::date,x.page,x.sessions,x.users,x.engagement_rate,x.bounce_rate,x.view_item,x.add_to_cart,x.begin_checkout,x.purchases,now()
       from jsonb_to_recordset($1::jsonb) as x(date text,page text,sessions integer,users integer,engagement_rate numeric,bounce_rate numeric,view_item integer,add_to_cart integer,begin_checkout integer,purchases integer)
       on conflict (date,page) do update set sessions=excluded.sessions,users=excluded.users,engagement_rate=excluded.engagement_rate,
       bounce_rate=excluded.bounce_rate,view_item=excluded.view_item,add_to_cart=excluded.add_to_cart,begin_checkout=excluded.begin_checkout,
       purchases=excluded.purchases,synced_at=now()`,
      [JSON.stringify(breakdowns.landingPages.map((row) => ({ date: row.date, page: row.page, sessions: row.sessions, users: row.users, engagement_rate: row.engagementRate, bounce_rate: row.bounceRate, view_item: row.viewItem, add_to_cart: row.addToCart, begin_checkout: row.beginCheckout, purchases: row.purchases })))],
    );
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  return { rows, message };
}

async function syncKlaviyo(from: string, to: string, dryRun: boolean): Promise<SyncResult> {
  const history = await getKlaviyoHistoricalRange(from, to);
  const rows = history.campaigns.length + history.flowMessages.length + history.listHealth.length;
  const message = `${history.campaigns.length} campaigns, ${history.flowMessages.length} flow message-days, ${history.listHealth.length} list-health days`;
  if (dryRun) return { rows, message };
  const client = await getDatabasePool().connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into klaviyo_campaign_daily (date,campaign_message_id,campaign_id,name,channel,recipients,delivered,open_rate,click_rate,conversions,conversion_rate,revenue,revenue_per_recipient,unsubscribe_rate,spam_complaint_rate,synced_at)
       select x.date::date,x.message_id,x.campaign_id,x.name,x.channel,x.recipients,x.delivered,x.open_rate,x.click_rate,x.conversions,x.conversion_rate,x.revenue,x.revenue_per_recipient,x.unsubscribe_rate,x.spam_complaint_rate,now()
       from jsonb_to_recordset($1::jsonb) as x(date text,message_id text,campaign_id text,name text,channel text,recipients integer,delivered integer,open_rate numeric,click_rate numeric,conversions integer,conversion_rate numeric,revenue numeric,revenue_per_recipient numeric,unsubscribe_rate numeric,spam_complaint_rate numeric)
       on conflict (date,campaign_message_id) do update set campaign_id=excluded.campaign_id,name=excluded.name,channel=excluded.channel,recipients=excluded.recipients,delivered=excluded.delivered,open_rate=excluded.open_rate,click_rate=excluded.click_rate,conversions=excluded.conversions,conversion_rate=excluded.conversion_rate,revenue=excluded.revenue,revenue_per_recipient=excluded.revenue_per_recipient,unsubscribe_rate=excluded.unsubscribe_rate,spam_complaint_rate=excluded.spam_complaint_rate,synced_at=now()`,
      [JSON.stringify(history.campaigns.map((row) => ({ date: row.date, message_id: row.id, campaign_id: row.parentId, name: row.name, channel: row.channel, recipients: row.recipients, delivered: row.delivered, open_rate: row.openRate, click_rate: row.clickRate, conversions: row.conversions, conversion_rate: row.conversionRate, revenue: row.revenue, revenue_per_recipient: row.revenuePerRecipient, unsubscribe_rate: row.unsubscribeRate, spam_complaint_rate: row.spamComplaintRate })))],
    );
    await client.query(
      `insert into klaviyo_flow_daily (date,flow_message_id,flow_id,flow_name,message_name,channel,recipients,delivered,open_rate,click_rate,conversions,conversion_rate,revenue,revenue_per_recipient,unsubscribe_rate,spam_complaint_rate,synced_at)
       select x.date::date,x.message_id,x.flow_id,x.flow_name,x.message_name,x.channel,x.recipients,x.delivered,x.open_rate,x.click_rate,x.conversions,x.conversion_rate,x.revenue,x.revenue_per_recipient,x.unsubscribe_rate,x.spam_complaint_rate,now()
       from jsonb_to_recordset($1::jsonb) as x(date text,message_id text,flow_id text,flow_name text,message_name text,channel text,recipients integer,delivered integer,open_rate numeric,click_rate numeric,conversions integer,conversion_rate numeric,revenue numeric,revenue_per_recipient numeric,unsubscribe_rate numeric,spam_complaint_rate numeric)
       on conflict (date,flow_message_id) do update set flow_id=excluded.flow_id,flow_name=excluded.flow_name,message_name=excluded.message_name,channel=excluded.channel,recipients=excluded.recipients,delivered=excluded.delivered,open_rate=excluded.open_rate,click_rate=excluded.click_rate,conversions=excluded.conversions,conversion_rate=excluded.conversion_rate,revenue=excluded.revenue,revenue_per_recipient=excluded.revenue_per_recipient,unsubscribe_rate=excluded.unsubscribe_rate,spam_complaint_rate=excluded.spam_complaint_rate,synced_at=now()`,
      [JSON.stringify(history.flowMessages.map((row) => ({ date: row.date, message_id: row.id, flow_id: row.parentId, flow_name: row.parentName ?? row.name, message_name: row.name, channel: row.channel, recipients: row.recipients, delivered: row.delivered, open_rate: row.openRate, click_rate: row.clickRate, conversions: row.conversions, conversion_rate: row.conversionRate, revenue: row.revenue, revenue_per_recipient: row.revenuePerRecipient, unsubscribe_rate: row.unsubscribeRate, spam_complaint_rate: row.spamComplaintRate })))],
    );
    await client.query(
      `insert into klaviyo_list_health_daily (date,current_email_list_size,subscribed,unsubscribed,net_growth,synced_at)
       select x.date::date,x.list_size,x.subscribed,x.unsubscribed,x.net_growth,now()
       from jsonb_to_recordset($1::jsonb) as x(date text,list_size integer,subscribed integer,unsubscribed integer,net_growth integer)
       on conflict (date) do update set current_email_list_size=excluded.current_email_list_size,subscribed=excluded.subscribed,unsubscribed=excluded.unsubscribed,net_growth=excluded.net_growth,synced_at=now()`,
      [JSON.stringify(history.listHealth.map((row) => ({ date: row.date, list_size: row.currentEmailListSize, subscribed: row.subscribed, unsubscribed: row.unsubscribed, net_growth: row.netGrowth })))],
    );
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  return { rows, message };
}

async function logRun(source: Source, from: string, to: string, status: RunStatus, rows: number, error?: string) {
  await getDatabasePool().query(
    "insert into sync_runs (source,range_from,range_to,status,rows_upserted,error) values ($1,$2,$3,$4,$5,$6)",
    [source, from, to, status, rows, error ?? null],
  );
}

export type SourceSyncOutcome = { source: Source; from: string; to: string; status: RunStatus; rows: number; message: string };

export async function syncLatestSources(sources: Source[] = SOURCES): Promise<SourceSyncOutcome[]> {
  return Promise.all(sources.map(async (source) => {
    const { from, to } = await rangeFor(source, undefined, undefined, true);
    try {
      const result = source === "shopify" ? await syncShopify(from, to, false)
        : source === "meta" ? await syncMeta(from, to, false)
          : source === "ga4" ? await syncGa4(from, to, false)
            : await syncKlaviyo(from, to, false);
      const status = result.status ?? "success";
      await logRun(source, from, to, status, result.rows);
      return { source, from, to, status, rows: result.rows, message: result.message };
    } catch (error) {
      const message = redact(error);
      const status = error instanceof MetaRateLimitError ? "partial" : "failed";
      await logRun(source, from, to, status, 0, message);
      return { source, from, to, status, rows: 0, message };
    }
  }));
}

async function main() {
  loadEnvConfig(process.cwd());
  const options = parseArgs();
  let failed = false;
  for (const source of options.sources) {
    const { from, to } = await rangeFor(source, options.from, options.to, options.sinceLast);
    console.log(`${source}: ${from} through ${to}${options.dryRun ? " (dry run)" : ""}`);
    try {
      const result = source === "shopify" ? await syncShopify(from, to, options.dryRun)
        : source === "meta" ? await syncMeta(from, to, options.dryRun)
          : source === "ga4" ? await syncGa4(from, to, options.dryRun)
            : await syncKlaviyo(from, to, options.dryRun);
      console.log(`${source}: ${result.message}`);
      if (!options.dryRun) await logRun(source, from, to, result.status ?? "success", result.rows);
      if (result.status === "partial") failed = true;
    } catch (error) {
      failed = true;
      const message = redact(error);
      console.error(`${source} failed: ${message}`);
      if (!options.dryRun) await logRun(source, from, to, error instanceof MetaRateLimitError ? "partial" : "failed", 0, message);
    }
  }
  await getDatabasePool().end();
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("sync.ts")) {
  main().catch((error) => { console.error(redact(error)); process.exitCode = 1; });
}
