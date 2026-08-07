"use client";

import { useEffect, useMemo, useState } from "react";
import { CampaignTable } from "./CampaignTable";
import { DateRangePicker, type DateRange } from "./DateRangePicker";
import { KpiCard } from "./KpiCard";
import { MetaFunnel } from "./MetaFunnel";
import { SpendRevenueChart } from "./SpendRevenueChart";
import type { Campaign } from "@/lib/sample-data";

type ShopifyData = {
  from: string;
  to: string;
  currency: string;
  timezone: string;
  revenue: number;
  orderCount: number;
  aov: number;
  daily: Array<{ date: string; revenue: number; orders: number }>;
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
  daily: Array<{ date: string; spend: number }>;
  campaigns: Array<{
    id: string;
    name: string;
    spend: number;
    clicks: number;
    impressions: number;
    purchases: number;
    ctr: number;
    cpc: number;
    roas: number;
    cpa: number | null;
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
  const kpis = useMemo(() => [
    { label: "Spend", value: meta ? money(meta.spend) : "—", delta: loading ? "Loading Meta…" : metaError ? "Unavailable" : "Live Meta spend", trend: metaError ? "down" as const : "flat" as const, source: "Live" },
    { label: "Revenue", value: shopify ? money(shopify.revenue, shopify.currency) : "—", delta: loading ? "Loading Shopify…" : shopifyError ? "Unavailable" : "Live Shopify total", trend: shopifyError ? "down" as const : "flat" as const, source: "Live" },
    { label: "Blended ROAS", value: blendedRoas === null ? "—" : `${blendedRoas.toFixed(2)}×`, delta: "Shopify revenue ÷ Meta spend", trend: "flat" as const, source: "Live" },
    { label: "Orders", value: shopify ? shopify.orderCount.toLocaleString("en-US") : "—", delta: loading ? "Loading Shopify…" : shopifyError ? "Unavailable" : "Excludes test and cancelled", trend: shopifyError ? "down" as const : "flat" as const, source: "Live" },
    { label: "AOV", value: shopify ? money(shopify.aov, shopify.currency) : "—", delta: loading ? "Loading Shopify…" : shopifyError ? "Unavailable" : "Current order totals", trend: shopifyError ? "down" as const : "flat" as const, source: "Live" },
    { label: "Blended CAC", value: blendedCac === null ? "—" : money(blendedCac), delta: "Meta spend ÷ Shopify orders", trend: "flat" as const, source: "Live" },
  ], [shopify, meta, loading, shopifyError, metaError, blendedRoas, blendedCac]);

  const funnel = useMemo(() => {
    if (!meta) return [];
    const steps = [
      { label: "Impressions", count: meta.impressions },
      { label: "Link clicks", count: meta.clicks },
      { label: "Landing views", count: meta.landingPageViews },
      { label: "Add to cart", count: meta.addToCart },
      { label: "Checkout started", count: meta.checkoutInitiated },
      { label: "Purchases", count: meta.purchases },
    ];
    const max = Math.max(meta.impressions, 1);
    return steps.map((step, index) => ({
      label: step.label,
      value: step.count.toLocaleString("en-US"),
      width: Math.max((step.count / max) * 100, step.count ? 1 : 0),
      note: index ? `${steps[index - 1].count ? ((step.count / steps[index - 1].count) * 100).toFixed(1) : "0.0"}% of prior step` : undefined,
    }));
  }, [meta]);

  const campaigns = useMemo<Campaign[]>(() => (meta?.campaigns ?? []).map((campaign) => ({
    name: campaign.name,
    type: `${campaign.impressions.toLocaleString("en-US")} impressions · ${campaign.clicks.toLocaleString("en-US")} link clicks`,
    spend: money(campaign.spend),
    ctr: `${campaign.ctr.toFixed(2)}%`,
    cpc: money(campaign.cpc),
    purchases: campaign.purchases.toLocaleString("en-US"),
    roas: `${campaign.roas.toFixed(2)}×`,
    cpa: campaign.cpa === null ? "—" : money(campaign.cpa),
    strong: campaign.roas >= 3,
  })), [meta]);

  return (
    <main className="mx-auto min-h-screen max-w-[1224px] px-5 pb-20 sm:px-8">
      <header className="flex flex-col gap-6 border-b border-rule py-8 sm:py-10 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Kaahu</p>
          <h1 className="font-display mt-2 text-[2rem] font-medium leading-tight tracking-[-0.02em]">Performance dashboard</h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">Meta ads and Shopify, combined view</p>
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

      <section className="mb-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <SpendRevenueChart revenueDaily={shopify?.daily ?? []} spendDaily={meta?.daily ?? []} from={range.from} to={range.to} loading={loading} />
        <MetaFunnel steps={funnel} />
      </section>

      <CampaignTable campaigns={campaigns} />

      <footer className="mt-8 border-t border-rule pt-4 text-[11px] text-ink-faint">
        Shopify and Meta figures are live. Meta conversions use the ad account&apos;s attribution settings; blended metrics are directional.
      </footer>
    </main>
  );
}
