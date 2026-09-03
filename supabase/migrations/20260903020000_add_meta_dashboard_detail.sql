alter table channel_spend_daily
  add column if not exists reach bigint default 0,
  add column if not exists landing_page_views bigint default 0,
  add column if not exists add_to_cart bigint default 0,
  add column if not exists checkout_initiated bigint default 0;

alter table ga4_channel_daily
  add column if not exists purchases integer default 0,
  add column if not exists revenue numeric(10,2) default 0;

create table if not exists meta_entity_daily (
  date date not null,
  level text not null check (level in ('adset', 'ad')),
  entity_id text not null,
  parent_id text not null,
  campaign_id text,
  name text not null,
  campaign_name text,
  objective text,
  spend numeric(10,2) not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  link_clicks bigint not null default 0,
  landing_page_views bigint not null default 0,
  add_to_cart bigint not null default 0,
  checkout_initiated bigint not null default 0,
  purchases integer not null default 0,
  purchase_value numeric(10,2) not null default 0,
  synced_at timestamptz not null default now(),
  primary key (date, level, entity_id)
);

create index if not exists idx_meta_entity_parent_date
  on meta_entity_daily (level, parent_id, date);

create index if not exists idx_meta_entity_campaign_date
  on meta_entity_daily (campaign_id, date);
