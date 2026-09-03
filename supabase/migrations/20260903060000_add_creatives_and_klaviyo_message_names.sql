create table if not exists meta_ad_creatives (
  ad_id text primary key,
  campaign_id text,
  ad_name text,
  creative_id text,
  thumbnail_url text,
  synced_at timestamptz not null default now()
);

create index if not exists idx_meta_ad_creatives_campaign
  on meta_ad_creatives (campaign_id);

alter table klaviyo_flow_daily
  add column if not exists message_name text;
