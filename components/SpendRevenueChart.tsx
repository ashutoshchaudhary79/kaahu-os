"use client";

import { useEffect, useMemo, useState } from "react";
import { PanelHeading } from "./PanelHeading";
import { AcronymText } from "./AcronymText";

type DailyPoint = { date: string; revenue: number; orders: number };
type SpendPoint = { date: string; spend: number };
type DailyAd = { id: string; name: string; spend: number };
type ChartHistory = { from: string; to: string; revenueDaily: Array<{ date: string; revenue: number }>; spendDaily: SpendPoint[] };
const chart = { width: 680, height: 250, left: 56, right: 48, top: 12, bottom: 30 };
const ROLLING_DAYS_STORAGE_KEY = "kaahu-dashboard-rolling-days";
const SERIES_VISIBILITY_STORAGE_KEY = "kaahu-dashboard-chart-series";

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

function shiftDate(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

const shortDate = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const longDate = (date: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const money = (value: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);

function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    const control1 = { x: current.x + (next.x - previous.x) / 6, y: current.y + (next.y - previous.y) / 6 };
    const control2 = { x: next.x - (after.x - current.x) / 6, y: next.y - (after.y - current.y) / 6 };
    path += ` C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${next.x} ${next.y}`;
  }
  return path;
}

export function SpendRevenueChart({ revenueDaily, spendDaily, dailyAds, from, to, loading, currency = "USD" }: { revenueDaily: DailyPoint[]; spendDaily: SpendPoint[]; dailyAds: Array<{ date: string; ads: DailyAd[] }>; from: string; to: string; loading: boolean; currency?: string }) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [pinnedDate, setPinnedDate] = useState<string | null>(null);
  const [rollingDays, setRollingDays] = useState(7);
  const [rollingDaysRestored, setRollingDaysRestored] = useState(false);
  const [showRevenue, setShowRevenue] = useState(true);
  const [showSpend, setShowSpend] = useState(true);
  const [showRollingSales, setShowRollingSales] = useState(true);
  const [showRollingRoas, setShowRollingRoas] = useState(true);
  const [seriesVisibilityRestored, setSeriesVisibilityRestored] = useState(false);
  const [history, setHistory] = useState<ChartHistory | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const activeDate = pinnedDate ?? hoveredDate;
  const historyFrom = shiftDate(from, -(rollingDays - 1));

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(ROLLING_DAYS_STORAGE_KEY));
      if (Number.isInteger(stored) && stored >= 3 && stored <= 60) setRollingDays(stored);
    } catch {
      // The default remains available when browser storage is unavailable.
    } finally {
      setRollingDaysRestored(true);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SERIES_VISIBILITY_STORAGE_KEY);
      if (stored) {
        const visibility = JSON.parse(stored) as Record<string, unknown>;
        if (typeof visibility.revenue === "boolean") setShowRevenue(visibility.revenue);
        if (typeof visibility.spend === "boolean") setShowSpend(visibility.spend);
        if (typeof visibility.rollingSales === "boolean") setShowRollingSales(visibility.rollingSales);
        if (typeof visibility.rollingRoas === "boolean") setShowRollingRoas(visibility.rollingRoas);
      }
    } catch {
      // Default visibility remains when stored preferences are unavailable or invalid.
    } finally {
      setSeriesVisibilityRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!seriesVisibilityRestored) return;
    try {
      window.localStorage.setItem(SERIES_VISIBILITY_STORAGE_KEY, JSON.stringify({ revenue: showRevenue, spend: showSpend, rollingSales: showRollingSales, rollingRoas: showRollingRoas }));
    } catch {
      // Visibility still applies for the current session.
    }
  }, [seriesVisibilityRestored, showRevenue, showSpend, showRollingSales, showRollingRoas]);

  const changeRollingDays = (days: number) => {
    if (!Number.isInteger(days) || days < 3 || days > 60) return;
    setRollingDays(days);
    try { window.localStorage.setItem(ROLLING_DAYS_STORAGE_KEY, String(days)); }
    catch { /* The selection still applies for the current session. */ }
  };

  useEffect(() => {
    if (!rollingDaysRestored) return;
    const controller = new AbortController();
    setHistory(null);
    setHistoryError(false);
    fetch(`/api/chart-history?from=${historyFrom}&to=${to}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as ChartHistory & { detail?: string };
        if (!response.ok) throw new Error(body.detail ?? "Chart history could not be loaded");
        setHistory(body);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setHistoryError(true); });
    return () => controller.abort();
  }, [historyFrom, to, rollingDaysRestored]);

  const data = useMemo(() => {
    const revenueByDate = new Map((history?.revenueDaily ?? revenueDaily).map((point) => [point.date, point.revenue]));
    const spendByDate = new Map((history?.spendDaily ?? spendDaily).map((point) => [point.date, point.spend]));
    const ordersByDate = new Map(revenueDaily.map((point) => [point.date, point.orders]));
    const calculationDays = eachDate(historyFrom, to).map((date) => ({
      date,
      revenue: revenueByDate.get(date) ?? 0,
      orders: ordersByDate.get(date) ?? 0,
      spend: spendByDate.get(date) ?? 0,
    }));
    const calculationIndex = new Map(calculationDays.map((point, index) => [point.date, index]));
    return eachDate(from, to).map((date) => {
      const index = calculationIndex.get(date) ?? 0;
      const point = calculationDays[index];
      const window = calculationDays.slice(index - rollingDays + 1, index + 1);
      const rollingRevenueTotal = window.reduce((sum, row) => sum + row.revenue, 0);
      const rollingRevenue = rollingRevenueTotal / rollingDays;
      const rollingSpend = window.reduce((sum, row) => sum + row.spend, 0);
      return { ...point, rollingRevenue, rollingSpend, rollingRoas: rollingSpend ? rollingRevenueTotal / rollingSpend : null };
    });
  }, [revenueDaily, spendDaily, history, historyFrom, from, to, rollingDays]);

  useEffect(() => {
    setHoveredDate(null);
    setPinnedDate(null);
  }, [from, to]);

  const revenueValues = data.map((point) => point.revenue);
  const spendValues = data.map((point) => point.spend);
  const rollingRevenueValues = data.map((point) => point.rollingRevenue);
  const roasValues = data.map((point) => point.rollingRoas);
  const historyReady = history?.from === historyFrom && history.to === to;
  const rawMax = Math.max(...(showRevenue ? revenueValues : []), ...(showSpend ? spendValues : []), ...(showRollingSales && historyReady ? rollingRevenueValues : []), 100);
  const max = Math.ceil(rawMax / 100) * 100;
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const xAt = (index: number) => chart.left + (index / Math.max(data.length - 1, 1)) * plotWidth;
  const yAt = (value: number) => chart.top + plotHeight - (value / max) * plotHeight;
  const makePoints = (values: number[]) => values.map((value, index) => `${xAt(index)},${yAt(value)}`).join(" ");
  const maxRoas = Math.max(1, Math.ceil(Math.max(...roasValues.map((value) => value ?? 0))));
  const yRoasAt = (value: number) => chart.top + plotHeight - (value / maxRoas) * plotHeight;
  const rollingSalesPath = smoothPath(rollingRevenueValues.map((value, index) => ({ x: xAt(index), y: yAt(value) })));
  const roasPoints = roasValues.map((value, index) => value === null ? null : { x: xAt(index), y: yRoasAt(value) });
  const roasSegments = roasPoints.reduce<Array<Array<{ x: number; y: number }>>>((segments, point) => {
    if (point) {
      if (!segments.length) segments.push([]);
      segments[segments.length - 1].push(point);
    } else if (segments.length && segments[segments.length - 1].length) {
      segments.push([]);
    }
    return segments;
  }, []).filter((segment) => segment.length).map(smoothPath);
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  const moneyTick = (value: number) => value >= 1000 ? `$${(value / 1000).toFixed(value % 1000 ? 1 : 0)}k` : `$${Math.round(value)}`;
  const active = data.find((point) => point.date === activeDate);
  const activeAds = activeDate ? dailyAds.find((row) => row.date === activeDate)?.ads ?? [] : [];

  return (
    <article className="rounded-xl border border-rule bg-surface p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PanelHeading title="Spend vs revenue" note="Select a day for details" />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" aria-pressed={showRevenue} onClick={() => setShowRevenue((shown) => !shown)} className={`rounded-lg border px-2.5 py-1.5 font-medium ${showRevenue ? "border-accent bg-accent text-white" : "border-rule bg-white text-ink-soft"}`}>Revenue</button>
          <button type="button" aria-pressed={showSpend} onClick={() => setShowSpend((shown) => !shown)} className={`rounded-lg border px-2.5 py-1.5 font-medium ${showSpend ? "border-brick bg-brick text-white" : "border-rule bg-white text-ink-soft"}`}>Spend</button>
          <button type="button" aria-pressed={showRollingSales} onClick={() => setShowRollingSales((shown) => !shown)} className={`rounded-lg border px-2.5 py-1.5 font-medium ${showRollingSales ? "border-[#167788] bg-[#167788] text-white" : "border-rule bg-white text-ink-soft"}`}>Rolling sales</button>
          <button type="button" aria-pressed={showRollingRoas} onClick={() => setShowRollingRoas((shown) => !shown)} className={`rounded-lg border px-2.5 py-1.5 font-medium ${showRollingRoas ? "border-[#7057a3] bg-[#7057a3] text-white" : "border-rule bg-white text-ink-soft"}`}><AcronymText>Rolling ROAS</AcronymText></button>
          <label className="flex items-center gap-1.5 text-ink-soft">Window<input aria-label="Rolling window in days" type="number" min={3} max={60} value={rollingDays} onChange={(event) => changeRollingDays(Number(event.target.value))} className="w-16 rounded-lg border border-rule bg-white px-2 py-1.5 text-right tabular-nums text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15" /><span>days</span></label>
        </div>
      </div>
      <div className="mb-3 mt-3 flex min-h-4 flex-wrap justify-end gap-4 text-[11px] text-ink-soft">
        {showRevenue && <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" />Daily revenue</span>}
        {showSpend && <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brick" />Daily spend</span>}
        {showRollingSales && <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#167788]" />{rollingDays}-day average sales</span>}
        {showRollingRoas && <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#7057a3]" />{rollingDays}-day <AcronymText>ROAS</AcronymText></span>}
      </div>
      {historyError && (showRollingSales || showRollingRoas) && <p role="alert" className="mb-3 text-right text-xs text-brick">Rolling history could not be loaded.</p>}
      {loading ? (
        <div className="aspect-[680/250] animate-pulse rounded-lg bg-rule/45" aria-label="Loading spend and revenue chart" />
      ) : (
        <div onMouseLeave={() => { if (!pinnedDate) setHoveredDate(null); }}>
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Interactive daily Shopify revenue and Meta spend chart with optional rolling sales and ROAS curves" className="h-auto w-full overflow-visible">
            {ticks.map((tick) => {
              const y = yAt(tick);
              return <g key={tick}><line x1={chart.left} y1={y} x2={chart.width - chart.right} y2={y} stroke="#e4e1d8" /><text x={chart.left - 9} y={y + 4} textAnchor="end" className="fill-ink-faint text-[10px]">{moneyTick(tick)}</text></g>;
            })}
            {showRevenue && <polyline points={makePoints(revenueValues)} fill="none" stroke="#278060" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />}
            {showSpend && <polyline points={makePoints(spendValues)} fill="none" stroke="#c4663d" strokeWidth="2" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />}
            {showRollingSales && historyReady && <path d={rollingSalesPath} fill="none" stroke="#167788" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            {showRollingRoas && historyReady && <>
              {[0, maxRoas / 2, maxRoas].map((tick) => <text key={tick} x={chart.width - chart.right + 8} y={yRoasAt(tick) + 4} className="fill-[#7057a3] text-[10px]">{tick.toFixed(tick % 1 ? 1 : 0)}×</text>)}
              {roasSegments.map((path, index) => <path key={index} d={path} fill="none" stroke="#7057a3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
            </>}
            {data.map((point, index) => {
              const selected = activeDate === point.date;
              const width = plotWidth / Math.max(data.length - 1, 1);
              return <g key={point.date}>
                {selected && <line x1={xAt(index)} y1={chart.top} x2={xAt(index)} y2={chart.top + plotHeight} stroke="#b8b2a6" strokeDasharray="2 3" />}
                {showRevenue && <circle cx={xAt(index)} cy={yAt(point.revenue)} r={selected ? 4 : 2.5} fill="#278060" />}
                {showSpend && <circle cx={xAt(index)} cy={yAt(point.spend)} r={selected ? 4 : 2.5} fill="#c4663d" />}
                {selected && showRollingSales && historyReady && <circle cx={xAt(index)} cy={yAt(point.rollingRevenue)} r={4} fill="#167788" />}
                {selected && showRollingRoas && historyReady && point.rollingRoas !== null && <circle cx={xAt(index)} cy={yRoasAt(point.rollingRoas)} r={4} fill="#7057a3" />}
                <rect x={xAt(index) - width / 2} y={chart.top} width={width} height={plotHeight} fill="transparent" role="button" tabIndex={0} aria-label={`${longDate(point.date)}: ${money(point.revenue, currency)} revenue, ${money(point.spend)} spend, ${money(point.rollingRevenue, currency)} rolling sales`} className="cursor-pointer focus:outline-none" onMouseEnter={() => setHoveredDate(point.date)} onFocus={() => setHoveredDate(point.date)} onBlur={() => { if (!pinnedDate) setHoveredDate(null); }} onClick={() => setPinnedDate((current) => current === point.date ? null : point.date)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPinnedDate((current) => current === point.date ? null : point.date); } }} />
              </g>;
            })}
            <text x={chart.left} y={chart.height - 8} className="fill-ink-faint text-[10px]">{shortDate(from)}</text>
            <text x={chart.width - chart.right} y={chart.height - 8} textAnchor="end" className="fill-ink-faint text-[10px]">{shortDate(to)}</text>
          </svg>

          {active && <div className="mt-4 rounded-lg border border-rule bg-paper/45 p-4" aria-live="polite">
          <>
            <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">{longDate(active.date)}</p>{pinnedDate === active.date && <span className="text-[9px] font-semibold uppercase tracking-wide text-accent">Pinned</span>}</div>
            <table className="mt-2 w-full text-xs"><tbody>
              <tr><td className="py-1 text-ink-faint">Revenue</td><td className="py-1 text-right font-medium tabular-nums">{money(active.revenue, currency)}</td></tr>
              <tr><td className="py-1 text-ink-faint">Spend</td><td className="py-1 text-right font-medium tabular-nums">{money(active.spend)}</td></tr>
              <tr><td className="py-1 text-ink-faint">Orders</td><td className="py-1 text-right font-medium tabular-nums">{active.orders.toLocaleString("en-US")}</td></tr><tr><td className="py-1 text-ink-faint"><AcronymText>Blended ROAS</AcronymText></td><td className="py-1 text-right font-medium tabular-nums">{active.spend ? `${(active.revenue / active.spend).toFixed(2)}×` : "—"}</td></tr>
              {showRollingSales && <tr><td className="py-1 text-ink-faint">{rollingDays}-day average sales</td><td className="py-1 text-right font-medium tabular-nums">{historyReady ? money(active.rollingRevenue, currency) : "Loading…"}</td></tr>}
              {showRollingRoas && <tr><td className="py-1 text-ink-faint">{rollingDays}-day blended <AcronymText>ROAS</AcronymText></td><td className="py-1 text-right font-medium tabular-nums">{historyReady ? active.rollingRoas === null ? "—" : `${active.rollingRoas.toFixed(2)}×` : "Loading…"}</td></tr>}
            </tbody></table>
            <div className="mt-2 border-t border-rule pt-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Top 3 ads by spend</p>
              {activeAds.length === 0 && <p className="mt-2 text-xs text-ink-faint">No ad spend</p>}
              {activeAds.length > 0 && <table className="mt-1.5 w-full table-fixed text-xs"><tbody>{activeAds.map((ad) => <tr key={ad.id}><td className="truncate py-1 pr-2" title={ad.name}>{ad.name}</td><td className="w-[62px] py-1 text-right tabular-nums">{money(ad.spend)}</td></tr>)}</tbody></table>}
            </div>
          </>
          </div>}
        </div>
      )}
    </article>
  );
}
