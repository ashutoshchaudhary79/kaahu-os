"use client";

import { useEffect, useMemo, useState } from "react";
import { PanelHeading } from "./PanelHeading";

type DailyPoint = { date: string; revenue: number; orders: number };
type SpendPoint = { date: string; spend: number };
type DailyAd = { id: string; name: string; spend: number };
const chart = { width: 680, height: 250, left: 56, right: 14, top: 12, bottom: 30 };

function eachDate(from: string, to: string) {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

const shortDate = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const longDate = (date: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const money = (value: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);

export function SpendRevenueChart({ revenueDaily, spendDaily, dailyAds, from, to, loading, currency = "USD" }: { revenueDaily: DailyPoint[]; spendDaily: SpendPoint[]; dailyAds: Array<{ date: string; ads: DailyAd[] }>; from: string; to: string; loading: boolean; currency?: string }) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [pinnedDate, setPinnedDate] = useState<string | null>(null);
  const activeDate = pinnedDate ?? hoveredDate;

  const data = useMemo(() => {
    const revenueByDate = new Map(revenueDaily.map((point) => [point.date, point]));
    const spendByDate = new Map(spendDaily.map((point) => [point.date, point.spend]));
    return eachDate(from, to).map((date) => ({
      date,
      revenue: revenueByDate.get(date)?.revenue ?? 0,
      orders: revenueByDate.get(date)?.orders ?? 0,
      spend: spendByDate.get(date) ?? 0,
    }));
  }, [revenueDaily, spendDaily, from, to]);

  useEffect(() => {
    setHoveredDate(null);
    setPinnedDate(null);
  }, [from, to]);

  const revenueValues = data.map((point) => point.revenue);
  const spendValues = data.map((point) => point.spend);
  const rawMax = Math.max(...revenueValues, ...spendValues, 100);
  const max = Math.ceil(rawMax / 100) * 100;
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const xAt = (index: number) => chart.left + (index / Math.max(data.length - 1, 1)) * plotWidth;
  const yAt = (value: number) => chart.top + plotHeight - (value / max) * plotHeight;
  const makePoints = (values: number[]) => values.map((value, index) => `${xAt(index)},${yAt(value)}`).join(" ");
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  const moneyTick = (value: number) => value >= 1000 ? `$${(value / 1000).toFixed(value % 1000 ? 1 : 0)}k` : `$${Math.round(value)}`;
  const active = data.find((point) => point.date === activeDate);
  const activeAds = activeDate ? dailyAds.find((row) => row.date === activeDate)?.ads ?? [] : [];

  return (
    <article className="rounded border border-rule bg-white p-5 sm:p-6">
      <PanelHeading title="Spend vs revenue" note="Hover a point · click to pin" />
      <div className="mb-3 flex h-4 justify-end gap-4 text-[11px] text-ink-soft">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" />Revenue</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brick" />Spend</span>
      </div>
      {loading ? (
        <div className="flex aspect-[680/250] items-center justify-center text-sm text-ink-faint">Loading Shopify revenue…</div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_190px]" onMouseLeave={() => { if (!pinnedDate) setHoveredDate(null); }}>
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Interactive daily Shopify revenue and Meta spend chart" className="h-auto w-full overflow-visible">
            {ticks.map((tick) => {
              const y = yAt(tick);
              return <g key={tick}><line x1={chart.left} y1={y} x2={chart.width - chart.right} y2={y} stroke="#e4e1d8" /><text x={chart.left - 9} y={y + 4} textAnchor="end" className="fill-ink-faint text-[10px]">{moneyTick(tick)}</text></g>;
            })}
            <polygon points={`${chart.left},${chart.height - chart.bottom} ${makePoints(revenueValues)} ${chart.width - chart.right},${chart.height - chart.bottom}`} fill="rgba(122,106,82,.08)" />
            <polyline points={makePoints(revenueValues)} fill="none" stroke="#7a6a52" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <polyline points={makePoints(spendValues)} fill="none" stroke="#a8503d" strokeWidth="1.6" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            {data.map((point, index) => {
              const selected = activeDate === point.date;
              const width = plotWidth / Math.max(data.length - 1, 1);
              return <g key={point.date}>
                {selected && <line x1={xAt(index)} y1={chart.top} x2={xAt(index)} y2={chart.top + plotHeight} stroke="#b8b2a6" strokeDasharray="2 3" />}
                <circle cx={xAt(index)} cy={yAt(point.revenue)} r={selected ? 4 : 2.5} fill="#7a6a52" />
                <circle cx={xAt(index)} cy={yAt(point.spend)} r={selected ? 4 : 2.5} fill="#a8503d" />
                <rect x={xAt(index) - width / 2} y={chart.top} width={width} height={plotHeight} fill="transparent" role="button" tabIndex={0} aria-label={`${longDate(point.date)}: ${money(point.revenue, currency)} revenue, ${money(point.spend)} spend, ${point.orders} orders`} className="cursor-pointer focus:outline-none" onMouseEnter={() => setHoveredDate(point.date)} onFocus={() => setHoveredDate(point.date)} onBlur={() => { if (!pinnedDate) setHoveredDate(null); }} onClick={() => setPinnedDate((current) => current === point.date ? null : point.date)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPinnedDate((current) => current === point.date ? null : point.date); } }} />
              </g>;
            })}
            <text x={chart.left} y={chart.height - 8} className="fill-ink-faint text-[10px]">{shortDate(from)}</text>
            <text x={chart.width - chart.right} y={chart.height - 8} textAnchor="end" className="fill-ink-faint text-[10px]">{shortDate(to)}</text>
          </svg>

          <div className="min-h-[180px] rounded border border-rule bg-paper/45 p-3">
          {active ? <>
            <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">{longDate(active.date)}</p>{pinnedDate === active.date && <span className="text-[9px] font-semibold uppercase tracking-wide text-accent">Pinned</span>}</div>
            <table className="mt-2 w-full text-xs"><tbody>
              <tr><td className="py-1 text-ink-faint">Revenue</td><td className="py-1 text-right font-medium tabular-nums">{money(active.revenue, currency)}</td></tr>
              <tr><td className="py-1 text-ink-faint">Spend</td><td className="py-1 text-right font-medium tabular-nums">{money(active.spend)}</td></tr>
              <tr><td className="py-1 text-ink-faint">Orders</td><td className="py-1 text-right font-medium tabular-nums">{active.orders.toLocaleString("en-US")}</td></tr>
            </tbody></table>
            <div className="mt-2 border-t border-rule pt-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Top 3 ads by spend</p>
              {activeAds.length === 0 && <p className="mt-2 text-xs text-ink-faint">No ad spend</p>}
              {activeAds.length > 0 && <table className="mt-1.5 w-full table-fixed text-xs"><tbody>{activeAds.map((ad) => <tr key={ad.id}><td className="truncate py-1 pr-2" title={ad.name}>{ad.name}</td><td className="w-[62px] py-1 text-right tabular-nums">{money(ad.spend)}</td></tr>)}</tbody></table>}
            </div>
          </> : <p className="text-xs leading-5 text-ink-faint">Hover or focus a chart point to inspect that day. Click to keep it pinned.</p>}
          </div>
        </div>
      )}
    </article>
  );
}
