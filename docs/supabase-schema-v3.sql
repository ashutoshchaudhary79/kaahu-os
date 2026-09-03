-- Kaahu OS: Supabase schema (v3 — adds GA4 + Klaviyo)
--
-- v2 covered Shopify orders + ad-platform spend (Meta/Google/TikTok) with
-- blended cross-channel ROAS via order-level UTM attribution.
-- v3 adds GA4 (traffic/funnel) and Klaviyo (email) as their own tables —
-- neither fits the ad-platform "spend" shape:
--   - Klaviyo has no ad spend; it's revenue + engagement rates.
--   - GA4 is session/traffic data, not a spend/revenue-attribution source
--     in the same shape as an ad platform (though its channel grouping is
--     a legitimate second attribution signal — see note near the bottom).

-- ============================================================
-- SHOPIFY  (unchanged from v2)
-- ============================================================

create table if not exists shopify_orders (
  order_id            bigint primary key,
  order_number        text not null,
  customer_id         bigint,
  customer_hash       text,
  placed_at           timestamptz not null,
  financial_status    text,
  fulfillment_status  text,
  subtotal            numeric(10,2),
  discounts           numeric(10,2),
  total               numeric(10,2) not null,
  currency            text not null default 'USD',
  destination_city    text,
  destination_state   text,
  destination_country text,
  sales_channel       text,
  item_count          integer,
  landing_site        text,
  referring_site      text,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  synced_at           timestamptz not null default now()
);

create index if not exists idx_orders_placed_at  on shopify_orders (placed_at);
create index if not exists idx_orders_state      on shopify_orders (destination_state);
create index if not exists idx_orders_customer   on shopify_orders (customer_id);
create index if not exists idx_orders_customer_hash on shopify_orders (customer_hash);
create index if not exists idx_orders_utm_source on shopify_orders (utm_source);

create table if not exists shopify_order_line_items (
  id            bigserial primary key,
  order_id      bigint not null references shopify_orders(order_id) on delete cascade,
  product_id    bigint,
  variant_id    bigint,
  product_title text,
  variant_title text,
  quantity      integer not null,
  price         numeric(10,2) not null
);

create index if not exists idx_line_items_order on shopify_order_line_items (order_id);

-- ============================================================
-- CHANNEL MAPPING  (unchanged from v2)
-- ============================================================

create table if not exists channel_map (
  utm_source     text not null,
  utm_medium     text,
  channel        text not null,
  primary key (utm_source, utm_medium)
);

insert into channel_map (utm_source, utm_medium, channel) values
  ('facebook', 'paid_social', 'meta'),
  ('instagram', 'paid_social', 'meta'),
  ('google', 'cpc', 'google'),
  ('tiktok', 'paid_social', 'tiktok'),
  ('klaviyo', 'email', 'email')
on conflict (utm_source, utm_medium) do nothing;

-- ============================================================
-- AD PLATFORM SPEND  (unchanged from v2)
-- ============================================================

create table if not exists ad_campaigns (
  platform      text not null,
  campaign_id   text not null,
  name          text not null,
  objective     text,
  status        text,
  updated_at    timestamptz not null default now(),
  primary key (platform, campaign_id)
);

create table if not exists channel_spend_daily (
  date                              date not null,
  platform                          text not null,
  campaign_id                       text not null,
  spend                             numeric(10,2) not null default 0,
  impressions                       bigint default 0,
  link_clicks                       bigint default 0,
  platform_reported_purchases       integer default 0,
  platform_reported_purchase_value  numeric(10,2) default 0,
  synced_at                         timestamptz not null default now(),
  primary key (date, platform, campaign_id),
  foreign key (platform, campaign_id) references ad_campaigns(platform, campaign_id)
);

create index if not exists idx_channel_spend_date     on channel_spend_daily (date);
create index if not exists idx_channel_spend_platform on channel_spend_daily (platform);

create table if not exists channel_geo_spend (
  date         date not null,
  platform     text not null,
  dimension    text not null check (dimension in ('state','comscore_market','dma')),
  geo_value    text not null,
  spend        numeric(10,2) not null default 0,
  impressions  bigint default 0,
  link_clicks  bigint default 0,
  ctr          numeric(10,4),
  cpm          numeric(10,2),
  synced_at    timestamptz not null default now(),
  primary key (date, platform, dimension, geo_value)
);

create index if not exists idx_geo_spend_date on channel_geo_spend (date);

-- ============================================================
-- GA4  (new in v3)
-- Grain: daily. `dailyChannels` in lib/ga4.ts already returns per-day
-- rows for channel/visitor-type, so channel_daily needs no code change.
-- funnel_daily and device_daily currently come back as RANGE TOTALS in
-- lib/ga4.ts (no `date` dimension in those report requests) — populating
-- them at daily grain requires adding `{ name: "date" }` to those
-- requests' `dimensions` array. Flagging here so the sync job doesn't
-- silently backfill only one row per range.
-- ============================================================

create table if not exists ga4_channel_daily (
  date          date not null,
  channel       text not null,      -- GA4 sessionDefaultChannelGroup, e.g. "Paid Social", "Organic Search"
  visitor_type  text not null,      -- "new" / "returning"
  sessions      integer not null default 0,
  users         integer not null default 0,
  new_users     integer not null default 0,
  synced_at     timestamptz not null default now(),
  primary key (date, channel, visitor_type)
);

create index if not exists idx_ga4_channel_date on ga4_channel_daily (date);

-- Requires the `dimensions: [{ name: "date" }, ...]` addition noted above.
create table if not exists ga4_funnel_daily (
  date       date not null,
  event      text not null,          -- view_item / add_to_cart / begin_checkout / purchase
  events     integer not null default 0,
  synced_at  timestamptz not null default now(),
  primary key (date, event)
);

-- Requires the same date-dimension addition.
create table if not exists ga4_device_daily (
  date        date not null,
  device      text not null,
  sessions    integer not null default 0,
  users       integer not null default 0,
  purchases   integer not null default 0,
  revenue     numeric(10,2) not null default 0,
  synced_at   timestamptz not null default now(),
  primary key (date, device)
);

-- Highest-cardinality GA4 table (page x day) — include only if landing-page
-- trend history is actually something you'll query; otherwise skip it and
-- rely on the live API for landing-page detail.
create table if not exists ga4_landing_page_daily (
  date            date not null,
  page            text not null,
  sessions        integer not null default 0,
  users           integer not null default 0,
  engagement_rate numeric(6,4),
  bounce_rate     numeric(6,4),
  view_item       integer default 0,
  add_to_cart     integer default 0,
  begin_checkout  integer default 0,
  purchases       integer default 0,
  synced_at       timestamptz not null default now(),
  primary key (date, page)
);

-- ============================================================
-- KLAVIYO  (new in v3)
-- Grain: daily. lib/klaviyo.ts's reports return stats aggregated over
-- whatever {from, to} range you pass — to get true daily rows, the sync
-- job must call getKlaviyoSummary(day, day) once per day, not once per
-- backfill range. No "spend" column: Klaviyo doesn't have per-send ad
-- spend, only revenue + engagement rates.
-- ============================================================

create table if not exists klaviyo_campaign_daily (
  date                  date not null,
  campaign_message_id   text not null,
  campaign_id           text,
  name                  text,
  channel               text,         -- send_channel, e.g. "email", "sms"
  recipients            integer default 0,
  delivered             integer default 0,
  open_rate             numeric(6,4),
  click_rate            numeric(6,4),
  conversions           integer default 0,
  conversion_rate       numeric(6,4),
  revenue               numeric(10,2) default 0,
  revenue_per_recipient numeric(10,2),
  unsubscribe_rate      numeric(6,4),
  spam_complaint_rate   numeric(6,4),
  synced_at             timestamptz not null default now(),
  primary key (date, campaign_message_id)
);

create index if not exists idx_klaviyo_campaign_date on klaviyo_campaign_daily (date);

create table if not exists klaviyo_flow_daily (
  date                  date not null,
  flow_message_id       text not null,
  flow_id               text,
  flow_name             text,
  channel               text,
  recipients            integer default 0,
  delivered             integer default 0,
  open_rate             numeric(6,4),
  click_rate            numeric(6,4),
  conversions            integer default 0,
  conversion_rate       numeric(6,4),
  revenue               numeric(10,2) default 0,
  revenue_per_recipient numeric(10,2),
  unsubscribe_rate      numeric(6,4),
  spam_complaint_rate   numeric(6,4),
  synced_at             timestamptz not null default now(),
  primary key (date, flow_message_id)
);

create index if not exists idx_klaviyo_flow_date on klaviyo_flow_daily (date);

-- One snapshot per day rather than a range aggregate.
create table if not exists klaviyo_list_health_daily (
  date                    date primary key,
  current_email_list_size integer,
  subscribed              integer,
  unsubscribed            integer,
  net_growth              integer,
  unsubscribe_rate        numeric(6,4),
  spam_complaint_rate     numeric(6,4),
  synced_at               timestamptz not null default now()
);

-- Classifies flows the same way components/KlaviyoAnalytics.tsx's app
-- logic does (welcome / post_purchase / abandoned_cart / other), as a
-- view rather than duplicated app logic — keep the regexes here in sync
-- with the frontend if either changes.
create or replace view v_klaviyo_flow_classified as
select
  *,
  case
    when flow_name ~* 'added to cart|abandon.*(cart|checkout)' then 'abandoned_cart'
    when flow_name ~* 'welcome' then 'welcome'
    when flow_name ~* 'post.?purchase|order confirmation|thank.?you' then 'post_purchase'
    else 'other'
  end as flow_group
from klaviyo_flow_daily;

-- ============================================================
-- SYNC BOOKKEEPING  (source list extended)
-- ============================================================

create table if not exists sync_runs (
  id             bigserial primary key,
  source         text not null check (source in
    ('shopify','meta','meta_geo','google','tiktok','ga4','klaviyo')),
  range_from     date,
  range_to       date,
  status         text not null check (status in ('success','partial','failed')),
  rows_upserted  integer,
  error          text,
  run_at         timestamptz not null default now()
);

-- ============================================================
-- CONVENIENCE VIEWS  (Shopify/ad ROAS views unchanged from v2)
-- ============================================================

create or replace view v_order_channel as
select
  o.*,
  coalesce(cm.channel,
    case when o.referring_site is null or o.referring_site = '' then 'direct'
         else 'organic' end
  ) as channel
from shopify_orders o
left join channel_map cm
  on cm.utm_source = o.utm_source and cm.utm_medium = o.utm_medium;

create or replace view v_channel_revenue_daily as
select
  date(placed_at) as day,
  channel,
  sum(total) as revenue,
  count(*) as order_count,
  count(distinct customer_id) as unique_customers
from v_order_channel
group by date(placed_at), channel;

create or replace view v_channel_spend_daily as
select
  date,
  platform as channel,
  sum(spend) as spend,
  sum(impressions) as impressions,
  sum(link_clicks) as link_clicks
from channel_spend_daily
group by date, platform;

-- Blended cross-channel ROAS: revenue from Shopify attribution (or GA4 —
-- see note below), spend from each ad platform. Klaviyo/email correctly
-- shows spend=0 / roas=null here since email has no media spend; look at
-- klaviyo_campaign_daily.revenue directly for email's own contribution.
create or replace view v_channel_roas as
select
  coalesce(r.day, s.date) as day,
  coalesce(r.channel, s.channel) as channel,
  coalesce(r.revenue, 0) as revenue,
  coalesce(r.order_count, 0) as order_count,
  coalesce(r.unique_customers, 0) as unique_customers,
  coalesce(s.spend, 0) as spend,
  case when coalesce(s.spend, 0) > 0
       then round(coalesce(r.revenue, 0) / s.spend, 2)
       else null end as roas,
  case when coalesce(r.unique_customers, 0) > 0
       then round(s.spend / r.unique_customers, 2)
       else null end as cac
from v_channel_revenue_daily r
full outer join v_channel_spend_daily s
  on r.day = s.date and r.channel = s.channel;

create or replace view v_state_revenue as
select
  destination_state,
  date_trunc('day', placed_at)::date as day,
  sum(total) as revenue,
  count(*) as order_count,
  count(distinct customer_id) as unique_customers
from shopify_orders
group by destination_state, date_trunc('day', placed_at);

create or replace view v_state_channel_efficiency as
select
  geo_value as destination_state,
  platform,
  date,
  spend,
  impressions,
  link_clicks,
  ctr,
  cpm
from channel_geo_spend
where dimension = 'state';

-- NOTE on a second attribution signal: GA4's sessionDefaultChannelGroup
-- (ga4_channel_daily.channel) is a legitimate alternative to the
-- UTM-parsed channel on shopify_orders — GA4 computes it from the same
-- underlying UTM/referrer data using Google's own channel-grouping rules,
-- so it may classify some sessions differently than the raw utm_source
-- mapping in channel_map (e.g. "(not set)" cases, or organic vs paid
-- disambiguation). Treat v_order_channel as ground truth for revenue
-- (it's tied to actual orders) and ga4_channel_daily as a cross-check on
-- traffic-level channel classification — don't merge the two into one
-- number without deciding which wins on disagreement.

-- ============================================================
-- RLS
-- ============================================================

alter table shopify_orders            enable row level security;
alter table shopify_order_line_items  enable row level security;
alter table channel_map               enable row level security;
alter table ad_campaigns              enable row level security;
alter table channel_spend_daily       enable row level security;
alter table channel_geo_spend         enable row level security;
alter table ga4_channel_daily         enable row level security;
alter table ga4_funnel_daily          enable row level security;
alter table ga4_device_daily          enable row level security;
alter table ga4_landing_page_daily    enable row level security;
alter table klaviyo_campaign_daily    enable row level security;
alter table klaviyo_flow_daily        enable row level security;
alter table klaviyo_list_health_daily enable row level security;
alter table sync_runs                 enable row level security;

-- Sync job should use the service role key (bypasses RLS).
-- Add read policies only if the dashboard reads directly via anon key
-- rather than through your own API, e.g.:
-- create policy "read_orders" on shopify_orders for select using (true);
