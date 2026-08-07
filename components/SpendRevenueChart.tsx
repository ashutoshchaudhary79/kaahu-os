import { PanelHeading } from "./PanelHeading";

type DailyPoint = { date: string; revenue: number; orders: number };
type SpendPoint = { date: string; spend: number };
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

export function SpendRevenueChart({ revenueDaily, spendDaily, from, to, loading }: { revenueDaily: DailyPoint[]; spendDaily: SpendPoint[]; from: string; to: string; loading: boolean }) {
  const revenueByDate = new Map(revenueDaily.map((point) => [point.date, point.revenue]));
  const spendByDate = new Map(spendDaily.map((point) => [point.date, point.spend]));
  const dates = eachDate(from, to);
  const revenueValues = dates.map((date) => revenueByDate.get(date) ?? 0);
  const spendValues = dates.map((date) => spendByDate.get(date) ?? 0);
  const rawMax = Math.max(...revenueValues, ...spendValues, 100);
  const max = Math.ceil(rawMax / 100) * 100;
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const makePoints = (values: number[]) => values.map((value, index) => `${chart.left + (index / Math.max(values.length - 1, 1)) * plotWidth},${chart.top + plotHeight - (value / max) * plotHeight}`).join(" ");
  const revenuePoints = makePoints(revenueValues);
  const spendPoints = makePoints(spendValues);
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  const moneyTick = (value: number) => value >= 1000 ? `$${(value / 1000).toFixed(value % 1000 ? 1 : 0)}k` : `$${Math.round(value)}`;

  return (
    <article className="rounded border border-rule bg-white p-5 sm:p-6">
      <PanelHeading title="Spend vs revenue" note="Daily, live data" />
      <div className="mb-3 flex h-4 justify-end gap-4 text-[11px] text-ink-soft">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" />Revenue</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brick" />Spend</span>
      </div>
      {loading ? (
        <div className="flex aspect-[680/250] items-center justify-center text-sm text-ink-faint">Loading Shopify revenue…</div>
      ) : (
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Daily Shopify revenue for the selected date range" className="h-auto w-full overflow-visible">
          {ticks.map((tick) => {
            const y = chart.top + plotHeight - (tick / max) * plotHeight;
            return <g key={tick}><line x1={chart.left} y1={y} x2={chart.width - chart.right} y2={y} stroke="#e4e1d8" /><text x={chart.left - 9} y={y + 4} textAnchor="end" className="fill-ink-faint text-[10px]">{moneyTick(tick)}</text></g>;
          })}
          <polygon points={`${chart.left},${chart.height - chart.bottom} ${revenuePoints} ${chart.width - chart.right},${chart.height - chart.bottom}`} fill="rgba(122,106,82,.08)" />
          <polyline points={revenuePoints} fill="none" stroke="#7a6a52" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <polyline points={spendPoints} fill="none" stroke="#a8503d" strokeWidth="1.6" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <text x={chart.left} y={chart.height - 8} className="fill-ink-faint text-[10px]">{shortDate(from)}</text>
          <text x={chart.width - chart.right} y={chart.height - 8} textAnchor="end" className="fill-ink-faint text-[10px]">{shortDate(to)}</text>
        </svg>
      )}
    </article>
  );
}
