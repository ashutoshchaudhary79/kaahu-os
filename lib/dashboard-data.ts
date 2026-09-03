import { queryDatabase } from "@/lib/db";
import type { Ga4Summary } from "@/lib/ga4";
import type { KlaviyoSummary, KlaviyoPerformance } from "@/lib/klaviyo";
import type { MetaBreakdownRow, MetaCampaignDetail, MetaMarketSummary, MetaSummary, FunnelRole } from "@/lib/meta";
import type { ShopifySummary } from "@/lib/shopify";

const n = (value: unknown) => Number(value ?? 0);
const round = (value: number, places = 2) => Math.round((value + Number.EPSILON) * 10 ** places) / 10 ** places;

function role(objective: string | null, name: string): FunnelRole {
  const value = objective?.toUpperCase() ?? "";
  if (["OUTCOME_AWARENESS", "BRAND_AWARENESS", "REACH", "VIDEO_VIEWS"].includes(value) || /awareness|tofu|reach|video/i.test(name)) return "tofu";
  if (["OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES", "STORE_VISITS"].includes(value) || /sales|sale|conversion|purchase|bofu|catalog/i.test(name)) return "sales";
  return "mofu";
}

function performance(row: Record<string, unknown>): MetaBreakdownRow {
  const spend = n(row.spend); const impressions = n(row.impressions); const reach = n(row.reach);
  const clicks = n(row.clicks); const purchases = n(row.purchases); const purchaseValue = n(row.purchase_value);
  return {
    id: String(row.id), name: String(row.name), spend, impressions, frequency: reach ? round(impressions / reach) : 0,
    clicks, landingPageViews: n(row.landing_page_views), addToCart: n(row.add_to_cart), checkoutInitiated: n(row.checkout_initiated),
    purchases, purchaseValue, ctr: impressions ? round(clicks / impressions * 100) : 0, cpc: clicks ? round(spend / clicks) : 0,
    cpm: impressions ? round(spend / impressions * 1000) : 0, roas: spend ? round(purchaseValue / spend) : 0,
    cpa: purchases ? round(spend / purchases) : null,
  };
}

export async function getShopifySummaryFromDb(from: string, to: string): Promise<ShopifySummary> {
  const [summary, daily, orders] = await Promise.all([
    queryDatabase(`select coalesce(sum(total),0) revenue,count(*)::int order_count,coalesce(mode() within group (order by currency),'USD') currency from shopify_orders where (placed_at at time zone 'America/Los_Angeles')::date between $1 and $2`, [from, to]),
    queryDatabase(`select (placed_at at time zone 'America/Los_Angeles')::date::text date,round(sum(total),2) revenue,count(*)::int orders from shopify_orders where (placed_at at time zone 'America/Los_Angeles')::date between $1 and $2 group by 1 order by 1`, [from, to]),
    queryDatabase(`select o.*,coalesce(json_agg(json_build_object('productId',li.product_id::text,'variantId',li.variant_id::text,'productTitle',li.product_title,'variantTitle',li.variant_title,'quantity',li.quantity,'price',li.price::float)) filter (where li.id is not null),'[]') line_items from shopify_orders o left join shopify_order_line_items li using(order_id) where (o.placed_at at time zone 'America/Los_Angeles')::date between $1 and $2 group by o.order_id order by o.placed_at desc`, [from, to]),
  ]);
  const total = n(summary.rows[0]?.revenue); const count = n(summary.rows[0]?.order_count);
  return { source: "shopify", from, to, currency: String(summary.rows[0]?.currency ?? "USD"), timezone: "America/Los_Angeles", revenue: total, orderCount: count, aov: count ? round(total / count) : 0, hasReadAllOrders: false,
    daily: daily.rows.map((r) => ({ date: String(r.date), revenue: n(r.revenue), orders: n(r.orders) })),
    orders: orders.rows.map((r) => {
      const storedAttribution = r.attribution as ShopifySummary["orders"][number]["attribution"] | null;
      const fallbackAttribution = (r.utm_source || r.utm_medium || r.utm_campaign || r.referring_site || r.landing_site) ? {
        ready: true, daysToConversion: null, firstVisit: null,
        lastVisit: { source: String(r.utm_source ?? "unknown"), sourceDescription: r.utm_source as string | null, referrerUrl: r.referring_site as string | null, landingPage: r.landing_site as string | null, referralCode: null, utmParameters: { source: r.utm_source as string | null, medium: r.utm_medium as string | null, campaign: r.utm_campaign as string | null, content: null, term: null } },
      } : null;
      const discountCodes = Array.isArray(r.discount_codes) ? r.discount_codes.map(String) : [];
      return { id: String(r.order_id), name: String(r.order_number), createdAt: new Date(String(r.placed_at)).toISOString(), itemQuantity: n(r.item_count), subtotal: n(r.subtotal), discounts: n(r.discounts), total: n(r.total), financialStatus: String(r.financial_status ?? "unknown"), fulfillmentStatus: String(r.fulfillment_status ?? "unknown"), channel: String(r.sales_channel ?? "Unknown source"), customer: String(r.customer_name ?? "Guest / unavailable"), discountCodes, discountCode: discountCodes.join(", ") || "—", attributionSource: String(r.utm_source ?? r.referring_site ?? "Direct / unavailable"), attribution: storedAttribution ?? fallbackAttribution, customerId: r.customer_id ? String(r.customer_id) : null, customerEmail: null, utmSource: r.utm_source as string | null, utmMedium: r.utm_medium as string | null, utmCampaign: r.utm_campaign as string | null, referringSite: r.referring_site as string | null, landingSite: r.landing_site as string | null, lineItems: r.line_items as ShopifySummary["orders"][number]["lineItems"], products: (r.line_items as Array<{productTitle:string;variantTitle:string|null;quantity:number}>).map((x) => `${x.quantity}× ${x.productTitle}${x.variantTitle ? ` · ${x.variantTitle}` : ""}`).join(", "), city: String(r.destination_city ?? "—"), region: String(r.destination_state ?? "—"), country: String(r.destination_country ?? "—") };
    }),
  };
}

export async function getMetaSummaryFromDb(from: string, to: string): Promise<MetaSummary> {
  const [dailyResult, campaignResult, adsResult] = await Promise.all([
    queryDatabase(`select date::text date,sum(spend) spend,sum(impressions) impressions,sum(link_clicks) clicks,sum(landing_page_views) landing_page_views,sum(add_to_cart) add_to_cart,sum(checkout_initiated) checkout_initiated,sum(platform_reported_purchases) purchases,sum(platform_reported_purchase_value) purchase_value from channel_spend_daily where platform='meta' and date between $1 and $2 group by date order by date`, [from, to]),
    queryDatabase(`select s.campaign_id id,max(c.name) name,max(c.objective) objective,sum(s.spend) spend,sum(s.impressions) impressions,sum(s.reach) reach,sum(s.link_clicks) clicks,sum(s.landing_page_views) landing_page_views,sum(s.add_to_cart) add_to_cart,sum(s.checkout_initiated) checkout_initiated,sum(s.platform_reported_purchases) purchases,sum(s.platform_reported_purchase_value) purchase_value from channel_spend_daily s join ad_campaigns c on c.platform=s.platform and c.campaign_id=s.campaign_id where s.platform='meta' and s.date between $1 and $2 group by s.campaign_id order by sum(s.spend) desc`, [from, to]),
    queryDatabase(`select entity_id id,max(name) name,max(campaign_name) campaign_name,max(objective) objective,sum(spend) spend,sum(impressions) impressions,sum(reach) reach,sum(link_clicks) clicks,sum(landing_page_views) landing_page_views,sum(add_to_cart) add_to_cart,sum(checkout_initiated) checkout_initiated,sum(purchases) purchases,sum(purchase_value) purchase_value from meta_entity_daily where level='ad' and date between $1 and $2 group by entity_id having sum(spend)>0 or sum(impressions)>0 or sum(link_clicks)>0 order by sum(spend) desc`, [from, to]),
  ]);
  const daily = dailyResult.rows.map((r) => ({ date: String(r.date), spend: n(r.spend), impressions: n(r.impressions), clicks: n(r.clicks), landingPageViews: n(r.landing_page_views), addToCart: n(r.add_to_cart), checkoutInitiated: n(r.checkout_initiated), purchases: n(r.purchases), purchaseValue: n(r.purchase_value) }));
  const totals = daily.reduce((a, r) => ({ spend:a.spend+r.spend,impressions:a.impressions+r.impressions,clicks:a.clicks+r.clicks,landingPageViews:a.landingPageViews+r.landingPageViews,addToCart:a.addToCart+r.addToCart,checkoutInitiated:a.checkoutInitiated+r.checkoutInitiated,purchases:a.purchases+r.purchases,purchaseValue:a.purchaseValue+r.purchaseValue }), { spend:0,impressions:0,clicks:0,landingPageViews:0,addToCart:0,checkoutInitiated:0,purchases:0,purchaseValue:0 });
  const campaigns = campaignResult.rows.map((r) => ({ ...performance(r), objective: String(r.objective ?? ""), role: role(r.objective as string | null, String(r.name)) }));
  const ads = adsResult.rows.map((r) => { const p=performance(r); return { id:p.id,name:p.name,campaignName:String(r.campaign_name ?? "Unknown campaign"),objective:String(r.objective ?? ""),role:role(r.objective as string|null,String(r.campaign_name ?? "")),spend:p.spend,impressions:p.impressions,clicks:p.clicks,landingPageViews:p.landingPageViews,addToCart:p.addToCart,checkoutInitiated:p.checkoutInitiated,purchases:p.purchases }; });
  const dailyAdRows = await queryDatabase(`select date::text date,entity_id id,max(name) name,sum(spend) spend,sum(impressions) impressions,sum(reach) reach,sum(link_clicks) clicks,sum(landing_page_views) landing_page_views,sum(add_to_cart) add_to_cart,sum(checkout_initiated) checkout_initiated,sum(purchases) purchases,sum(purchase_value) purchase_value from meta_entity_daily where level='ad' and date between $1 and $2 group by date,entity_id having sum(spend)>0 or sum(impressions)>0 or sum(link_clicks)>0 order by date,sum(spend) desc`, [from,to]);
  const adDays = new Map<string, MetaBreakdownRow[]>();
  for (const raw of dailyAdRows.rows) { const date=String(raw.date),items=adDays.get(date)??[];items.push(performance(raw));adDays.set(date,items); }
  const dailyAds = Array.from(adDays,([date,ads])=>({date,ads:ads.slice(0,3)}));
  return { source:"meta",from,to,accountId:"stored",...totals,daily,dailyAds,ads,campaigns };
}

export async function getMetaMarketsFromDb(from:string,to:string,dimension:"comscore"|"state"):Promise<MetaMarketSummary>{
  const stored=dimension==="comscore"?"comscore_market":"state";
  const result=await queryDatabase(`select geo_value name,sum(spend) spend,sum(impressions) impressions,sum(link_clicks) clicks from channel_geo_spend where platform='meta' and dimension=$3 and date between $1 and $2 group by geo_value order by sum(spend) desc`,[from,to,stored]);
  const totalSpend=result.rows.reduce((s,r)=>s+n(r.spend),0);
  return {source:"meta",from,to,totalSpend,dimension,markets:result.rows.map(r=>{const spend=n(r.spend),impressions=n(r.impressions),clicks=n(r.clicks);return{name:String(r.name),spend,spendShare:totalSpend?round(spend/totalSpend*100):0,impressions,clicks,ctr:impressions?round(clicks/impressions*100):0,cpm:impressions?round(spend/impressions*1000):0};})};
}

export async function getMetaBreakdownFromDb(from:string,to:string,level:"adset"|"ad",parentId:string):Promise<MetaBreakdownRow[]>{
  const result=await queryDatabase(`select entity_id id,max(name) name,sum(spend) spend,sum(impressions) impressions,sum(reach) reach,sum(link_clicks) clicks,sum(landing_page_views) landing_page_views,sum(add_to_cart) add_to_cart,sum(checkout_initiated) checkout_initiated,sum(purchases) purchases,sum(purchase_value) purchase_value from meta_entity_daily where level=$3 and parent_id=$4 and date between $1 and $2 group by entity_id having sum(spend)>0 or sum(impressions)>0 or sum(link_clicks)>0 order by sum(spend) desc`,[from,to,level,parentId]);
  return result.rows.map(performance);
}

export async function getMetaCampaignDetailFromDb(campaignId:string,from:string,to:string):Promise<MetaCampaignDetail>{
  const [daily,ads]=await Promise.all([
    queryDatabase(`select date::text date,sum(spend) spend,sum(impressions) impressions,sum(link_clicks) clicks,sum(landing_page_views) landing_page_views,sum(add_to_cart) add_to_cart,sum(checkout_initiated) checkout_initiated,sum(platform_reported_purchases) purchases,sum(platform_reported_purchase_value) purchase_value from channel_spend_daily where platform='meta' and campaign_id=$3 and date between $1 and $2 group by date order by date`,[from,to,campaignId]),
    queryDatabase(`select e.entity_id id,max(e.name) name,sum(e.spend) spend,max(c.thumbnail_url) thumbnail_url from meta_entity_daily e left join meta_ad_creatives c on c.ad_id=e.entity_id where e.level='ad' and e.campaign_id=$3 and e.date between $1 and $2 group by e.entity_id having sum(e.spend)>0 or sum(e.impressions)>0 or sum(e.link_clicks)>0 order by sum(e.spend) desc`,[from,to,campaignId]),
  ]);
  return{id:campaignId,from,to,daily:daily.rows.map(r=>({date:String(r.date),spend:n(r.spend),impressions:n(r.impressions),clicks:n(r.clicks),landingPageViews:n(r.landing_page_views),addToCart:n(r.add_to_cart),checkoutInitiated:n(r.checkout_initiated),purchases:n(r.purchases),purchaseValue:n(r.purchase_value)})),ads:ads.rows.map(r=>({id:String(r.id),name:String(r.name),spend:n(r.spend),thumbnailUrl:r.thumbnail_url ? String(r.thumbnail_url) : null}))};
}

export async function getGa4SummaryFromDb(from:string,to:string):Promise<Ga4Summary>{
  const [channelsResult,funnelResult,devicesResult,pagesResult]=await Promise.all([
    queryDatabase(`select date::text date,channel,visitor_type,sum(sessions) sessions,sum(users) users,sum(new_users) new_users,sum(purchases) purchases,sum(revenue) revenue from ga4_channel_daily where date between $1 and $2 group by date,channel,visitor_type order by date`,[from,to]),
    queryDatabase(`select event,sum(events) events from ga4_funnel_daily where date between $1 and $2 group by event`,[from,to]),
    queryDatabase(`select device,sum(sessions) sessions,sum(users) users,sum(purchases) purchases,sum(revenue) revenue from ga4_device_daily where date between $1 and $2 group by device order by sum(sessions) desc`,[from,to]),
    queryDatabase(`select page,sum(sessions) sessions,sum(users) users,case when sum(sessions)>0 then sum(engagement_rate*sessions)/sum(sessions) else 0 end engagement_rate,case when sum(sessions)>0 then sum(bounce_rate*sessions)/sum(sessions) else 0 end bounce_rate,sum(view_item) view_item,sum(add_to_cart) add_to_cart,sum(begin_checkout) begin_checkout,sum(purchases) purchases from ga4_landing_page_daily where date between $1 and $2 group by page order by sum(sessions) desc`,[from,to]),
  ]);
  const dailyChannels=channelsResult.rows.map(r=>({date:String(r.date),channel:String(r.channel),visitorType:String(r.visitor_type),sessions:n(r.sessions),users:n(r.users),newUsers:n(r.new_users),purchases:n(r.purchases),revenue:n(r.revenue)}));
  const channelMap=new Map<string,{sessions:number;users:number;purchases:number;revenue:number}>(); for(const r of dailyChannels){const x=channelMap.get(r.channel)??{sessions:0,users:0,purchases:0,revenue:0};x.sessions+=r.sessions;x.users+=r.users;x.purchases+=r.purchases;x.revenue+=r.revenue;channelMap.set(r.channel,x);}
  const channels=Array.from(channelMap,([channel,x])=>({channel,...x,conversionRate:x.sessions?x.purchases/x.sessions:0})).sort((a,b)=>b.sessions-a.sessions);
  const sessions=dailyChannels.reduce((s,r)=>s+r.sessions,0),users=dailyChannels.reduce((s,r)=>s+r.users,0),newUsers=dailyChannels.reduce((s,r)=>s+r.newUsers,0),returningUsers=dailyChannels.filter(r=>r.visitorType==="returning").reduce((s,r)=>s+r.users,0),purchases=dailyChannels.reduce((s,r)=>s+r.purchases,0),revenue=dailyChannels.reduce((s,r)=>s+r.revenue,0);
  const eventMap=new Map(funnelResult.rows.map(r=>[String(r.event),n(r.events)])); const events=["view_item","add_to_cart","begin_checkout","purchase"];
  return{source:"ga4",from,to,totals:{sessions,users,newUsers,returningUsers,purchases,revenue,conversionRate:sessions?purchases/sessions:0},dailyChannels,funnel:events.map((event,i)=>{const count=eventMap.get(event)??0,prior=i?(eventMap.get(events[i-1])??0):0;return{event,events:count,stepRate:i?(prior?count/prior:0):null,sessionRate:sessions?count/sessions:0};}),channels,devices:devicesResult.rows.map(r=>{const sessions=n(r.sessions),purchases=n(r.purchases);return{device:String(r.device),sessions,users:n(r.users),purchases,conversionRate:sessions?purchases/sessions:0,revenue:n(r.revenue)};}),landingPages:pagesResult.rows.map(r=>({page:String(r.page),sessions:n(r.sessions),users:n(r.users),engagementRate:n(r.engagement_rate),bounceRate:n(r.bounce_rate),viewItem:n(r.view_item),addToCart:n(r.add_to_cart),beginCheckout:n(r.begin_checkout),purchases:n(r.purchases)}))};
}

function combineKlaviyo(rows:Array<Record<string,unknown>>,idKey:string,nameKey:string):KlaviyoPerformance[]{return rows.map(r=>({id:String(r[idKey]),name:String(r[nameKey]??"Unnamed"),channel:String(r.channel??"unknown"),recipients:n(r.recipients),delivered:n(r.delivered),openRate:n(r.open_rate),clickRate:n(r.click_rate),conversions:n(r.conversions),conversionRate:n(r.conversion_rate),revenue:n(r.revenue),revenuePerRecipient:n(r.revenue_per_recipient),unsubscribeRate:n(r.unsubscribe_rate),spamComplaintRate:n(r.spam_complaint_rate)}));}
export async function getKlaviyoSummaryFromDb(from:string,to:string):Promise<KlaviyoSummary>{
  const select=(table:string,id:string,nameExpression:string)=>queryDatabase(`select ${id},max(${nameExpression}) name,max(channel) channel,sum(recipients) recipients,sum(delivered) delivered,case when sum(delivered)>0 then sum(open_rate*delivered)/sum(delivered) else 0 end open_rate,case when sum(delivered)>0 then sum(click_rate*delivered)/sum(delivered) else 0 end click_rate,sum(conversions) conversions,case when sum(delivered)>0 then sum(conversion_rate*delivered)/sum(delivered) else 0 end conversion_rate,sum(revenue) revenue,case when sum(recipients)>0 then sum(revenue)/sum(recipients) else 0 end revenue_per_recipient,case when sum(delivered)>0 then sum(unsubscribe_rate*delivered)/sum(delivered) else 0 end unsubscribe_rate,case when sum(delivered)>0 then sum(spam_complaint_rate*delivered)/sum(delivered) else 0 end spam_complaint_rate from ${table} where date between $1 and $2 group by ${id} order by sum(revenue) desc`,[from,to]);
  const [campaignRows,flowRows,listRows]=await Promise.all([select("klaviyo_campaign_daily","campaign_message_id","name"),select("klaviyo_flow_daily","flow_message_id","concat_ws(' · ',flow_name,message_name)"),queryDatabase(`select coalesce((array_agg(current_email_list_size order by date desc))[1],0) current_size,sum(subscribed) subscribed,sum(unsubscribed) unsubscribed,sum(net_growth) net_growth from klaviyo_list_health_daily where date between $1 and $2`,[from,to])]);
  const campaigns=combineKlaviyo(campaignRows.rows,"campaign_message_id","name"),flows=combineKlaviyo(flowRows.rows,"flow_message_id","name"); const classified=(pattern:RegExp)=>flows.filter(x=>pattern.test(x.name)); const abandoned=classified(/added to cart|abandon.*(cart|checkout)/i); const welcome=classified(/welcome/i); const post=classified(/post.?purchase|order confirmation|thank.?you/i); const used=new Set([...abandoned,...welcome,...post].map(x=>x.id)); const other=flows.filter(x=>!used.has(x.id)); const abandonedTriggered=abandoned.reduce((s,x)=>s+x.recipients,0),abandonedCompleted=abandoned.reduce((s,x)=>s+x.conversions,0); const all=[...campaigns,...flows],delivered=all.reduce((s,x)=>s+x.delivered,0); const list=listRows.rows[0]??{}; const current=n(list.current_size),net=n(list.net_growth),start=current-net;
  return{source:"klaviyo",from,to,attributedRevenue:all.reduce((s,x)=>s+x.revenue,0),abandonedCart:{triggered:abandonedTriggered,completed:abandonedCompleted,recoveryRate:abandonedTriggered?abandonedCompleted/abandonedTriggered:0,revenueRecovered:abandoned.reduce((s,x)=>s+x.revenue,0)},campaigns,flows,flowMessages:flows,flowGroups:[{key:"welcome",name:"Welcome",rows:welcome},{key:"post_purchase",name:"Post-purchase",rows:post},{key:"other",name:"Other lifecycle",rows:other}],listHealth:{currentEmailListSize:current,subscribed:n(list.subscribed),unsubscribed:n(list.unsubscribed),netGrowth:net,growthRate:start>0?net/start:null,unsubscribeRate:delivered?all.reduce((s,x)=>s+x.unsubscribeRate*x.delivered,0)/delivered:0,spamComplaintRate:delivered?all.reduce((s,x)=>s+x.spamComplaintRate*x.delivered,0)/delivered:0}};
}
