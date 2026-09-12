"use client";

import { useMemo, useState } from "react";
import { PanelHeading } from "./PanelHeading";
import { AcronymText } from "./AcronymText";

type StageKey = "impressions" | "clicks" | "landingPageViews" | "addToCart" | "checkoutInitiated" | "purchases";
type FunnelRole = "tofu" | "mofu" | "sales";
type FunnelStep = { key: StageKey; label: string; value: string; width: number; note?: string };
type FunnelAd = { id: string; name: string; campaignName: string; objective: string; role: FunnelRole; spend: number } & Record<StageKey, number>;

const roleLabels: Record<FunnelRole, string> = { tofu: "Awareness / TOFU", mofu: "Consideration / MOFU", sales: "Sales / BOFU" };
const defaultRole: Record<StageKey, FunnelRole> = { impressions: "tofu", clicks: "mofu", landingPageViews: "mofu", addToCart: "sales", checkoutInitiated: "sales", purchases: "sales" };

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);

export function MetaFunnel({ steps, ads }: { steps: FunnelStep[]; ads: FunnelAd[] }) {
  const [selectedStage, setSelectedStage] = useState<StageKey | null>(null);
  const [selectedRole, setSelectedRole] = useState<FunnelRole>("tofu");
  const selected = steps.find((step) => step.key === selectedStage);
  const ranking = useMemo(() => {
    if (!selectedStage) return { top: [] as FunnelAd[], bottom: [] as FunnelAd[] };
    const active = ads.filter((ad) => ad.spend > 0 && ad.role === selectedRole);
    const top = [...active].sort((a, b) => b[selectedStage] - a[selectedStage] || b.spend - a.spend).slice(0, 3);
    const topIds = new Set(top.map((ad) => ad.id));
    const bottom = active.filter((ad) => !topIds.has(ad.id)).sort((a, b) => a[selectedStage] - b[selectedStage] || b.spend - a.spend).slice(0, 3);
    return { top, bottom };
  }, [ads, selectedStage, selectedRole]);
  const total = selectedStage ? ads.filter((ad) => ad.role === selectedRole).reduce((sum, ad) => sum + ad[selectedStage], 0) : 0;
  const lowestRate = Math.min(...steps.slice(1).map((step) => Number(step.note?.split("%")[0] ?? 100)), 100);

  const rankingTable = (rows: FunnelAd[], empty: string) => (
    <div className="grid min-w-0 gap-2">
      {rows.map((ad) => {
            const events = selectedStage ? ad[selectedStage] : 0;
            const cost = selectedStage === "impressions" ? (events ? (ad.spend / events) * 1000 : null) : (events ? ad.spend / events : null);
            return <article key={ad.id} className={`min-w-0 rounded-lg border border-rule bg-white p-3 ${events === 0 ? "text-ink-faint" : ""}`}>
              <p className="truncate text-xs font-semibold" title={ad.name}>{ad.name}</p>
              <p className="mt-0.5 truncate text-[10px] text-ink-faint" title={ad.campaignName}>{ad.campaignName}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] min-[360px]:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                <div><dt className="text-ink-faint">Events</dt><dd className="mt-0.5 font-medium tabular-nums">{events.toLocaleString("en-US")}</dd></div>
                <div><dt className="text-ink-faint">Share</dt><dd className="mt-0.5 font-medium tabular-nums">{total ? `${((events / total) * 100).toFixed(1)}%` : "—"}</dd></div>
                <div><dt className="text-ink-faint">Spend</dt><dd className="mt-0.5 font-medium tabular-nums">{money(ad.spend)}</dd></div>
                <div><dt className="text-ink-faint"><AcronymText>{selectedStage === "impressions" ? "CPM" : "Cost / event"}</AcronymText></dt><dd className="mt-0.5 font-medium tabular-nums">{cost === null ? "—" : money(cost)}</dd></div>
              </dl>
            </article>;
          })}
      {!rows.length && <p className="py-6 text-center text-xs text-ink-faint">{empty}</p>}
    </div>
  );

  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-rule bg-surface p-4 sm:p-6">
      <PanelHeading title="Meta funnel" note="Select a stage for ad detail" />
      <div className="grid gap-6">
        <div className="space-y-2.5">
          {!steps.length && <p className="py-20 text-center text-sm text-ink-faint">No Meta activity in this range</p>}
          {steps.map((step) => {
            const active = selectedStage === step.key;
            const isLargestDrop = Number(step.note?.split("%")[0] ?? 100) === lowestRate;
            return <button key={step.key} type="button" onClick={() => { setSelectedStage(step.key); setSelectedRole(defaultRole[step.key]); }} aria-pressed={active} className={`block min-h-11 w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${active ? "bg-accent-soft" : ""}`}>
              <span className="grid grid-cols-[94px_1fr_62px] items-center gap-2 text-xs"><span className={active ? "font-medium text-ink" : "text-ink-soft"}>{step.label}</span><span className="h-[20px] overflow-hidden rounded-sm bg-accent-soft"><span className={`block h-full min-w-[3px] ${isLargestDrop ? "bg-amber" : "bg-accent"}`} style={{ width: `${step.width}%` }} /></span><span className="text-right font-medium tabular-nums">{step.value}</span></span>
              {step.note && <span className={`ml-[102px] mt-0.5 block text-[11px] tabular-nums ${isLargestDrop ? "font-medium text-amber" : "text-ink-faint"}`}>{step.note}{isLargestDrop ? " · largest drop" : ""}</span>}
            </button>;
          })}
        </div>

        {selectedStage && selected && <div className="min-w-0 rounded-lg border border-rule bg-paper/45 p-3 sm:p-4">
          <>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2"><div className="min-w-0"><p className="text-sm font-semibold">{selected.label} by ad</p><p className="mt-0.5 text-[11px] text-ink-faint">Compared within campaign funnel role</p></div><span className="shrink-0 text-xs font-medium tabular-nums">{total.toLocaleString("en-US")} total</span></div>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Campaign funnel role">{(["tofu", "mofu", "sales"] as const).map((role) => {
              const count = ads.filter((ad) => ad.role === role).length;
              return <button key={role} type="button" onClick={() => setSelectedRole(role)} aria-pressed={selectedRole === role} className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${selectedRole === role ? "border-accent bg-accent text-white" : "border-rule bg-white text-ink-soft hover:border-accent/50"}`}><AcronymText>{roleLabels[role]}</AcronymText> · {count}</button>;
            })}</div>
            <section className="mt-4"><h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-moss">Top contributors</h3>{rankingTable(ranking.top, "No active ads reported.")}</section>
            <section className="mt-5"><h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-brick">Lowest contributors</h3>{rankingTable(ranking.bottom, ranking.top.length ? "All active ads are already shown above." : "No active ads reported.")}</section>
          </>
        </div>}
      </div>
    </article>
  );
}
