type KpiCardProps = { label: string; value: string; delta: string; trend: "up" | "down" | "flat"; source?: string };

export function KpiCard({ label, value, delta, trend, source }: KpiCardProps) {
  const trendClass = trend === "up" ? "text-moss" : trend === "down" ? "text-brick" : "text-ink-faint";
  return (
    <article className="border-b border-rule p-[18px] last:border-b-0 sm:[&:nth-child(odd)]:border-r lg:[&:nth-child(odd)]:border-r-0 lg:[&:not(:nth-child(3n))]:border-r xl:border-b-0 xl:[&:not(:last-child)]:border-r">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.04em] text-ink-faint">{label}</p>
        {source && <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${source === "Live" ? "bg-moss/10 text-moss" : "bg-accent-soft text-accent"}`}>{source}</span>}
      </div>
      <p className="font-display mt-2 text-[26px] font-medium tracking-[-0.01em] tabular-nums">{value}</p>
      <p className={`mt-1.5 text-xs tabular-nums ${trendClass}`}>{delta}</p>
    </article>
  );
}
