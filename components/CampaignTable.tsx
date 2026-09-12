"use client";

import { Fragment, useEffect, useState } from "react";
import type { DateRange } from "./DateRangePicker";
import { CampaignDetailPanel, type CampaignDetailData } from "./CampaignDetailPanel";
import { AcronymText } from "./AcronymText";

export type PerformanceRow = {
  id: string;
  name: string;
  type: string;
  spend: string;
  frequency: string;
  ctr: string;
  cpc: string;
  cpm: string;
  purchases: string;
  roas: string;
  cpa: string;
  strong: boolean;
  objective?: string;
  role?: "tofu" | "mofu" | "sales";
  raw: { spend: number; frequency: number; ctr: number; cpc: number; cpm: number; purchases: number; roas: number; cpa: number | null };
};

type ApiRow = {
  id: string; name: string; spend: number; impressions: number; clicks: number;
  purchases: number; frequency: number; ctr: number; cpc: number; cpm: number; roas: number; cpa: number | null;
};
type ChildLevel = "adset" | "ad";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);
const formatRow = (row: ApiRow): PerformanceRow => ({
  id: row.id,
  name: row.name,
  type: `${row.impressions.toLocaleString("en-US")} impressions · ${row.clicks.toLocaleString("en-US")} link clicks`,
  spend: money(row.spend),
  frequency: row.frequency.toFixed(2),
  ctr: `${row.ctr.toFixed(2)}%`,
  cpc: money(row.cpc),
  cpm: money(row.cpm),
  purchases: row.purchases.toLocaleString("en-US"),
  roas: `${row.roas.toFixed(2)}×`,
  cpa: row.cpa === null ? "—" : money(row.cpa),
  strong: row.roas >= 3,
  raw: { spend: row.spend, frequency: row.frequency, ctr: row.ctr, cpc: row.cpc, cpm: row.cpm, purchases: row.purchases, roas: row.roas, cpa: row.cpa },
});

export function CampaignTable({ campaigns, range }: { campaigns: PerformanceRow[]; range: DateRange }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Record<string, PerformanceRow[]>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: "name" | keyof PerformanceRow["raw"]; direction: "asc" | "desc" }>({ key: "spend", direction: "desc" });
  const [detailCampaign, setDetailCampaign] = useState<PerformanceRow | null>(null);
  const [detail, setDetail] = useState<CampaignDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    setExpanded(new Set());
    setChildren({});
    setLoading(new Set());
    setErrors({});
    setDetailCampaign(null);
  }, [range.from, range.to]);

  const openCampaignDetail = async (campaign: PerformanceRow) => {
    setDetailCampaign(campaign);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ campaignId: campaign.id, to: range.to });
      const response = await fetch(`/api/meta/campaign-detail?${params}`, { cache: "no-store" });
      const body = (await response.json()) as CampaignDetailData & { error?: string; detail?: string };
      if (!response.ok) throw new Error(body.detail ?? body.error ?? "Campaign detail could not be loaded");
      setDetail(body);
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : "Campaign detail could not be loaded");
    } finally {
      setDetailLoading(false);
    }
  };

  const toggle = async (level: ChildLevel, parent: PerformanceRow) => {
    const key = `${level}:${parent.id}`;
    if (expanded.has(key)) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      return;
    }

    setExpanded((current) => new Set(current).add(key));
    if (children[key]) return;

    setLoading((current) => new Set(current).add(key));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to, level, parentId: parent.id });
      const response = await fetch(`/api/meta/drilldown?${params}`, { cache: "no-store" });
      const body = (await response.json()) as { rows?: ApiRow[]; detail?: string; error?: string };
      if (!response.ok || !body.rows) throw new Error(body.detail ?? body.error ?? "Breakdown could not be loaded");
      setChildren((current) => ({ ...current, [key]: body.rows!.map(formatRow) }));
    } catch (requestError) {
      setErrors((current) => ({ ...current, [key]: requestError instanceof Error ? requestError.message : "Breakdown could not be loaded" }));
    } finally {
      setLoading((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const cells = (row: PerformanceRow) => (
    <>
      {[row.spend, row.frequency, row.ctr, row.cpc, row.cpm, row.purchases].map((value, index) => <td key={index} className="border-b border-rule px-3 py-3.5 text-right tabular-nums">{value}</td>)}
      <td className={`border-b border-rule px-3 py-3.5 text-right font-semibold tabular-nums ${row.strong ? "text-moss" : "text-brick"}`}>{row.roas}</td>
      <td className="border-b border-rule px-3 py-3.5 text-right tabular-nums">{row.cpa}</td>
    </>
  );

  const sortedRows = (rows: PerformanceRow[]) => [...rows].sort((a, b) => {
    const left = sort.key === "name" ? a.name : (a.raw[sort.key] ?? -1);
    const right = sort.key === "name" ? b.name : (b.raw[sort.key] ?? -1);
    const comparison = typeof left === "string" ? left.localeCompare(String(right)) : left - Number(right);
    return sort.direction === "asc" ? comparison : -comparison;
  });
  const updateSort = (key: "name" | keyof PerformanceRow["raw"]) => setSort((current) => current.key === key
    ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
    : { key, direction: key === "name" ? "asc" : "desc" });
  const sortMark = (key: "name" | keyof PerformanceRow["raw"]) => sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕";

  const nameCell = (row: PerformanceRow, depth: 0 | 1 | 2, level?: ChildLevel) => {
    const key = level ? `${level}:${row.id}` : "";
    const isOpen = level ? expanded.has(key) : false;
    return (
      <td className="border-b border-rule px-3 py-3.5 font-medium">
        <div style={{ paddingLeft: `${depth * 22}px` }} className="relative">
          {depth > 0 && <span aria-hidden="true" className="absolute left-0 top-2 h-px w-3 bg-rule" />}
          {level && depth === 0 ? (
            <span className="inline-flex max-w-full items-start gap-2">
              <button type="button" onClick={() => toggle(level, row)} aria-expanded={isOpen} aria-label={`${isOpen ? "Collapse" : "Expand"} ${row.name} ad sets`} className="mt-0.5 inline-block w-3 shrink-0 text-[10px] text-ink-faint transition-transform hover:text-accent focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><span aria-hidden="true" className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span></button>
              <button type="button" onClick={() => openCampaignDetail(row)} className="text-left underline-offset-2 hover:text-accent hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">{row.name}</button>
            </span>
          ) : level ? (
            <button type="button" onClick={() => toggle(level, row)} aria-expanded={isOpen} className="inline-flex max-w-full items-start gap-2 text-left underline-offset-2 hover:text-accent focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">
              <span aria-hidden="true" className={`mt-0.5 inline-block w-3 shrink-0 text-[10px] text-ink-faint transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
              <span>{row.name}</span>
            </button>
          ) : (
            <span className="inline-flex items-start gap-2"><span aria-hidden="true" className="w-3 shrink-0 text-center text-ink-faint">•</span><span>{row.name}</span></span>
          )}
          <span className="mt-0.5 block text-[11px] font-normal text-ink-faint" style={{ paddingLeft: level ? "20px" : "20px" }}>{row.type}</span>
        </div>
      </td>
    );
  };

  const statusRow = (key: string, depth: number) => {
    if (loading.has(key)) return <tr><td colSpan={9} className="border-b border-rule py-4 text-xs text-ink-faint" style={{ paddingLeft: `${36 + depth * 22}px` }}>Loading…</td></tr>;
    if (errors[key]) return <tr><td colSpan={9} className="border-b border-rule py-4 text-xs text-brick" style={{ paddingLeft: `${36 + depth * 22}px` }}>{errors[key]}</td></tr>;
    if (children[key]?.length === 0) return <tr><td colSpan={9} className="border-b border-rule py-4 text-xs text-ink-faint" style={{ paddingLeft: `${36 + depth * 22}px` }}>No delivery in this date range.</td></tr>;
    return null;
  };

  return (
    <section className="rounded-xl border border-rule bg-surface p-4 sm:p-6">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <div><h2 className="text-[15px] font-semibold">Campaign breakdown</h2><p className="mt-1 text-xs text-ink-faint">Click a campaign name for detail · use triangles to expand</p></div>
        <span className="text-xs text-ink-faint">Sorted by spend</span>
      </div>
      <div className="grid gap-3 md:hidden">
        {!campaigns.length && <p className="py-10 text-center text-sm text-ink-faint">No campaigns had delivery in this date range.</p>}
        {sortedRows(campaigns).map((campaign) => {
          const key = `adset:${campaign.id}`;
          const isOpen = expanded.has(key);
          return <article key={campaign.id} className="rounded-lg border border-rule bg-white p-4">
            <div className="flex items-start justify-between gap-3"><button type="button" onClick={() => openCampaignDetail(campaign)} className="min-h-11 text-left font-semibold leading-5 text-ink hover:text-accent">{campaign.name}<span className="mt-1 block text-[11px] font-normal text-ink-faint">{campaign.type}</span></button><span className={`font-display text-lg tabular-nums ${campaign.strong ? "text-moss" : "text-brick"}`}>{campaign.roas}</span></div>
            <dl className="mt-3 grid grid-cols-3 gap-3 border-y border-rule py-3 text-xs"><div><dt className="text-ink-faint">Spend</dt><dd className="mt-1 font-semibold tabular-nums text-orange">{campaign.spend}</dd></div><div><dt className="text-ink-faint">Purchases</dt><dd className="mt-1 font-semibold tabular-nums">{campaign.purchases}</dd></div><div><dt className="text-ink-faint"><AcronymText>CPA</AcronymText></dt><dd className="mt-1 font-semibold tabular-nums">{campaign.cpa}</dd></div></dl>
            <button type="button" onClick={() => toggle("adset", campaign)} aria-expanded={isOpen} className="mt-2 min-h-11 w-full text-left text-xs font-semibold text-accent">{isOpen ? "Hide ad sets and metrics" : "Show ad sets and more metrics"} <span aria-hidden="true">{isOpen ? "↑" : "↓"}</span></button>
            {isOpen && <div className="border-t border-rule pt-3 text-xs"><dl className="grid grid-cols-3 gap-3"><div><dt className="text-ink-faint"><AcronymText>CTR</AcronymText></dt><dd>{campaign.ctr}</dd></div><div><dt className="text-ink-faint"><AcronymText>CPC</AcronymText></dt><dd>{campaign.cpc}</dd></div><div><dt className="text-ink-faint"><AcronymText>CPM</AcronymText></dt><dd>{campaign.cpm}</dd></div></dl>{loading.has(key) && <p className="mt-3 text-ink-faint">Loading ad sets…</p>}{errors[key] && <p className="mt-3 text-brick">{errors[key]}</p>}{children[key]?.map((child) => <div key={child.id} className="mt-3 flex justify-between gap-3 border-t border-rule pt-3"><span>{child.name}</span><span className="tabular-nums">{child.spend} · {child.roas}</span></div>)}</div>}
          </article>;
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[940px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-surface"><tr>{[
            { label: "Campaign / ad set / ad", key: "name" as const }, { label: "Spend", key: "spend" as const },
            { label: "Avg daily frequency", key: "frequency" as const },
            { label: "CTR", key: "ctr" as const }, { label: "CPC", key: "cpc" as const },
            { label: "CPM", key: "cpm" as const },
            { label: "Purchases", key: "purchases" as const }, { label: "ROAS", key: "roas" as const }, { label: "CPA", key: "cpa" as const },
          ].map((header, index) => <th key={header.key} aria-sort={sort.key === header.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`border-b border-rule px-3 pb-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-faint ${index ? "text-right" : "sticky left-0 z-20 bg-surface text-left"}`}><button type="button" onClick={() => updateSort(header.key)} className={`min-h-11 inline-flex items-center gap-1 hover:text-ink ${index ? "justify-end" : "justify-start"}`}><AcronymText>{header.label}</AcronymText><span aria-hidden="true" className={sort.key === header.key ? "text-accent" : "text-rule"}>{sortMark(header.key)}</span></button></th>)}</tr></thead>
          <tbody>
            {!campaigns.length && <tr><td colSpan={9} className="px-3 py-12 text-center text-ink-faint">No campaigns had delivery in this date range.</td></tr>}
            {sortedRows(campaigns).map((campaign) => {
              const adsetKey = `adset:${campaign.id}`;
              return <Fragment key={campaign.id}>
                <tr className="bg-white hover:bg-paper/70">{nameCell(campaign, 0, "adset")}{cells(campaign)}</tr>
                {expanded.has(adsetKey) && statusRow(adsetKey, 1)}
                {expanded.has(adsetKey) && !loading.has(adsetKey) && sortedRows(children[adsetKey] ?? []).map((adset) => {
                  const adKey = `ad:${adset.id}`;
                  return <Fragment key={adset.id}>
                    <tr className="bg-paper/45 hover:bg-accent-soft/35">{nameCell(adset, 1, "ad")}{cells(adset)}</tr>
                    {expanded.has(adKey) && statusRow(adKey, 2)}
                    {expanded.has(adKey) && !loading.has(adKey) && sortedRows(children[adKey] ?? []).map((ad) => <tr key={ad.id} className="bg-accent-soft/20 hover:bg-accent-soft/40">{nameCell(ad, 2)}{cells(ad)}</tr>)}
                  </Fragment>;
                })}
              </Fragment>;
            })}
          </tbody>
        </table>
      </div>
      <CampaignDetailPanel campaign={detailCampaign ? { id: detailCampaign.id, name: detailCampaign.name, objective: detailCampaign.objective, role: detailCampaign.role } : null} detail={detail} loading={detailLoading} error={detailError} to={range.to} onClose={() => setDetailCampaign(null)} />
    </section>
  );
}
