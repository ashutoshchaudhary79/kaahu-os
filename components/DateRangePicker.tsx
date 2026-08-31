"use client";

import { useEffect, useState } from "react";

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
  const [customOpen, setCustomOpen] = useState(value.days === 0);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const [error, setError] = useState<string | null>(null);
  const today = isoDate(new Date());

  useEffect(() => {
    setFrom(value.from);
    setTo(value.to);
  }, [value.from, value.to]);

  const selectRange = (selection: string) => {
    setError(null);
    if (selection === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange(defaultRange(Number(selection)));
  };

  const applyCustom = () => {
    setError(null);
    const fromTime = Date.parse(`${from}T00:00:00Z`);
    const toTime = Date.parse(`${to}T00:00:00Z`);
    if (!from || !to || !Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
      setError("Choose both dates.");
      return;
    }
    if (fromTime > toTime) {
      setError("From must be before To.");
      return;
    }
    if (to > today) {
      setError("Future dates are not available.");
      return;
    }
    const inclusiveDays = Math.floor((toTime - fromTime) / 86_400_000) + 1;
    if (inclusiveDays > 60) {
      setError("Choose a range of 60 days or less.");
      return;
    }
    onChange({ from, to, days: 0 });
  };

  return (
    <div className="flex w-full flex-col items-start gap-2 lg:w-auto lg:items-end">
      <div className="flex w-full flex-col gap-2 text-[13px] sm:flex-row sm:items-center sm:gap-3">
        <span className="font-medium tabular-nums">{displayDate(value.from)} – {displayDate(value.to)}</span>
        <label className="sr-only" htmlFor="date-range">Date range</label>
        <select id="date-range" value={customOpen ? "custom" : String(value.days)} onChange={(event) => selectRange(event.target.value)} className="min-h-11 w-full rounded-lg border border-rule bg-surface px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 sm:w-auto">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="60">Last 60 days</option>
          <option value="custom">Custom dates</option>
        </select>
      </div>

      {customOpen && <div className="flex w-full flex-wrap items-end gap-2 rounded-lg border border-rule bg-surface p-2.5 text-xs shadow-sm">
        <label className="flex flex-col gap-1 text-ink-faint">From<input type="date" value={from} max={to || today} onChange={(event) => { setFrom(event.target.value); setError(null); }} className="rounded border border-rule bg-white px-2 py-1.5 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15" /></label>
        <label className="flex flex-col gap-1 text-ink-faint">To<input type="date" value={to} min={from} max={today} onChange={(event) => { setTo(event.target.value); setError(null); }} className="rounded border border-rule bg-white px-2 py-1.5 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15" /></label>
        <button type="button" onClick={applyCustom} className="rounded bg-ink px-3 py-1.5 font-medium text-white hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">Apply</button>
      </div>}
      {error && <p role="alert" className="text-xs text-brick">{error}</p>}
    </div>
  );
}

DateRangePicker.defaultRange = defaultRange;
