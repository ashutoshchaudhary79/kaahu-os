"use client";

import { useEffect } from "react";

export type KpiDetailColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type KpiDetailRow = {
  date: string;
  values: Record<string, string>;
};

export type KpiDetail = {
  label: string;
  value: string;
  source: string;
  columns: KpiDetailColumn[];
  rows: KpiDetailRow[];
  methodology: string;
};

type KpiDetailPanelProps = {
  detail: KpiDetail | null;
  from: string;
  to: string;
  timezone: string;
  onClose: () => void;
};

const displayDate = (date: string) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${date}T12:00:00Z`));

export function KpiDetailPanel({ detail, from, to, timezone, onClose }: KpiDetailPanelProps) {
  useEffect(() => {
    if (!detail) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = previous;
    };
  }, [detail, onClose]);

  if (!detail) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="kpi-detail-title">
      <button type="button" aria-label="Close KPI details" onClick={onClose} className="absolute inset-0 bg-ink/35 backdrop-blur-[1px]" />
      <section className="absolute inset-y-0 right-0 flex w-full max-w-[720px] flex-col bg-paper shadow-2xl">
        <header className="flex items-start justify-between gap-6 border-b border-rule bg-white px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{detail.source}</p>
            <h2 id="kpi-detail-title" className="font-display mt-1 text-2xl font-medium">{detail.label}</h2>
            <p className="font-display mt-2 text-3xl font-medium tabular-nums">{detail.value}</p>
            <p className="mt-1 text-xs text-ink-faint">{from} – {to} · Daily breakdown · {timezone}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded border border-rule bg-white px-3 py-1.5 text-sm text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">Close</button>
        </header>

        <div className="flex-1 overflow-auto p-5 sm:p-7">
          <div className="overflow-hidden rounded border border-rule bg-white">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#e4e1d8]">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-ink-faint">Date</th>
                  {detail.columns.map((column) => (
                    <th key={column.key} className={`px-4 py-3 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-faint ${column.align === "left" ? "text-left" : "text-right"}`}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...detail.rows].reverse().map((row) => (
                  <tr key={row.date} className="hover:bg-paper/70">
                    <td className="whitespace-nowrap border-t border-rule px-4 py-3 font-medium">{displayDate(row.date)}</td>
                    {detail.columns.map((column) => (
                      <td key={column.key} className={`border-t border-rule px-4 py-3 tabular-nums ${column.align === "left" ? "text-left" : "text-right"}`}>{row.values[column.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="mt-5 rounded border border-rule bg-white px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Methodology</p>
            <p className="mt-2 text-xs leading-5 text-ink-soft">{detail.methodology}</p>
          </aside>
        </div>
      </section>
    </div>
  );
}
