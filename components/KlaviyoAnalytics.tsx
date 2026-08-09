"use client";

import { PanelHeading } from "./PanelHeading";

type Performance = { id: string; name: string; channel: string; recipients: number; delivered: number; openRate: number; clickRate: number; conversions: number; conversionRate: number; revenue: number; revenuePerRecipient: number; unsubscribeRate: number; spamComplaintRate: number };
export type KlaviyoData = {
  attributedRevenue: number;
  abandonedCart: { triggered: number; completed: number; recoveryRate: number; revenueRecovered: number };
  campaigns: Performance[]; flows: Performance[];
  flowGroups: Array<{ key: "welcome" | "post_purchase" | "other"; name: string; rows: Performance[] }>;
  listHealth: { currentEmailListSize: number; subscribed: number; unsubscribed: number; netGrowth: number; growthRate: number | null; unsubscribeRate: number; spamComplaintRate: number };
};

const integer = (value: number) => value.toLocaleString("en-US");
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);

export function KlaviyoAnalytics({ data, storeRevenue }: { data: KlaviyoData; storeRevenue: number | null }) {
  const revenueShare = storeRevenue ? data.attributedRevenue / storeRevenue : null;
  return <section className="mt-8 space-y-6" aria-label="Klaviyo reporting">
    <article className="rounded border border-rule bg-white p-5 sm:p-6">
      <PanelHeading title="Klaviyo retention" note="Email and SMS · Klaviyo send-date attribution" />
      <div className="grid overflow-hidden rounded border border-rule sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Abandoned-cart triggers" value={integer(data.abandonedCart.triggered)} note="Flow recipients" />
        <Metric label="Recovered orders" value={integer(data.abandonedCart.completed)} note={`${percent(data.abandonedCart.recoveryRate)} recovery rate`} />
        <Metric label="Revenue recovered" value={money(data.abandonedCart.revenueRecovered)} note="Placed Order attribution" />
        <Metric label="Share of store revenue" value={revenueShare === null ? "—" : percent(revenueShare)} note={`${money(data.attributedRevenue)} attributed`} />
      </div>
      <p className="mt-3 text-[11px] leading-5 text-ink-faint">Revenue share compares Klaviyo-attributed Placed Order value with included Shopify revenue for the same dates. Attribution can overlap other channels and should not be added to Meta attribution.</p>
    </article>

    <article className="rounded border border-rule bg-white p-5 sm:p-6"><PanelHeading title="Campaign performance" note="Revenue per campaign" /><PerformanceTable rows={data.campaigns} empty="No campaigns were sent in this date range." /></article>

    <article className="rounded border border-rule bg-white p-5 sm:p-6">
      <PanelHeading title="Flow performance" note="Welcome, post-purchase, and lifecycle automation" />
      <div className="space-y-7">{data.flowGroups.map((group) => <section key={group.key}><h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{group.name}</h3><PerformanceTable rows={group.rows} empty={group.key === "post_purchase" ? "No active post-purchase flow reported in this range." : "No flow delivery in this range."} /></section>)}</div>
    </article>

    <article className="rounded border border-rule bg-white p-5 sm:p-6">
      <PanelHeading title="List health" note="Growth and deliverability warning signals" />
      <div className="grid overflow-hidden rounded border border-rule sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Email list" value={integer(data.listHealth.currentEmailListSize)} note="Current members" />
        <Metric label="Subscribed" value={integer(data.listHealth.subscribed)} note="In selected dates" />
        <Metric label="Unsubscribed" value={integer(data.listHealth.unsubscribed)} note="In selected dates" />
        <Metric label="Net growth" value={`${data.listHealth.netGrowth >= 0 ? "+" : ""}${integer(data.listHealth.netGrowth)}`} note={data.listHealth.growthRate === null ? "No starting baseline" : `${percent(data.listHealth.growthRate)} estimated`} />
        <Metric label="Unsubscribe rate" value={percent(data.listHealth.unsubscribeRate)} note="Weighted by delivered" warning={data.listHealth.unsubscribeRate > 0.005} />
        <Metric label="Spam complaint rate" value={percent(data.listHealth.spamComplaintRate)} note="Weighted by delivered" warning={data.listHealth.spamComplaintRate > 0.0002} />
      </div>
    </article>
  </section>;
}

function Metric({ label, value, note, warning = false }: { label: string; value: string; note: string; warning?: boolean }) {
  return <div className="border-b border-rule p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p><p className={`mt-1 text-lg font-semibold tabular-nums ${warning ? "text-brick" : ""}`}>{value}</p><p className="mt-0.5 text-[10px] text-ink-faint">{note}</p></div>;
}

function PerformanceTable({ rows, empty }: { rows: Performance[]; empty: string }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-xs"><thead><tr>{["Name", "Channel", "Recipients", "Open rate", "Click rate", "Orders", "Revenue", "Revenue / recipient", "Unsub rate", "Spam rate"].map((header, index) => <th key={header} className={`border-b border-rule pb-2 text-[10px] font-medium uppercase tracking-wide text-ink-faint ${index < 2 ? "text-left" : "text-right"}`}>{header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="max-w-[280px] truncate border-b border-rule py-2.5 pr-4 font-medium" title={row.name}>{row.name}</td><td className="border-b border-rule py-2.5 pr-4 capitalize text-ink-faint">{row.channel}</td><td className="border-b border-rule py-2.5 text-right tabular-nums">{integer(row.recipients)}</td><td className="border-b border-rule py-2.5 text-right tabular-nums">{percent(row.openRate)}</td><td className="border-b border-rule py-2.5 text-right tabular-nums">{percent(row.clickRate)}</td><td className="border-b border-rule py-2.5 text-right tabular-nums">{integer(row.conversions)}</td><td className="border-b border-rule py-2.5 text-right font-medium tabular-nums">{money(row.revenue)}</td><td className="border-b border-rule py-2.5 text-right tabular-nums">{money(row.revenuePerRecipient)}</td><td className={`border-b border-rule py-2.5 text-right tabular-nums ${row.unsubscribeRate > 0.005 ? "text-brick" : ""}`}>{percent(row.unsubscribeRate)}</td><td className={`border-b border-rule py-2.5 text-right tabular-nums ${row.spamComplaintRate > 0.0002 ? "text-brick" : ""}`}>{percent(row.spamComplaintRate)}</td></tr>)}{!rows.length && <tr><td colSpan={10} className="py-8 text-center text-ink-faint">{empty}</td></tr>}</tbody></table></div>;
}
