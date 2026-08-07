"use client";

import { useEffect, useMemo, useState } from "react";
import { CampaignTable, type PerformanceRow } from "./CampaignTable";
import { DateRangePicker, type DateRange } from "./DateRangePicker";
import { KpiCard } from "./KpiCard";
import { MetaFunnel } from "./MetaFunnel";
import { MarketSpendPanel } from "./MarketSpendPanel";
import { SpendRevenueChart } from "./SpendRevenueChart";
import { OrderDetailsDrawer, type OrderSummary } from "./OrderDetailsDrawer";
import { KpiDetailPanel, type KpiDetail } from "./KpiDetailPanel";

type ShopifyData = {
  from: string;
  to: string;
  currency: string;
  timezone: string;
  revenue: number;
  orderCount: number;
  aov: number;
  daily: Array<{ date: string; revenue: number; orders: number }>;
  orders: OrderSummary[];
};

type MetaData = {
  from: string;
  to: string;
  spend: number;
  impressions: number;
  clicks: number;
  landingPageViews: number;
  addToCart: number;
  checkoutInitiated: number;
  purchases: number;
  purchaseValue: number;
  daily: Array<{ date: string; spend: number; impressions: number; clicks: number; landingPageViews: number; addToCart: number; checkoutInitiated: number; purchases: number; purchaseValue: number }>;
  dailyAds: Array<{ date: string; ads: Array<{ id: string; name: string; spend: number }> }>;
  ads: Array<{ id: string; name: string; campaignName: string; objective: string; role: "tofu" | "mofu" | "sales"; spend: number; impressions: number; clicks: number; landingPageViews: number; addToCart: number; checkoutInitiated: number; purchases: number }>;
  campaigns: Array<{
    id: string;
    name: string;
    spend: number;
    clicks: number;
    impressions: number;
    landingPageViews: number;
    addToCart: number;
    checkoutInitiated: number;
    purchases: number;
    ctr: number;
    cpc: number;
    roas: number;
    cpa: number | null;
    objective: string;
    role: "tofu" | "mofu" | "sales";
  }>;
};

const money = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);

export function Dashboard() {
  const [range, setRange] = useState<DateRange>(() => DateRangePicker.defaultRange(30));
  const [shopify, setShopify] = useState<ShopifyData | null>(null);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setShopifyError(null);
    setMetaError(null);

    const load = async () => {
      const query = `from=${range.from}&to=${range.to}`;
      const read = async <T,>(url: string): Promise<T> => {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        const body = (await response.json()) as T & { detail?: string };
        if (!response.ok) throw new Error(body.detail ?? "Data could not be loaded");
        return body;
      };

      await Promise.all([
        read<ShopifyData>(`/api/shopify?${query}`).then(setShopify).catch((requestError: unknown) => {
          if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
            setShopifyError(requestError instanceof Error ? requestError.message : "Shopify data could not be loaded");
          }
        }),
        read<MetaData>(`/api/meta?${query}`).then(setMeta).catch((requestError: unknown) => {
          if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
            setMetaError(requestError instanceof Error ? requestError.message : "Meta data could not be loaded");
          }
        }),
      ]);

      if (!controller.signal.aborted) setLoading(false);
    };
    load().catch(() => {
      if (!controller.signal.aborted) {
        if (!controller.signal.aborted) setLoading(false);
      }
    });

    return () => controller.abort();
  }, [range]);

  const blendedRoas = shopify && meta?.spend ? shopify.revenue / meta.spend : null;
  const blendedCac = shopify?.orderCount && meta ? meta.spend / shopify.orderCount : null;
  const dailyRows = useMemo(() => {
    const shopifyByDate = new Map((shopify?.daily ?? []).map((row) => [row.date, row]));
    const metaByDate = new Map((meta?.daily ?? []).map((row) => [row.date, row]));
    const rows = [];
    const cursor = new Date(`${range.from}T12:00:00Z`);
    const end = new Date(`${range.to}T12:00:00Z`);
    while (cursor <= end) {
      const date = cursor.toISOString().slice(0, 10);
      rows.push({
        date,
        revenue: shopifyByDate.get(date)?.revenue ?? 0,
        orders: shopifyByDate.get(date)?.orders ?? 0,
        spend: metaByDate.get(date)?.spend ?? 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return rows;
  }, [shopify, meta, range]);

  const kpiDetails = useMemo<Record<string, KpiDetail>>(() => {
    const currency = shopify?.currency ?? "USD";
    const base = dailyRows.map((row) => ({ ...row, aov: row.orders ? row.revenue / row.orders : null, roas: row.spend ? row.revenue / row.spend : null, cac: row.orders ? row.spend / row.orders : null }));
    return {
      Spend: { label: "Spend", value: meta ? money(meta.spend) : "—", source: "Meta Ads", columns: [{ key: "spend", label: "Spend" }], rows: base.map((row) => ({ date: row.date, values: { spend: money(row.spend) } })), methodology: "Daily spend reported by Meta Ads using the ad account's reporting timezone and attribution configuration." },
      Revenue: { label: "Revenue", value: shopify ? money(shopify.revenue, currency) : "—", source: "Shopify", columns: [{ key: "revenue", label: "Revenue" }], rows: base.map((row) => ({ date: row.date, values: { revenue: money(row.revenue, currency) } })), methodology: "Shopify current order totals grouped by the store timezone. Cancelled, test, and zero-dollar orders are excluded." },
      "Blended ROAS": { label: "Blended ROAS", value: blendedRoas === null ? "—" : `${blendedRoas.toFixed(2)}×`, source: "Shopify + Meta", columns: [{ key: "revenue", label: "Revenue" }, { key: "spend", label: "Spend" }, { key: "roas", label: "ROAS" }], rows: base.map((row) => ({ date: row.date, values: { revenue: money(row.revenue, currency), spend: money(row.spend), roas: row.roas === null ? "—" : `${row.roas.toFixed(2)}×` } })), methodology: "Daily Shopify revenue divided by daily Meta spend. This is a blended, directional metric and does not attribute individual Shopify orders to Meta ads." },
      Orders: { label: "Orders", value: shopify ? shopify.orderCount.toLocaleString("en-US") : "—", source: "Shopify", columns: [{ key: "orders", label: "Orders" }], rows: base.map((row) => ({ date: row.date, values: { orders: row.orders.toLocaleString("en-US") } })), methodology: "Count of Shopify orders with a positive current total, grouped by the store timezone. Cancelled and test orders are excluded." },
      AOV: { label: "AOV", value: shopify ? money(shopify.aov, currency) : "—", source: "Shopify", columns: [{ key: "revenue", label: "Revenue" }, { key: "orders", label: "Orders" }, { key: "aov", label: "AOV" }], rows: base.map((row) => ({ date: row.date, values: { revenue: money(row.revenue, currency), orders: row.orders.toLocaleString("en-US"), aov: row.aov === null ? "—" : money(row.aov, currency) } })), methodology: "Daily included Shopify revenue divided by daily included order count. Days without an included order show no AOV." },
      "Blended CAC": { label: "Blended CAC", value: blendedCac === null ? "—" : money(blendedCac), source: "Meta + Shopify", columns: [{ key: "spend", label: "Spend" }, { key: "orders", label: "Orders" }, { key: "cac", label: "CAC" }], rows: base.map((row) => ({ date: row.date, values: { spend: money(row.spend), orders: row.orders.toLocaleString("en-US"), cac: row.cac === null ? "—" : money(row.cac) } })), methodology: "Daily Meta spend divided by daily included Shopify order count. This is a blended acquisition-cost proxy, not a customer-level attribution metric." },
    };
  }, [dailyRows, shopify, meta, blendedRoas, blendedCac]);

  const kpis = useMemo(() => [
    { label: "Spend", value: meta ? money(meta.spend) : "—", delta: loading ? "Loading Meta…" : metaError ? "Unavailable" : "Meta ad spend", trend: metaError ? "down" as const : "flat" as const },
    { label: "Revenue", value: shopify ? money(shopify.revenue, shopify.currency) : "—", delta: loading ? "Loading Shopify…" : shopifyError ? "Unavailable" : "Shopify order total", trend: shopifyError ? "down" as const : "flat" as const },
    { label: "Blended ROAS", value: blendedRoas === null ? "—" : `${blendedRoas.toFixed(2)}×`, delta: "Shopify revenue ÷ Meta spend", trend: "flat" as const },
    { label: "Orders", value: shopify ? shopify.orderCount.toLocaleString("en-US") : "—", delta: loading ? "Loading Shopify…" : shopifyError ? "Unavailable" : "Excludes test, cancelled, and $0", trend: shopifyError ? "down" as const : "flat" as const },
    { label: "AOV", value: shopify ? money(shopify.aov, shopify.currency) : "—", delta: loading ? "Loading Shopify…" : shopifyError ? "Unavailable" : "Current order totals", trend: shopifyError ? "down" as const : "flat" as const },
    { label: "Blended CAC", value: blendedCac === null ? "—" : money(blendedCac), delta: "Meta spend ÷ Shopify orders", trend: "flat" as const },
  ].map((kpi) => ({
    ...kpi,
    onClick: loading ? undefined : kpi.label === "Orders"
      ? (shopify ? () => setOrdersOpen(true) : undefined)
      : () => setActiveKpi(kpi.label),
  })), [shopify, meta, loading, shopifyError, metaError, blendedRoas, blendedCac]);

  const funnel = useMemo(() => {
    if (!meta) return [];
    const steps = [
      { key: "impressions" as const, label: "Impressions", count: meta.impressions },
      { key: "clicks" as const, label: "Link clicks", count: meta.clicks },
      { key: "landingPageViews" as const, label: "Landing views", count: meta.landingPageViews },
      { key: "addToCart" as const, label: "Add to cart", count: meta.addToCart },
      { key: "checkoutInitiated" as const, label: "Checkout started", count: meta.checkoutInitiated },
      { key: "purchases" as const, label: "Purchases", count: meta.purchases },
    ];
    const max = Math.max(meta.impressions, 1);
    return steps.map((step, index) => ({
      label: step.label,
      key: step.key,
      value: step.count.toLocaleString("en-US"),
      width: Math.max((step.count / max) * 100, step.count ? 1 : 0),
      note: index ? `${steps[index - 1].count ? ((step.count / steps[index - 1].count) * 100).toFixed(1) : "0.0"}% of prior step` : undefined,
    }));
  }, [meta]);

  const campaigns = useMemo<PerformanceRow[]>(() => (meta?.campaigns ?? []).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    type: `${campaign.impressions.toLocaleString("en-US")} impressions · ${campaign.clicks.toLocaleString("en-US")} link clicks`,
    spend: money(campaign.spend),
    ctr: `${campaign.ctr.toFixed(2)}%`,
    cpc: money(campaign.cpc),
    purchases: campaign.purchases.toLocaleString("en-US"),
    roas: `${campaign.roas.toFixed(2)}×`,
    cpa: campaign.cpa === null ? "—" : money(campaign.cpa),
    objective: campaign.objective,
    role: campaign.role,
    strong: campaign.roas >= 3,
    raw: { spend: campaign.spend, ctr: campaign.ctr, cpc: campaign.cpc, purchases: campaign.purchases, roas: campaign.roas, cpa: campaign.cpa },
  })), [meta]);

  const attributionLookup = useMemo(() => {
    const entries: Array<[string, { type: "Campaign" | "Ad"; name: string }]> = [];
    for (const campaign of meta?.campaigns ?? []) entries.push([campaign.id, { type: "Campaign", name: campaign.name }]);
    for (const ad of meta?.ads ?? []) entries.push([ad.id, { type: "Ad", name: ad.name }]);
    return Object.fromEntries(entries);
  }, [meta]);

  return (
    <main className="mx-auto min-h-screen max-w-[1224px] px-5 pb-20 sm:px-8">
      <header className="flex flex-col gap-6 border-b border-rule py-8 sm:py-10 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Kaahu</p>
          <h1 className="font-display mt-2 text-[2rem] font-medium leading-tight tracking-[-0.02em]">Performance dashboard</h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">Meta ads and Shopify, combined view</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-faint" aria-label="Connection status">
            <span className="uppercase tracking-[0.08em]">Connections</span>
            <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${shopifyError ? "bg-brick" : shopify ? "bg-moss" : "bg-ink-faint"}`} />Shopify {shopifyError ? "unavailable" : shopify ? "live" : "connecting"}</span>
            <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${metaError ? "bg-brick" : meta ? "bg-moss" : "bg-ink-faint"}`} />Meta Ads {metaError ? "unavailable" : meta ? "live" : "connecting"}</span>
          </div>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </header>

      {(shopifyError || metaError) && (
        <div role="alert" className="mt-6 rounded border border-brick/30 bg-brick/5 px-4 py-3 text-sm text-brick">
          {shopifyError && <>Shopify data is unavailable: {shopifyError}</>}
          {shopifyError && metaError && <br />}
          {metaError && <>Meta data is unavailable: {metaError}</>}
        </div>
      )}

      <section aria-label="Key performance indicators" aria-busy={loading} className="my-8 grid overflow-hidden rounded border border-rule bg-white sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
      </section>

      <section className="mb-8 grid gap-6">
        <SpendRevenueChart revenueDaily={shopify?.daily ?? []} spendDaily={meta?.daily ?? []} dailyAds={meta?.dailyAds ?? []} from={range.from} to={range.to} loading={loading} currency={shopify?.currency} />
        <MetaFunnel steps={funnel} ads={meta?.ads ?? []} />
      </section>

      <CampaignTable campaigns={campaigns} range={range} />
      <MarketSpendPanel range={range} />

      <footer className="mt-8 border-t border-rule pt-4 text-[11px] text-ink-faint">
        Shopify and Meta figures are live. Meta conversions use the ad account&apos;s attribution settings; blended metrics are directional.
      </footer>
      <KpiDetailPanel detail={activeKpi ? kpiDetails[activeKpi] ?? null : null} onClose={() => setActiveKpi(null)} from={range.from} to={range.to} timezone={shopify?.timezone ?? "Account timezones"} />
      {shopify && <OrderDetailsDrawer open={ordersOpen} onClose={() => setOrdersOpen(false)} orders={shopify.orders} currency={shopify.currency} timezone={shopify.timezone} from={range.from} to={range.to} attributionLookup={attributionLookup} />}
    </main>
  );
}
