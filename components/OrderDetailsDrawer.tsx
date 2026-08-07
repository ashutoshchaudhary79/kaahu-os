"use client";

import { useEffect, useMemo, useState } from "react";

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
  products: string;
  city: string;
  region: string;
  country: string;
};

type SortKey = "name" | "createdAt" | "products" | "itemQuantity" | "subtotal" | "discounts" | "total" | "financialStatus" | "fulfillmentStatus" | "city" | "region" | "country" | "channel";
const money = (value: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
const titleCase = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function OrderDetailsDrawer({ open, onClose, orders, currency, timezone, from, to }: { open: boolean; onClose: () => void; orders: OrderSummary[]; currency: string; timezone: string; from: string; to: string }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "createdAt", direction: "desc" });
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
    { label: "Order", key: "name" }, { label: "Placed", key: "createdAt" }, { label: "Products", key: "products" }, { label: "Items", key: "itemQuantity" },
    { label: "Subtotal", key: "subtotal" }, { label: "Discounts", key: "discounts" }, { label: "Total", key: "total" },
    { label: "Payment", key: "financialStatus" }, { label: "Fulfillment", key: "fulfillmentStatus" }, { label: "City", key: "city" },
    { label: "State", key: "region" }, { label: "Country", key: "country" }, { label: "Channel", key: "channel" },
  ];

  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="orders-title">
    <button type="button" aria-label="Close order details" onClick={onClose} className="absolute inset-0 bg-ink/35 backdrop-blur-[1px]" />
    <section className="absolute inset-y-0 right-0 flex w-full max-w-[1120px] flex-col bg-paper shadow-2xl">
      <header className="flex items-start justify-between gap-6 border-b border-rule bg-white px-5 py-5 sm:px-7">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Shopify</p><h2 id="orders-title" className="font-display mt-1 text-2xl font-medium">Orders</h2><p className="mt-1 text-xs text-ink-faint">{from} – {to} · {orders.length} paid-value orders · {timezone}</p></div>
        <button type="button" onClick={onClose} className="rounded border border-rule bg-white px-3 py-1.5 text-sm text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">Close</button>
      </header>
      <div className="flex-1 overflow-auto p-5 sm:p-7">
        <div className="overflow-auto rounded border border-rule bg-white">
          <table className="w-full min-w-[1480px] border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#e4e1d8]"><tr>{headers.map((header) => <th key={header.key} className={`px-3 py-3 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-faint ${["itemQuantity", "subtotal", "discounts", "total"].includes(header.key) ? "text-right" : "text-left"}`}><button type="button" onClick={() => updateSort(header.key)} className="inline-flex items-center gap-1 hover:text-ink">{header.label}<span className={sort.key === header.key ? "text-accent" : "text-rule"}>{sort.key === header.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button></th>)}</tr></thead>
            <tbody>{sorted.map((order) => <tr key={order.id} className="hover:bg-paper/70">
              <td className="border-t border-rule px-3 py-3 font-medium">{order.name}</td>
              <td className="whitespace-nowrap border-t border-rule px-3 py-3 text-ink-soft">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(order.createdAt))}</td>
              <td className="max-w-[320px] border-t border-rule px-3 py-3 leading-5">{order.products}</td>
              <td className="border-t border-rule px-3 py-3 text-right tabular-nums">{order.itemQuantity}</td>
              <td className="border-t border-rule px-3 py-3 text-right tabular-nums">{money(order.subtotal, currency)}</td>
              <td className="border-t border-rule px-3 py-3 text-right tabular-nums">{money(order.discounts, currency)}</td>
              <td className="border-t border-rule px-3 py-3 text-right font-medium tabular-nums">{money(order.total, currency)}</td>
              <td className="border-t border-rule px-3 py-3"><span className="rounded-full bg-accent-soft px-2 py-1 text-[10px] font-medium text-accent">{titleCase(order.financialStatus)}</span></td>
              <td className="border-t border-rule px-3 py-3"><span className="rounded-full bg-moss/10 px-2 py-1 text-[10px] font-medium text-moss">{titleCase(order.fulfillmentStatus)}</span></td>
              <td className="whitespace-nowrap border-t border-rule px-3 py-3">{order.city}</td>
              <td className="border-t border-rule px-3 py-3">{order.region}</td>
              <td className="border-t border-rule px-3 py-3">{order.country}</td>
              <td className="border-t border-rule px-3 py-3 text-ink-soft">{titleCase(order.channel)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  </div>;
}
