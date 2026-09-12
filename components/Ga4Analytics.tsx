"use client";

import { useMemo, useState } from "react";
import { PanelHeading } from "./PanelHeading";
import { AcronymText } from "./AcronymText";

export type Ga4Data = {
  totals: { sessions: number; users: number; newUsers: number; returningUsers: number; purchases: number; revenue: number; conversionRate: number };
  dailyChannels: Array<{ date: string; channel: string; visitorType: string; sessions: number; users: number; newUsers: number }>;
  funnel: Array<{ event: string; events: number; stepRate: number | null; sessionRate: number }>;
  channels: Array<{ channel: string; sessions: number; users: number; purchases: number; conversionRate: number; revenue: number }>;
  devices: Array<{ device: string; sessions: number; users: number; purchases: number; conversionRate: number; revenue: number }>;
  landingPages: Array<{ page: string; sessions: number; users: number; engagementRate: number; bounceRate: number; viewItem: number; addToCart: number; beginCheckout: number; purchases: number }>;
};

const integer = (value: number) => value.toLocaleString("en-US");
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);
const eventLabels: Record<string, string> = { view_item: "Product viewed", add_to_cart: "Added to cart", begin_checkout: "Checkout started", purchase: "Purchase" };

export function Ga4Analytics({ data, from, to }: { data: Ga4Data; from: string; to: string }) {
  const [channel, setChannel] = useState("All channels");
  const daily = useMemo(() => {
    const result = new Map<string, { sessions: number; users: number; newUsers: number; returningUsers: number }>();
    for (const row of data.dailyChannels) {
      if (channel !== "All channels" && row.channel !== channel) continue;
      const current = result.get(row.date) ?? { sessions: 0, users: 0, newUsers: 0, returningUsers: 0 };
      current.sessions += row.sessions; current.users += row.users; current.newUsers += row.newUsers;
      if (row.visitorType === "returning") current.returningUsers += row.users;
      result.set(row.date, current);
    }
    const days: Array<{ date: string; sessions: number; users: number; newUsers: number; returningUsers: number }> = [];
    const cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (cursor <= end) {
      const date = cursor.toISOString().slice(0, 10);
      days.push({ date, ...(result.get(date) ?? { sessions: 0, users: 0, newUsers: 0, returningUsers: 0 }) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
  }, [data.dailyChannels, channel, from, to]);
  const maxSessions = Math.max(...daily.map((row) => row.sessions), 1);
  const tickEvery = Math.max(1, Math.ceil(daily.length / 7));
  const landingPages = data.landingPages.slice(0, 20);

  return <section className="mt-8 space-y-6" aria-label="Google Analytics 4 reporting">
    <article className="rounded border border-rule bg-white p-5 sm:p-6">
      <PanelHeading title="Site acquisition · GA4" note="Session-scoped attribution" />
      <div className="mb-5 grid overflow-hidden rounded border border-rule sm:grid-cols-3 lg:grid-cols-6">
        {[["Sessions", integer(data.totals.sessions)], ["User-days", integer(data.totals.users)], ["New-user events", integer(data.totals.newUsers)], ["Returning user-days", integer(data.totals.returningUsers)], ["Conversion rate", percent(data.totals.conversionRate)], ["GA4 revenue", money(data.totals.revenue)]].map(([label, value]) => <div key={label} className="border-b border-rule p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-[10px] uppercase tracking-wide text-ink-faint"><AcronymText>{label}</AcronymText></p><p className="mt-1 text-lg font-semibold tabular-nums">{value}</p></div>)}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">{["All channels", ...data.channels.map((row) => row.channel)].map((name) => <button key={name} type="button" onClick={() => setChannel(name)} aria-pressed={channel === name} className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${channel === name ? "border-accent bg-accent text-white" : "border-rule bg-white text-ink-soft"}`}>{name}</button>)}</div>
      <div className="flex h-44 items-end gap-1 overflow-hidden border-b border-rule px-1 pt-4">{daily.map((row) => <div key={row.date} className={`group relative min-w-[2px] flex-1 hover:bg-accent ${row.sessions ? "bg-accent/75" : "h-0.5 bg-ink-faint/45"}`} style={row.sessions ? { height: `${Math.max((row.sessions / maxSessions) * 100, 2)}%` } : undefined} title={`${row.date}: ${integer(row.sessions)} sessions, ${integer(row.users)} users`} />)}</div>
      <div className="relative mt-1.5 h-4 text-[9px] tabular-nums text-ink-faint" aria-hidden="true">{daily.map((row, index) => {
        const showTick = index === 0 || index === daily.length - 1 || index % tickEvery === 0;
        if (!showTick) return null;
        const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${row.date}T00:00:00Z`));
        return <span key={row.date} className="absolute whitespace-nowrap" style={{ left: `${daily.length === 1 ? 50 : (index / (daily.length - 1)) * 100}%`, transform: index === 0 ? "none" : index === daily.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{label}</span>;
      })}</div>
      <p className="mt-2 text-[11px] text-ink-faint">Daily sessions · filter by default channel group</p>
    </article>

    <div className="grid gap-6 lg:grid-cols-2">
      <article className="rounded border border-rule bg-white p-5 sm:p-6"><PanelHeading title="Site-wide ecommerce funnel" note="GA4 events, not ad attribution" /><div className="space-y-3">{data.funnel.map((step, index) => { const max = data.funnel[0]?.events || 1; return <div key={step.event}><div className="mb-1 flex justify-between text-xs"><span className="font-medium">{eventLabels[step.event] ?? step.event}</span><span className="tabular-nums">{integer(step.events)} <span className="text-ink-faint">· {index ? `${percent(step.stepRate ?? 0)} from prior` : `${percent(step.sessionRate)} of sessions`}</span></span></div><div className="h-7 overflow-hidden rounded-sm bg-accent-soft"><div className="h-full bg-accent" style={{ width: `${Math.max((step.events / max) * 100, step.events ? 1 : 0)}%` }} /></div></div>; })}</div></article>
      <article className="rounded border border-rule bg-white p-5 sm:p-6"><PanelHeading title="Conversion by device" note="Sessions → GA4 transactions" /><MetricTable headers={["Device", "Sessions", "Purchases", "CVR", "Revenue"]} rows={data.devices.map((row) => [row.device, integer(row.sessions), integer(row.purchases), percent(row.conversionRate), money(row.revenue)])} /></article>
    </div>

    <article className="rounded border border-rule bg-white p-5 sm:p-6"><PanelHeading title="Revenue and conversion by channel" note="Session-scoped split · users shown as summed daily user counts" /><MetricTable headers={["Default channel group", "Sessions", "User-days", "Purchases", "CVR", "Revenue"]} rows={data.channels.map((row) => [row.channel, integer(row.sessions), integer(row.users), integer(row.purchases), percent(row.conversionRate), money(row.revenue)])} /></article>

    <article className="rounded border border-rule bg-white p-5 sm:p-6"><PanelHeading title="Landing page performance" note="Top 20 by sessions" /><MetricTable wide headers={["Landing page", "Sessions", "Engagement", "Bounce", "View item", "Add to cart", "Checkout", "Purchase"]} rows={landingPages.map((row) => [row.page, integer(row.sessions), percent(row.engagementRate), percent(row.bounceRate), integer(row.viewItem), integer(row.addToCart), integer(row.beginCheckout), integer(row.purchases)])} /></article>
  </section>;
}

function MetricTable({ headers, rows, wide = false }: { headers: string[]; rows: string[][]; wide?: boolean }) {
  return <div className="overflow-x-auto"><table className={`w-full border-collapse text-xs ${wide ? "min-w-[900px]" : "min-w-[560px]"}`}><thead><tr>{headers.map((header, index) => <th key={header} className={`border-b border-rule pb-2 text-[10px] font-medium uppercase tracking-wide text-ink-faint ${index ? "text-right" : "text-left"}`}><AcronymText>{header}</AcronymText></th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`${row[0]}-${rowIndex}`}>{row.map((value, index) => <td key={index} className={`border-b border-rule py-2.5 ${index ? "text-right tabular-nums" : "max-w-[360px] truncate pr-4 font-medium"}`} title={index ? undefined : value}>{value}</td>)}</tr>)}{!rows.length && <tr><td colSpan={headers.length} className="py-10 text-center text-ink-faint">No <AcronymText>GA4</AcronymText> activity in this range.</td></tr>}</tbody></table></div>;
}
