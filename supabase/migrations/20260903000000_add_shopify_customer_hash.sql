alter table shopify_orders
  add column if not exists customer_hash text;

create index if not exists idx_orders_customer_hash
  on shopify_orders (customer_hash);
