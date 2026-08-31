type KpiCardProps = { label: string; value: string; delta: string; trend: "up" | "down" | "flat"; onClick?: () => void };

export function KpiCard({ label, value, delta, trend, onClick }: KpiCardProps) {
  const valueClass = label === "Revenue" || label === "Blended ROAS" ? "text-moss" : label === "Spend" || label === "Blended CAC" ? "text-orange" : "text-ink";
  const trendClass = trend === "up" ? "text-moss" : trend === "down" ? "text-brick" : "text-ink-soft";
  return (
    <article className="min-w-0 rounded-xl border border-rule bg-surface shadow-[0_1px_2px_rgba(33,31,27,.04)]">
      <button type="button" onClick={onClick} disabled={!onClick} aria-label={label === "Orders" ? "View orders" : `View ${label} daily details`} className="min-h-[132px] h-full w-full rounded-xl p-4 text-left transition-colors hover:bg-white active:bg-accent-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:hover:bg-transparent sm:p-[18px]">
      <p className="text-[11px] uppercase tracking-[0.04em] text-ink-faint">{label}</p>
      <p className={`font-display mt-2 truncate text-[25px] font-medium tracking-[-0.02em] tabular-nums sm:text-[28px] ${valueClass}`}>{value}</p>
      <p className={`mt-2 text-[11px] leading-4 tabular-nums ${trendClass}`}>{delta}</p>
      </button>
    </article>
  );
}
