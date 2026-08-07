export const kpis = [
  { label: "Spend", value: "$18,420", delta: "↑ 6.2% vs prior", trend: "up" as const },
  { label: "Revenue", value: "$54,900", delta: "↑ 11.4% vs prior", trend: "up" as const },
  { label: "Blended ROAS", value: "2.98×", delta: "↑ 0.14 vs prior", trend: "up" as const },
  { label: "Orders", value: "187", delta: "↑ 9 vs prior", trend: "up" as const },
  { label: "AOV", value: "$293.58", delta: "— flat vs prior", trend: "flat" as const },
  { label: "Blended CAC", value: "$98.50", delta: "↓ 3.10 vs prior", trend: "down" as const },
];

export const funnel = [
  { label: "Impressions", value: "812,400", width: 100 },
  { label: "Clicks", value: "14,230", width: 38, note: "1.75% CTR" },
  { label: "Landing views", value: "11,980", width: 32, note: "84.2% of clicks land" },
  { label: "Add to cart", value: "1,340", width: 9, note: "11.2% of views — largest drop" },
  { label: "Checkout started", value: "612", width: 4, note: "45.7% of carts" },
  { label: "Purchases", value: "187", width: 2, note: "30.6% of checkouts" },
];
