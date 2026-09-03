alter table shopify_orders
  add column if not exists customer_name text;
