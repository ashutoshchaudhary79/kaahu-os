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
import { Ga4Analytics, type Ga4Data } from "./Ga4Analytics";
import { KlaviyoAnalytics, type KlaviyoData } from "./KlaviyoAnalytics";
import { AcronymText } from "./AcronymText";

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
    frequency: number;
    landingPageViews: number;
    addToCart: number;
    checkoutInitiated: number;
    purchases: number;
    ctr: number;
    cpc: number;
    cpm: number;
    roas: number;
    cpa: number | null;
    objective: string;
    role: "tofu" | "mofu" | "sales";
  }>;
};

type SourceRefreshStatus = {
  source: "shopify" | "meta" | "ga4" | "klaviyo";
  lastRefreshedAt: string | null;
};

const money = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);

const DATE_RANGE_STORAGE_KEY = "kaahu-dashboard-date-range";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isStoredRange(value: unknown): value is DateRange {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DateRange>;
  if (!DATE_PATTERN.test(candidate.from ?? "") || !DATE_PATTERN.test(candidate.to ?? "")) return false;
  if (typeof candidate.days !== "number" || ![0, 7, 30, 60, 90, 180, 365].includes(candidate.days)) return false;
  const fromTime = Date.parse(`${candidate.from}T00:00:00Z`);
  const toTime = Date.parse(`${candidate.to}T00:00:00Z`);
  return Number.isFinite(fromTime) && Number.isFinite(toTime) && fromTime <= toTime && candidate.to! <= new Date().toISOString().slice(0, 10);
}

export function Dashboard() {
  const [range, setRange] = useState<DateRange>(() => DateRangePicker.defaultRange(30));
  const [rangeRestored, setRangeRestored] = useState(false);
  const [shopify, setShopify] = useState<ShopifyData | null>(null);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [ga4, setGa4] = useState<Ga4Data | null>(null);
  const [klaviyo, setKlaviyo] = useState<KlaviyoData | null>(null);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [ga4Error, setGa4Error] = useState<string | null>(null);
  const [klaviyoError, setKlaviyoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [syncing, setSyncing] = useState(true);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [refreshStatuses, setRefreshStatuses] = useState<SourceRefreshStatus[]>([]);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<"campaigns" | "geography" | "acquisition" | "retention">("campaigns");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DATE_RANGE_STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isStoredRange(parsed)) setRange(parsed);
        else window.localStorage.removeItem(DATE_RANGE_STORAGE_KEY);
      }
    } catch {
      // Storage can be unavailable or contain invalid data; the default remains safe.
    } finally {
      setRangeRestored(true);
    }
  }, []);

  const changeRange = (nextRange: DateRange) => {
    setRange(nextRange);
    try {
      window.localStorage.setItem(DATE_RANGE_STORAGE_KEY, JSON.stringify(nextRange));
    } catch {
      // The selected range still applies for this session when storage is unavailable.
    }
  };

  useEffect(() => {
    let active = true;
    fetch("/api/sync", { method: "POST", cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { ok?: boolean; detail?: string; refreshStatuses?: SourceRefreshStatus[] };
        if (active && body.refreshStatuses) setRefreshStatuses(body.refreshStatuses);
        if (!response.ok) throw new Error(body.detail ?? "Latest data could not be synced");
        if (active && !body.ok) setSyncWarning("Some sources could not be refreshed; showing the latest stored data.");
      })
      .catch(() => {
        if (active) setSyncWarning("Latest data could not be refreshed; showing the latest stored data.");
      })
      .finally(() => {
        if (active) {
          setSyncing(false);
          setRefreshVersion((version) => version + 1);
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!rangeRestored) return;
    const controller = new AbortController();
    setLoading(true);
    setShopifyError(null);
    setMetaError(null);
    setGa4Error(null);
    setKlaviyoError(null);

    const load = async () => {
      const query = `from=${range.from}&to=${range.to}`;
      const read = async <T,>(url: string): Promise<T> => {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        const body = (await response.json()) as T & { detail?: string };
        if (!response.ok) throw new Error(body.detail ?? "Data could not be loaded");
        return body;
      };

      const results = await Promise.allSettled([
        read<ShopifyData>(`/api/shopify?${query}`), read<MetaData>(`/api/meta?${query}`),
        read<Ga4Data>(`/api/ga4?${query}`), read<KlaviyoData>(`/api/klaviyo?${query}`),
      ]);
      if (controller.signal.aborted) return;
      const message = (result: PromiseSettledResult<unknown>, fallback: string) => result.status === "rejected"
        ? result.reason instanceof Error ? result.reason.message : fallback : null;
      const [shopifyResult, metaResult, ga4Result, klaviyoResult] = results;
      setShopify(shopifyResult.status === "fulfilled" ? shopifyResult.value : null);
      setMeta(metaResult.status === "fulfilled" ? metaResult.value : null);
      setGa4(ga4Result.status === "fulfilled" ? ga4Result.value : null);
      setKlaviyo(klaviyoResult.status === "fulfilled" ? klaviyoResult.value : null);
      setShopifyError(message(shopifyResult, "Shopify data could not be loaded"));
      setMetaError(message(metaResult, "Meta data could not be loaded"));
      setGa4Error(message(ga4Result, "GA4 data could not be loaded"));
      setKlaviyoError(message(klaviyoResult, "Klaviyo data could not be loaded"));
      setLoading(false);
    };
    load().catch(() => {
      if (!controller.signal.aborted) {
        if (!controller.signal.aborted) setLoading(false);
      }
    });

    return () => controller.abort();
  }, [range, rangeRestored, refreshVersion]);

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
    frequency: campaign.frequency.toFixed(2),
    ctr: `${campaign.ctr.toFixed(2)}%`,
    cpc: money(campaign.cpc),
    cpm: money(campaign.cpm),
    purchases: campaign.purchases.toLocaleString("en-US"),
    roas: `${campaign.roas.toFixed(2)}×`,
    cpa: campaign.cpa === null ? "—" : money(campaign.cpa),
    objective: campaign.objective,
    role: campaign.role,
    strong: campaign.roas >= 3,
    raw: { spend: campaign.spend, frequency: campaign.frequency, ctr: campaign.ctr, cpc: campaign.cpc, cpm: campaign.cpm, purchases: campaign.purchases, roas: campaign.roas, cpa: campaign.cpa },
  })), [meta]);

  const attributionLookup = useMemo(() => {
    const entries: Array<[string, { type: "Campaign" | "Ad"; name: string }]> = [];
    for (const campaign of meta?.campaigns ?? []) entries.push([campaign.id, { type: "Campaign", name: campaign.name }]);
    for (const ad of meta?.ads ?? []) entries.push([ad.id, { type: "Ad", name: ad.name }]);
    return Object.fromEntries(entries);
  }, [meta]);

  const sources = [
    { name: "Shopify", data: shopify, error: shopifyError },
    { name: "Meta Ads", data: meta, error: metaError },
    { name: "GA4", data: ga4, error: ga4Error },
    { name: "Klaviyo", data: klaviyo, error: klaviyoError },
  ];
  const sourceLabels: Record<SourceRefreshStatus["source"], string> = { shopify: "Shopify", meta: "Meta Ads", ga4: "GA4", klaviyo: "Klaviyo" };
  const formatRefreshTime = (value: string | null) => value
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "No successful refresh recorded";
  const connectedCount = sources.filter((source) => source.data && !source.error).length;
  const primaryInvalid = Boolean(shopifyError || metaError);
  const insights = useMemo(() => {
    const items: Array<{ title: string; body: string }> = [];
    if (meta?.campaigns.length) {
      const leader = [...meta.campaigns].sort((a, b) => b.spend - a.spend)[0];
      const share = meta.spend ? (leader.spend / meta.spend) * 100 : 0;
      items.push({ title: "Spend concentration", body: `${leader.name} accounts for ${share.toFixed(0)}% of Meta spend in this range.` });
    }
    if (funnel.length > 1) {
      const drops = funnel.slice(1).map((step, index) => ({ label: `${funnel[index].label} to ${step.label}`, rate: Number(step.note?.split("%")[0] ?? 0) }));
      const largest = drops.sort((a, b) => a.rate - b.rate)[0];
      items.push({ title: "Largest funnel drop-off", body: `${largest.label} converts at ${largest.rate.toFixed(1)}% of the prior stage.` });
    }
    if (blendedRoas !== null) items.push({ title: "Blended efficiency", body: `Shopify revenue is ${blendedRoas.toFixed(2)}× Meta spend for the selected period.` });
    return items.slice(0, 3);
  }, [meta, funnel, blendedRoas]);

  return (
    <main className="mx-auto min-h-screen max-w-[1360px] overflow-x-clip px-4 pb-20 sm:px-6 xl:px-10">
      <header className="flex flex-col gap-6 border-b border-rule py-6 sm:py-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Kaahu</p>
          <h1 className="font-display mt-2 text-[2rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.45rem]">Performance dashboard</h1>
          <p className="mt-1.5 text-[13px] text-ink-soft"><AcronymText>Shopify, Meta Ads, GA4, and Klaviyo · combined view</AcronymText>{syncing ? " · refreshing latest data…" : ""}</p>
          <details className="mt-3 sm:hidden">
            <summary className="min-h-11 cursor-pointer content-center text-xs font-medium text-ink-soft">{loading ? "Connecting sources…" : `${connectedCount} of 4 sources connected`}</summary>
            <div className="grid gap-2 pb-1" aria-live="polite">{sources.map((source) => <span key={source.name} className="inline-flex items-center gap-2 text-xs"><span className={`h-2 w-2 rounded-full ${source.error ? "bg-brick" : source.data ? "bg-moss" : "bg-ink-faint"}`} /><AcronymText>{source.name}</AcronymText> {source.error ? "unavailable" : source.data ? "connected" : "connecting"}</span>)}</div>
          </details>
          <div className="mt-3 hidden flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-faint sm:flex" aria-label="Connection status" aria-live="polite">
            <span className="uppercase tracking-[0.08em]">Connections</span>
            <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${shopifyError ? "bg-brick" : shopify ? "bg-moss" : "bg-ink-faint"}`} />Shopify {shopifyError ? "unavailable" : shopify ? "live" : "connecting"}</span>
            <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${metaError ? "bg-brick" : meta ? "bg-moss" : "bg-ink-faint"}`} />Meta Ads {metaError ? "unavailable" : meta ? "live" : "connecting"}</span>
            <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${ga4Error ? "bg-brick" : ga4 ? "bg-moss" : "bg-ink-faint"}`} /><AcronymText>GA4</AcronymText> {ga4Error ? "unavailable" : ga4 ? "live" : "connecting"}</span>
            <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${klaviyoError ? "bg-brick" : klaviyo ? "bg-moss" : "bg-ink-faint"}`} />Klaviyo {klaviyoError ? "unavailable" : klaviyo ? "live" : "connecting"}</span>
          </div>
        </div>
        <DateRangePicker value={range} onChange={changeRange} />
      </header>

      {syncWarning && <div role="status" className="mt-6 rounded-lg border border-amber/30 bg-surface px-4 py-3 text-sm text-ink-soft">
        <p>{syncWarning}</p>
        {refreshStatuses.length > 0 && <div className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-rule pt-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {refreshStatuses.map((status) => <p key={status.source}><span className="font-semibold text-ink">{sourceLabels[status.source]}</span><br /><span>Last refreshed: {formatRefreshTime(status.lastRefreshedAt)}</span></p>)}
        </div>}
      </div>}

      {(shopifyError || metaError || ga4Error || klaviyoError) && (
        <div role={primaryInvalid ? "alert" : "status"} className={`mt-6 rounded-lg border px-4 py-3 text-sm ${primaryInvalid ? "border-brick/30 bg-brick/5 text-brick" : "border-amber/30 bg-surface text-ink"}`}>
          <p className="font-semibold">{sources.filter((source) => source.error).map((source) => source.name).join(" and ")} unavailable</p>
          <p className="mt-0.5 text-xs text-ink-soft">{primaryInvalid ? "Some primary dashboard calculations may be unavailable." : "Other dashboard data is current."}</p>
          <details className="mt-2 text-xs"><summary className="cursor-pointer font-medium">Technical details</summary><div className="mt-2 text-ink-soft">{sources.filter((source) => source.error).map((source) => <p key={source.name}>{source.name}: {source.error}</p>)}</div></details>
        </div>
      )}

      <section aria-label="Key performance indicators" aria-busy={loading} className="my-6 grid grid-cols-1 gap-3 min-[340px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
      </section>

      {insights.length > 0 && <section aria-labelledby="insights-title" className="mb-6 rounded-xl bg-accent px-5 py-5 text-white sm:px-6">
        <div className="flex items-center justify-between gap-4"><h2 id="insights-title" className="font-display text-xl">Executive insights</h2><span className="text-[10px] uppercase tracking-[.12em] text-white/65">Selected period</span></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">{insights.map((insight, index) => <article key={insight.title} className={index ? "hidden border-white/20 sm:block sm:border-l sm:pl-5" : ""}><h3 className="text-xs font-semibold uppercase tracking-[.06em] text-white/70">{insight.title}</h3><p className="mt-1.5 text-sm leading-5">{insight.body}</p></article>)}</div>
        {insights.length > 1 && <details className="mt-3 sm:hidden"><summary className="min-h-11 cursor-pointer content-center text-xs font-semibold">Show {insights.length - 1} more insights</summary><div className="grid gap-4 border-t border-white/20 pt-4">{insights.slice(1).map((insight) => <article key={insight.title}><h3 className="text-xs font-semibold uppercase tracking-[.06em] text-white/70">{insight.title}</h3><p className="mt-1 text-sm">{insight.body}</p></article>)}</div></details>}
      </section>}

      <section aria-label="Performance overview" className="mb-8 grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 xl:col-span-8"><SpendRevenueChart revenueDaily={shopify?.daily ?? []} spendDaily={meta?.daily ?? []} dailyAds={meta?.dailyAds ?? []} from={range.from} to={range.to} loading={loading} currency={shopify?.currency} /></div>
        <div className="lg:col-span-5 xl:col-span-4"><MetaFunnel steps={funnel} ads={meta?.ads ?? []} /></div>
      </section>

      <section aria-labelledby="reports-title">
        <h2 id="reports-title" className="sr-only">Detailed reporting</h2>
        <div className="mb-4 overflow-x-auto" role="tablist" aria-label="Detailed reports"><div className="inline-flex min-w-max gap-1 rounded-xl border border-rule bg-surface p-1">{([['campaigns','Campaigns'],['geography','Geography'],['acquisition','Acquisition'],['retention','Retention']] as const).map(([key,label]) => <button key={key} role="tab" aria-selected={activeReport === key} onClick={() => setActiveReport(key)} className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${activeReport === key ? "bg-accent text-white" : "text-ink-soft hover:bg-paper"}`}>{label}</button>)}</div></div>
        <div role="tabpanel">
          {activeReport === "campaigns" && <CampaignTable campaigns={campaigns} range={range} />}
          {activeReport === "geography" && <MarketSpendPanel range={range} />}
          {activeReport === "acquisition" && (ga4 ? <Ga4Analytics data={ga4} from={range.from} to={range.to} /> : <div className="rounded-xl border border-rule bg-surface p-8 text-sm text-ink-soft">{ga4Error ? <><AcronymText>GA4</AcronymText> is unavailable for this range.</> : "Loading acquisition data…"}</div>)}
          {activeReport === "retention" && (klaviyo ? <KlaviyoAnalytics data={klaviyo} storeRevenue={shopify?.revenue ?? null} /> : <div className="rounded-xl border border-rule bg-surface p-8 text-sm text-ink-soft">{klaviyoError ? "Klaviyo is unavailable for this range." : "Loading retention data…"}</div>)}
        </div>
      </section>

      <footer className="mt-8 border-t border-rule pt-4 text-[11px] text-ink-faint">
        <AcronymText>Figures are refreshed into Supabase when the dashboard opens, then every report is read from Supabase. GA4 conversion rate uses site-wide sessions and transactions; Meta and Klaviyo retain their own attribution settings.</AcronymText>
      </footer>
      <KpiDetailPanel detail={activeKpi ? kpiDetails[activeKpi] ?? null : null} onClose={() => setActiveKpi(null)} from={range.from} to={range.to} timezone={shopify?.timezone ?? "Account timezones"} />
      {shopify && <OrderDetailsDrawer open={ordersOpen} onClose={() => setOrdersOpen(false)} orders={shopify.orders} currency={shopify.currency} timezone={shopify.timezone} from={range.from} to={range.to} attributionLookup={attributionLookup} />}
    </main>
  );
}
