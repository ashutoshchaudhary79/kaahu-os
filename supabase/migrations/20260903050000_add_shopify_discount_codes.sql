alter table shopify_orders
  add column if not exists discount_codes jsonb not null default '[]'::jsonb;
