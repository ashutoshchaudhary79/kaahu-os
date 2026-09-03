alter table shopify_orders
  add column if not exists attribution jsonb;
