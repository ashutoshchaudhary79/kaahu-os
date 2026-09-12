"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AcronymText } from "./AcronymText";

export type OrderSummary = {
  id: string;
  name: string;
  createdAt: string;
  itemQuantity: number;
  subtotal: number;
  discounts: number;
  total: number;
  financialStatus: string;
  fulfillmentStatus: string;
  channel: string;
  customer: string;
  discountCodes: string[];
  discountCode: string;
  attributionSource: string;
  attribution: {
    ready: boolean;
    daysToConversion: number | null;
    firstVisit: OrderVisit | null;
    lastVisit: OrderVisit | null;
  } | null;
  products: string;
  city: string;
  region: string;
  country: string;
};

type OrderVisit = {
  source: string;
  sourceDescription: string | null;
  referrerUrl: string | null;
  landingPage: string | null;
  referralCode: string | null;
  utmParameters: { source: string | null; medium: string | null; campaign: string | null; content: string | null; term: string | null } | null;
};

type SortKey = "name" | "customer" | "createdAt" | "products" | "itemQuantity" | "subtotal" | "discounts" | "discountCode" | "total" | "financialStatus" | "fulfillmentStatus" | "city" | "region" | "country" | "channel" | "attributionSource";
const money = (value: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
const titleCase = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function OrderDetailsDrawer({ open, onClose, orders, currency, timezone, from, to, attributionLookup }: { open: boolean; onClose: () => void; orders: OrderSummary[]; currency: string; timezone: string; from: string; to: string; attributionLookup: Record<string, { type: "Campaign" | "Ad"; name: string }> }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "createdAt", direction: "desc" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = previous; };
  }, [open, onClose]);

  const sorted = useMemo(() => [...orders].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    const comparison = typeof left === "string" ? left.localeCompare(String(right)) : left - Number(right);
    return sort.direction === "asc" ? comparison : -comparison;
  }), [orders, sort]);
  if (!open) return null;

  const updateSort = (key: SortKey) => setSort((current) => current.key === key ? { key, direction: current.direction === "desc" ? "asc" : "desc" } : { key, direction: key === "name" ? "asc" : "desc" });
  const headers: Array<{ label: string; key: SortKey }> = [
    { label: "Order", key: "name" }, { label: "Customer", key: "customer" }, { label: "Placed", key: "createdAt" }, { label: "Products", key: "products" }, { label: "Items", key: "itemQuantity" },
    { label: "Subtotal", key: "subtotal" }, { label: "Discounts", key: "discounts" }, { label: "Discount code", key: "discountCode" }, { label: "Total", key: "total" },
    { label: "Payment", key: "financialStatus" }, { label: "Fulfillment", key: "fulfillmentStatus" }, { label: "City", key: "city" },
    { label: "State", key: "region" }, { label: "Country", key: "country" }, { label: "Channel", key: "channel" }, { label: "Captured attribution", key: "attributionSource" },
  ];
  const toggleExpanded = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const visitCard = (label: string, visit: OrderVisit | null) => {
    if (!visit) return <div className="rounded border border-rule bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{label}</p><p className="mt-2 text-xs text-ink-faint">No visit data captured.</p></div>;
    const utm = visit.utmParameters;
    const resolved = (value: string | null) => value ? attributionLookup[value] ? `${attributionLookup[value].name} (${value})` : value : "—";
    return <div className="rounded border border-rule bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{label}</p>
      <dl className="mt-2 grid grid-cols-[90px_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-ink-faint">Source</dt><dd>{visit.sourceDescription ?? visit.source}</dd>
        <dt className="text-ink-faint"><AcronymText>UTM source</AcronymText></dt><dd>{utm ? [utm.source, utm.medium].filter(Boolean).join(" / ") || "—" : "—"}</dd>
        <dt className="text-ink-faint">Campaign</dt><dd className="break-words">{resolved(utm?.campaign ?? null)}</dd>
        <dt className="text-ink-faint">Ad / content</dt><dd className="break-words">{resolved(utm?.content ?? null)}</dd>
        <dt className="text-ink-faint">Ad set / term</dt><dd className="break-words">{resolved(utm?.term ?? null)}</dd>
        <dt className="text-ink-faint">Referrer</dt><dd className="max-w-[520px] truncate" title={visit.referrerUrl ?? undefined}>{visit.referrerUrl ?? "Direct / unavailable"}</dd>
        <dt className="text-ink-faint">Landing page</dt><dd className="max-w-[520px] truncate" title={visit.landingPage ?? undefined}>{visit.landingPage ?? "—"}</dd>
        {visit.referralCode && <><dt className="text-ink-faint">Referral code</dt><dd>{visit.referralCode}</dd></>}
      </dl>
    </div>;
  };

  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="orders-title">
    <button type="button" aria-label="Close order details" onClick={onClose} className="absolute inset-0 bg-ink/35 backdrop-blur-[1px]" />
    <section className="absolute inset-y-0 right-0 flex w-full max-w-[1120px] flex-col bg-paper shadow-2xl">
      <header className="flex items-start justify-between gap-6 border-b border-rule bg-white px-5 py-5 sm:px-7">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Shopify</p><h2 id="orders-title" className="font-display mt-1 text-2xl font-medium">Orders</h2><p className="mt-1 text-xs text-ink-faint">{from} – {to} · {orders.length} paid-value orders · {timezone}</p></div>
        <button type="button" onClick={onClose} className="rounded border border-rule bg-white px-3 py-1.5 text-sm text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">Close</button>
      </header>
      <div className="flex-1 overflow-auto p-5 sm:p-7">
        <div className="grid gap-3 md:hidden">
          {sorted.map((order) => <article key={order.id} className="rounded border border-rule bg-white p-4">
            <button type="button" onClick={() => toggleExpanded(order.id)} aria-expanded={expanded.has(order.id)} className="flex min-h-11 w-full items-start justify-between gap-3 text-left">
              <span><strong className="text-sm">{order.name}</strong><span className="mt-1 block text-xs text-ink-soft">{order.customer}</span></span>
              <span className="text-right"><strong className="block text-sm tabular-nums">{money(order.total, currency)}</strong><span className="mt-1 block text-[10px] text-accent">{expanded.has(order.id) ? "Hide details" : "View details"}</span></span>
            </button>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rule pt-3 text-xs">
              <div><dt className="text-ink-faint">Placed</dt><dd className="mt-1">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(order.createdAt))}</dd></div>
              <div><dt className="text-ink-faint">Status</dt><dd className="mt-1">{titleCase(order.financialStatus)} · {titleCase(order.fulfillmentStatus)}</dd></div>
              <div className="col-span-2"><dt className="text-ink-faint">Products</dt><dd className="mt-1 leading-5">{order.products}</dd></div>
              <div><dt className="text-ink-faint">Discount code</dt><dd className="mt-1 break-words">{order.discountCode}</dd></div>
              <div><dt className="text-ink-faint">Destination</dt><dd className="mt-1">{[order.city, order.region, order.country].filter((value) => value !== "—").join(", ") || "—"}</dd></div>
              <div className="col-span-2"><dt className="text-ink-faint">Captured attribution</dt><dd className="mt-1 break-all text-accent">{order.attributionSource}</dd></div>
            </dl>
            {expanded.has(order.id) && <div className="mt-4 border-t border-rule pt-4"><p className="mb-3 text-[11px] text-ink-faint">{order.attribution?.daysToConversion === null || order.attribution?.daysToConversion === undefined ? "Conversion window unavailable" : `${order.attribution.daysToConversion} day${order.attribution.daysToConversion === 1 ? "" : "s"} to conversion`}</p><div className="grid gap-3 [&_dd]:min-w-0 [&_dd]:break-all">{visitCard("First touch", order.attribution?.firstVisit ?? null)}{visitCard("Last touch", order.attribution?.lastVisit ?? null)}</div></div>}
          </article>)}
        </div>
        <div className="hidden overflow-auto rounded border border-rule bg-white md:block">
          <table className="w-full min-w-[1940px] border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#e4e1d8]"><tr>{headers.map((header) => <th key={header.key} className={`px-3 py-3 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-faint ${["itemQuantity", "subtotal", "discounts", "total"].includes(header.key) ? "text-right" : "text-left"}`}><button type="button" onClick={() => updateSort(header.key)} className="inline-flex items-center gap-1 hover:text-ink">{header.label}<span className={sort.key === header.key ? "text-accent" : "text-rule"}>{sort.key === header.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button></th>)}</tr></thead>
            <tbody>{sorted.map((order) => <Fragment key={order.id}><tr className="hover:bg-paper/70">
              <td className="border-t border-rule px-3 py-3 font-medium"><button type="button" onClick={() => toggleExpanded(order.id)} aria-expanded={expanded.has(order.id)} className="inline-flex items-center gap-2 hover:text-accent focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><span aria-hidden="true" className={`text-[9px] text-ink-faint transition-transform ${expanded.has(order.id) ? "rotate-90" : ""}`}>▶</span>{order.name}</button></td>
              <td className="whitespace-nowrap border-t border-rule px-3 py-3 font-medium">{order.customer}</td>
              <td className="whitespace-nowrap border-t border-rule px-3 py-3 text-ink-soft">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(order.createdAt))}</td>
              <td className="max-w-[320px] border-t border-rule px-3 py-3 leading-5">{order.products}</td>
              <td className="border-t border-rule px-3 py-3 text-right tabular-nums">{order.itemQuantity}</td>
              <td className="border-t border-rule px-3 py-3 text-right tabular-nums">{money(order.subtotal, currency)}</td>
              <td className="border-t border-rule px-3 py-3 text-right tabular-nums">{money(order.discounts, currency)}</td>
              <td className="whitespace-nowrap border-t border-rule px-3 py-3">{order.discountCode}</td>
              <td className="border-t border-rule px-3 py-3 text-right font-medium tabular-nums">{money(order.total, currency)}</td>
              <td className="border-t border-rule px-3 py-3"><span className="rounded-full bg-accent-soft px-2 py-1 text-[10px] font-medium text-accent">{titleCase(order.financialStatus)}</span></td>
              <td className="border-t border-rule px-3 py-3"><span className="rounded-full bg-moss/10 px-2 py-1 text-[10px] font-medium text-moss">{titleCase(order.fulfillmentStatus)}</span></td>
              <td className="whitespace-nowrap border-t border-rule px-3 py-3">{order.city}</td>
              <td className="border-t border-rule px-3 py-3">{order.region}</td>
              <td className="border-t border-rule px-3 py-3">{order.country}</td>
              <td className="border-t border-rule px-3 py-3 text-ink-soft">{titleCase(order.channel)}</td>
              <td className="whitespace-nowrap border-t border-rule px-3 py-3"><button type="button" onClick={() => toggleExpanded(order.id)} className="text-left text-accent underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">{order.attributionSource}</button></td>
            </tr>
            {expanded.has(order.id) && <tr><td colSpan={headers.length} className="border-t border-rule bg-paper/70 px-5 py-5"><div className="sticky left-5 max-w-[1040px]"><div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs"><span><strong>Captured attribution</strong></span><span className="text-ink-faint">{order.attribution?.ready === false ? "Shopify is still processing this journey" : order.attribution?.daysToConversion === null || order.attribution?.daysToConversion === undefined ? "Conversion window unavailable" : `${order.attribution.daysToConversion} day${order.attribution.daysToConversion === 1 ? "" : "s"} to conversion`}</span><span className="text-ink-faint">Captured touchpoints are directional, not proof of Meta causation.</span></div><div className="grid gap-3 lg:grid-cols-2">{visitCard("First touch", order.attribution?.firstVisit ?? null)}{visitCard("Last touch", order.attribution?.lastVisit ?? null)}</div></div></td></tr>}
            </Fragment>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  </div>;
}
