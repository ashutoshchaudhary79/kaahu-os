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

export type Campaign = { name: string; type: string; spend: string; ctr: string; cpc: string; purchases: string; roas: string; cpa: string; strong: boolean };
export const campaigns: Campaign[] = [
  { name: "Prospecting — tote collection", type: "Cold, interest stack", spend: "$6,180", ctr: "1.42%", cpc: "$1.28", purchases: "41", roas: "2.10×", cpa: "$150.73", strong: false },
  { name: "Prospecting — lookalike 1%", type: "Cold, purchaser seed", spend: "$5,420", ctr: "1.68%", cpc: "$1.09", purchases: "39", roas: "2.44×", cpa: "$139.00", strong: false },
  { name: "Broad — open targeting", type: "Cold, advantage+", spend: "$2,590", ctr: "1.21%", cpc: "$1.51", purchases: "16", roas: "1.78×", cpa: "$161.88", strong: false },
  { name: "Retargeting — cart abandoners", type: "Warm, 14 day window", spend: "$2,340", ctr: "3.85%", cpc: "$0.61", purchases: "58", roas: "5.62×", cpa: "$40.34", strong: true },
  { name: "Retargeting — site visitors 30d", type: "Warm, broad", spend: "$1,890", ctr: "2.91%", cpc: "$0.74", purchases: "33", roas: "4.87×", cpa: "$57.27", strong: true },
];
