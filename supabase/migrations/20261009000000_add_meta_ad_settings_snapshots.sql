-- Settings observed when an ad is inspected; never backdated to reporting dates.
create table if not exists meta_ad_settings_snapshots (
  account_id text not null,
  ad_id text not null,
  retrieved_at timestamptz not null,
  settings jsonb not null,
  primary key (account_id, ad_id, retrieved_at)
);
create index if not exists meta_ad_settings_latest on meta_ad_settings_snapshots(account_id, ad_id, retrieved_at desc);
alter table meta_ad_settings_snapshots enable row level security;
