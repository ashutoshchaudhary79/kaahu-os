type KpiCardProps = { label: string; value: string; delta: string; trend: "up" | "down" | "flat"; onClick?: () => void };

export function KpiCard({ label, value, delta, trend, onClick }: KpiCardProps) {
  const trendClass = trend === "up" ? "text-moss" : trend === "down" ? "text-brick" : "text-ink-faint";
  return (
    <article className="border-b border-rule last:border-b-0 sm:[&:nth-child(odd)]:border-r lg:[&:nth-child(odd)]:border-r-0 lg:[&:not(:nth-child(3n))]:border-r xl:border-b-0 xl:[&:not(:last-child)]:border-r">
      <button type="button" onClick={onClick} disabled={!onClick} aria-label={label === "Orders" ? "View orders" : `View ${label} daily details`} className="h-full w-full p-[18px] text-left transition-colors hover:bg-paper focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/30 disabled:cursor-default disabled:hover:bg-transparent">
      <p className="text-[11px] uppercase tracking-[0.04em] text-ink-faint">{label}</p>
      <p className="font-display mt-2 text-[26px] font-medium tracking-[-0.01em] tabular-nums">{value}</p>
      <p className={`mt-1.5 text-xs tabular-nums ${trendClass}`}>{delta}</p>
      </button>
    </article>
  );
}
