"use client";

export type DateRange = { from: string; to: string; days: number };

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function defaultRange(days: number): DateRange {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: isoDate(from), to: isoDate(to), days };
}

const displayDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px]">
      <span className="font-medium tabular-nums">{displayDate(value.from)} – {displayDate(value.to)}</span>
      <label className="sr-only" htmlFor="date-range">Date range</label>
      <select id="date-range" value={value.days} onChange={(event) => onChange(defaultRange(Number(event.target.value)))} className="rounded border border-rule bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15">
        <option value="30">Last 30 days</option>
        <option value="7">Last 7 days</option>
        <option value="60">Last 60 days</option>
      </select>
    </div>
  );
}

DateRangePicker.defaultRange = defaultRange;
