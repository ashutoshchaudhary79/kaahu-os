"use client";

import { useEffect, useMemo, useState } from "react";

type FunnelRole = "tofu" | "mofu" | "sales";
type Daily = { date: string; spend: number; impressions: number; clicks: number; landingPageViews: number; purchases: number; purchaseValue: number };
export type CampaignDetailData = { id: string; from: string; to: string; daily: Daily[]; ads: Array<{ id: string; name: string; spend: number; thumbnailUrl: string | null }> };

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);
const displayDate = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

function fillDays(to: string, days: number, rows: Daily[]) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const end = new Date(`${to}T12:00:00Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - 1 - index));
    const key = date.toISOString().slice(0, 10);
    return byDate.get(key) ?? { date: key, spend: 0, impressions: 0, clicks: 0, landingPageViews: 0, purchases: 0, purchaseValue: 0 };
  });
}

function Sparkline({ rows, role }: { rows: Daily[]; role: FunnelRole }) {
  const width = 660;
  const height = 180;
  const outcome = (row: Daily) => role === "tofu" ? row.impressions : role === "mofu" ? row.landingPageViews : row.purchaseValue;
  const spendMax = Math.max(...rows.map((row) => row.spend), 1);
  const outcomeMax = Math.max(...rows.map(outcome), 1);
  const points = (value: (row: Daily) => number, max: number) => rows.map((row, index) => `${(index / Math.max(rows.length - 1, 1)) * width},${height - (value(row) / max) * (height - 10)}`).join(" ");
  const outcomeLabel = role === "tofu" ? "impressions" : role === "mofu" ? "landing-page views" : "Meta-attributed revenue";
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Campaign daily spend and ${outcomeLabel}`} className="mt-4 h-auto w-full overflow-visible">
    {[0, .5, 1].map((ratio) => <line key={ratio} x1="0" y1={height - ratio * (height - 10)} x2={width} y2={height - ratio * (height - 10)} stroke="#e4e1d8" />)}
    <polyline points={points(outcome, outcomeMax)} fill="none" stroke="#7a6a52" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    <polyline points={points((row) => row.spend, spendMax)} fill="none" stroke="#a8503d" strokeWidth="1.7" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
  </svg>;
}

export function CampaignDetailPanel({ campaign, detail, loading, error, to, onClose }: { campaign: { id: string; name: string; objective?: string; role?: FunnelRole } | null; detail: CampaignDetailData | null; loading: boolean; error: string | null; to: string; onClose: () => void }) {
  const [days, setDays] = useState<7 | 30>(30);
  useEffect(() => {
    if (!campaign) return;
    setDays(30);
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = previous; };
  }, [campaign, onClose]);
  const rows = useMemo(() => detail ? fillDays(to, days, detail.daily) : [], [detail, to, days]);
  const stats = useMemo(() => {
    const withSpend = rows.filter((row) => row.spend > 0);
    const role = campaign?.role ?? "sales";
    const resultCount = (row: Daily) => role === "tofu" ? row.impressions : role === "mofu" ? row.landingPageViews : row.purchases;
    const score = (row: Daily) => role === "sales" ? row.purchaseValue / row.spend : resultCount(row) ? (row.spend / resultCount(row)) * (role === "tofu" ? 1000 : 1) : Number.POSITIVE_INFINITY;
    const scored = withSpend.map((row) => ({ ...row, score: score(row) }));
    const valid = scored.filter((row) => Number.isFinite(row.score));
    const best = role === "sales" ? [...scored].sort((a, b) => b.score - a.score)[0] : [...valid].sort((a, b) => a.score - b.score)[0];
    const worst = role === "sales" ? [...scored].sort((a, b) => a.score - b.score)[0] : [...scored].sort((a, b) => b.score - a.score)[0];
    const lastResult = [...rows].reverse().find((row) => resultCount(row) > 0);
    const since = lastResult ? Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${lastResult.date}T12:00:00Z`)) / 86_400_000) : null;
    const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);
    const totalResults = rows.reduce((sum, row) => sum + resultCount(row), 0);
    const blendedCost = totalResults ? (totalSpend / totalResults) * (role === "tofu" ? 1000 : 1) : null;
    return { best, worst, since, role, totalResults, blendedCost };
  }, [rows, to, campaign?.role]);
  if (!campaign) return null;

  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="campaign-detail-title">
    <button type="button" aria-label="Close campaign details" onClick={onClose} className="absolute inset-0 bg-ink/35 backdrop-blur-[1px]" />
    <section className="absolute inset-y-0 right-0 flex w-full max-w-[880px] flex-col bg-paper shadow-2xl">
      <header className="flex items-start justify-between gap-6 border-b border-rule bg-white px-5 py-5 sm:px-7"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Meta campaign</p><h2 id="campaign-detail-title" className="font-display mt-1 text-2xl font-medium">{campaign.name}</h2><p className="mt-1 text-xs text-ink-faint">{campaign.objective ? campaign.objective.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Objective inferred from funnel role"} · Performance through {to}</p></div><button type="button" onClick={onClose} className="rounded border border-rule bg-white px-3 py-1.5 text-sm text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">Close</button></header>
      <div className="flex-1 overflow-auto p-5 sm:p-7">
        {loading && <div className="py-24 text-center text-sm text-ink-faint">Loading campaign detail…</div>}
        {error && <div className="rounded border border-brick/30 bg-brick/5 p-4 text-sm text-brick">{error}</div>}
        {detail && !loading && <>
          <div className="flex items-center justify-between gap-4"><div className="flex gap-4 text-[11px] text-ink-soft"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" />{stats.role === "tofu" ? "Impressions" : stats.role === "mofu" ? "Landing views" : "Revenue"}</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brick" />Spend</span></div><div className="inline-flex rounded border border-rule bg-white p-0.5">{([7, 30] as const).map((value) => <button key={value} type="button" onClick={() => setDays(value)} aria-pressed={days === value} className={`rounded px-3 py-1 text-xs ${days === value ? "bg-accent text-white" : "text-ink-soft hover:text-ink"}`}>{value} days</button>)}</div></div>
          <Sparkline rows={rows} role={stats.role} />
          <p className="mt-1 text-right text-[10px] text-ink-faint">Series independently scaled to compare daily movement</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded border border-rule bg-white p-4"><p className="text-[10px] uppercase tracking-wide text-ink-faint">Best day · {stats.role === "sales" ? "ROAS" : stats.role === "tofu" ? "CPM" : "Cost / landing view"}</p><p className="mt-2 text-sm font-semibold">{stats.best ? displayDate(stats.best.date) : "—"}</p><p className="mt-1 text-xs text-moss">{stats.best ? stats.role === "sales" ? `${stats.best.score.toFixed(2)}×` : money(stats.best.score) : "No qualifying day"}</p></div>
            <div className="rounded border border-rule bg-white p-4"><p className="text-[10px] uppercase tracking-wide text-ink-faint">Worst day · {stats.role === "sales" ? "ROAS" : stats.role === "tofu" ? "CPM" : "Cost / landing view"}</p><p className="mt-2 text-sm font-semibold">{stats.worst ? displayDate(stats.worst.date) : "—"}</p><p className="mt-1 text-xs text-brick">{stats.worst ? Number.isFinite(stats.worst.score) ? stats.role === "sales" ? `${stats.worst.score.toFixed(2)}×` : money(stats.worst.score) : "No result" : "No spend"}</p></div>
            <div className="rounded border border-rule bg-white p-4"><p className="text-[10px] uppercase tracking-wide text-ink-faint">{stats.role === "sales" ? "Since last purchase" : stats.role === "mofu" ? "Since last landing view" : "Period efficiency"}</p>{stats.role === "tofu" ? <><p className="mt-2 text-sm font-semibold">{stats.totalResults.toLocaleString("en-US")} impressions</p><p className="mt-1 text-xs text-ink-faint">{stats.blendedCost === null ? "—" : `${money(stats.blendedCost)} blended CPM`}</p></> : <><p className="mt-2 text-sm font-semibold">{stats.since === null ? `No results in ${days} days` : stats.since === 0 ? "Today" : `${stats.since} day${stats.since === 1 ? "" : "s"}`}</p><p className="mt-1 text-xs text-ink-faint">{stats.role === "sales" ? "Meta-attributed purchase" : "Meta landing-page view"}</p></>}</div>
          </div>
          <section className="mt-7"><div className="flex items-baseline justify-between"><h3 className="text-sm font-semibold">Top ads and creative</h3><span className="text-[11px] text-ink-faint">30-day spend</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{detail.ads.slice(0, 6).map((ad) => <div key={ad.id} className="overflow-hidden rounded border border-rule bg-white"><div role="img" aria-label={ad.thumbnailUrl ? `Creative thumbnail for ${ad.name}` : `No creative thumbnail for ${ad.name}`} className="aspect-[1.91/1] bg-accent-soft bg-cover bg-center" style={ad.thumbnailUrl ? { backgroundImage: `url(${JSON.stringify(ad.thumbnailUrl)})` } : undefined}>{!ad.thumbnailUrl && <span className="flex h-full items-center justify-center text-[10px] uppercase tracking-wide text-ink-faint">No thumbnail</span>}</div><div className="p-3"><p className="truncate text-xs font-medium" title={ad.name}>{ad.name}</p><p className="mt-1 text-[11px] text-ink-faint">{money(ad.spend)} spend</p></div></div>)}</div>{detail.ads.length === 0 && <p className="mt-4 text-xs text-ink-faint">No ads delivered in this period.</p>}</section>
        </>}
      </div>
    </section>
  </div>;
}
