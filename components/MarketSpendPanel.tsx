"use client";

import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "./DateRangePicker";

type Dimension = "state" | "comscore";
type SortKey = "name" | "spend" | "spendShare" | "impressions" | "clicks" | "ctr" | "cpm";
type SortDirection = "asc" | "desc";
type Market = { name: string; spend: number; spendShare: number; impressions: number; clicks: number; ctr: number; cpm: number };
type MarketData = { totalSpend: number; dimension: Dimension; markets: Market[] };

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);

export function MarketSpendPanel({ range }: { range: DateRange }) {
  const [dimension, setDimension] = useState<Dimension>("state");
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "spend", direction: "desc" });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setShowAll(false);
    const params = new URLSearchParams({ from: range.from, to: range.to, dimension });
    fetch(`/api/meta/markets?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as MarketData & { detail?: string; error?: string };
        if (!response.ok) throw new Error(body.detail ?? body.error ?? "Geographic data could not be loaded");
        return body;
      })
      .then(setData)
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(requestError instanceof Error ? requestError.message : "Geographic data could not be loaded");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range.from, range.to, dimension]);

  const sorted = useMemo(() => [...(data?.markets ?? [])].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    const comparison = typeof left === "string" ? left.localeCompare(String(right)) : left - Number(right);
    return sort.direction === "asc" ? comparison : -comparison;
  }), [data, sort]);
  const visible = showAll ? sorted : sorted.slice(0, 15);
  const maxSpend = Math.max(...visible.map((market) => market.spend), 1);
  const topTenShare = [...(data?.markets ?? [])].sort((a, b) => b.spend - a.spend).slice(0, 10).reduce((sum, market) => sum + market.spendShare, 0);

  const updateSort = (key: SortKey) => setSort((current) => current.key === key
    ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
    : { key, direction: key === "name" ? "asc" : "desc" });
  const sortMark = (key: SortKey) => sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕";
  const label = dimension === "state" ? "states" : "markets";

  const headers: Array<{ label: string; key: SortKey }> = [
    { label: dimension === "state" ? "State" : "Market", key: "name" },
    { label: "Spend", key: "spend" },
    { label: "Share", key: "spendShare" },
    { label: "Impressions", key: "impressions" },
    { label: "Link clicks", key: "clicks" },
    { label: "CTR", key: "ctr" },
    { label: "CPM", key: "cpm" },
  ];

  return (
    <section className="rounded-xl border border-rule bg-surface p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-[15px] font-semibold">Geographic spend</h2><span className="rounded-full bg-accent-soft px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">All campaigns</span></div>
          <p className="mt-1 text-xs text-ink-faint">Where Meta ad spend is delivered · click headers to sort</p>
        </div>
        <div className="flex flex-wrap items-end gap-5">
          {data && <div className="flex gap-5 text-right text-xs"><div><span className="block text-ink-faint">{dimension === "state" ? "States" : "Markets"} reached</span><strong className="font-medium text-ink">{data.markets.length}</strong></div><div><span className="block text-ink-faint">Top 10 share</span><strong className="font-medium text-ink">{topTenShare.toFixed(1)}%</strong></div></div>}
          <div role="group" aria-label="Geographic breakdown" className="inline-flex rounded border border-rule bg-paper p-0.5 text-xs">
            {(["state", "comscore"] as Dimension[]).map((option) => <button key={option} type="button" onClick={() => setDimension(option)} aria-pressed={dimension === option} className={`rounded-sm px-3 py-1.5 font-medium transition-colors ${dimension === option ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>{option === "state" ? "State" : "Comscore"}</button>)}
          </div>
        </div>
      </div>

      {loading && <div className="py-16 text-center text-sm text-ink-faint">Loading {label}…</div>}
      {error && <div role="alert" className="rounded border border-brick/30 bg-brick/5 px-3 py-2 text-xs text-brick">{error}</div>}
      {!loading && !error && !sorted.length && <div className="py-16 text-center text-sm text-ink-faint">No {label} had delivery in this date range.</div>}

      {!loading && !error && sorted.length > 0 && <>
        <div className="grid gap-2 md:hidden">{visible.map((market) => <article key={market.name} className="rounded-lg border border-rule bg-white p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 border-b border-rule pb-3">
            <strong className="truncate text-sm">{market.name}</strong>
            <span className="font-semibold tabular-nums text-orange">{money(market.spend)}</span>
            <span className="w-12 text-right text-xs font-medium tabular-nums text-ink-soft">{market.spendShare.toFixed(1)}%</span>
          </div>
          <dl className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
            <div className="col-span-2"><dt className="text-ink-faint">Impressions</dt><dd className="mt-1 font-medium tabular-nums">{market.impressions.toLocaleString("en-US")}</dd></div>
            <div className="col-span-2"><dt className="text-ink-faint">Link clicks</dt><dd className="mt-1 font-medium tabular-nums">{market.clicks.toLocaleString("en-US")}</dd></div>
            <div className="col-span-2"><dt className="text-ink-faint">CTR</dt><dd className="mt-1 font-medium tabular-nums">{market.ctr.toFixed(2)}%</dd></div>
            <div className="col-span-2"><dt className="text-ink-faint">CPM</dt><dd className="mt-1 font-medium tabular-nums">{money(market.cpm)}</dd></div>
          </dl>
        </article>)}</div>
        <div className={`hidden overflow-x-auto md:block ${showAll ? "max-h-[560px] overflow-y-auto rounded border border-rule" : ""}`}>
          <table className="w-full min-w-[780px] border-collapse text-[13px]">
            <thead className={showAll ? "sticky top-0 z-10 bg-white shadow-[0_1px_0_#e4e1d8]" : ""}><tr>{headers.map((header, index) => <th key={header.key} className={`border-b border-rule px-3 pb-2.5 pt-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-faint ${index ? "text-right" : "text-left"}`}><button type="button" onClick={() => updateSort(header.key)} className={`inline-flex items-center gap-1 hover:text-ink ${index ? "justify-end" : "justify-start"}`}>{header.label}<span aria-hidden="true" className={sort.key === header.key ? "text-accent" : "text-rule"}>{sortMark(header.key)}</span></button></th>)}</tr></thead>
            <tbody>{visible.map((market) => <tr key={market.name} className="last:[&_td]:border-b-0 hover:bg-paper/70">
              <td className="w-[32%] border-b border-rule px-3 py-3"><div className="font-medium">{market.name}</div><div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-accent-soft"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max((market.spend / maxSpend) * 100, 1)}%` }} /></div></td>
              <td className="border-b border-rule px-3 py-3 text-right font-medium tabular-nums">{money(market.spend)}</td>
              <td className="border-b border-rule px-3 py-3 text-right tabular-nums">{market.spendShare.toFixed(1)}%</td>
              <td className="border-b border-rule px-3 py-3 text-right tabular-nums">{market.impressions.toLocaleString("en-US")}</td>
              <td className="border-b border-rule px-3 py-3 text-right tabular-nums">{market.clicks.toLocaleString("en-US")}</td>
              <td className="border-b border-rule px-3 py-3 text-right tabular-nums">{market.ctr.toFixed(2)}%</td>
              <td className="border-b border-rule px-3 py-3 text-right tabular-nums">{money(market.cpm)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {sorted.length > 15 && <div className="mt-4 border-t border-rule pt-4 text-center"><button type="button" onClick={() => setShowAll((current) => !current)} className="text-xs font-medium text-accent underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">{showAll ? "Show top 15" : `Show all ${sorted.length} ${label}`}</button></div>}
      </>}
    </section>
  );
}
