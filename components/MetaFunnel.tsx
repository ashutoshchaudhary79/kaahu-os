"use client";

import { useMemo, useState } from "react";
import { PanelHeading } from "./PanelHeading";

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

  const rankingTable = (rows: FunnelAd[], empty: string) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-xs">
        <thead><tr className="text-[10px] uppercase tracking-[0.04em] text-ink-faint"><th className="w-[34%] border-b border-rule pb-2 text-left font-medium">Ad</th><th className="w-[22%] border-b border-rule pb-2 text-left font-medium">Campaign</th><th className="border-b border-rule pb-2 text-right font-medium">Events</th><th className="border-b border-rule pb-2 text-right font-medium">Share</th><th className="border-b border-rule pb-2 text-right font-medium">Spend</th><th className="border-b border-rule pb-2 text-right font-medium">{selectedStage === "impressions" ? "CPM" : "Cost / event"}</th></tr></thead>
        <tbody>
          {rows.map((ad) => {
            const events = selectedStage ? ad[selectedStage] : 0;
            const cost = selectedStage === "impressions" ? (events ? (ad.spend / events) * 1000 : null) : (events ? ad.spend / events : null);
            return <tr key={ad.id} className={events === 0 ? "text-ink-faint" : ""}>
              <td className="truncate border-b border-rule py-2.5 pr-3 font-medium" title={ad.name}>{ad.name}</td>
              <td className="truncate border-b border-rule py-2.5 pr-3 text-ink-faint" title={ad.campaignName}>{ad.campaignName}</td>
              <td className="border-b border-rule py-2.5 text-right tabular-nums">{events.toLocaleString("en-US")}</td>
              <td className="border-b border-rule py-2.5 text-right tabular-nums">{total ? `${((events / total) * 100).toFixed(1)}%` : "—"}</td>
              <td className="border-b border-rule py-2.5 text-right tabular-nums">{money(ad.spend)}</td>
              <td className="border-b border-rule py-2.5 text-right tabular-nums">{cost === null ? "—" : money(cost)}</td>
            </tr>;
          })}
          {!rows.length && <tr><td colSpan={6} className="py-6 text-center text-ink-faint">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return (
    <article className="rounded border border-rule bg-white p-5 sm:p-6">
      <PanelHeading title="Meta funnel" note="Click a stage for top and bottom ads" />
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.7fr)_minmax(0,1.3fr)]">
        <div className="space-y-2.5">
          {!steps.length && <p className="py-20 text-center text-sm text-ink-faint">No Meta activity in this range</p>}
          {steps.map((step) => {
            const active = selectedStage === step.key;
            return <button key={step.key} type="button" onClick={() => { setSelectedStage(step.key); setSelectedRole(defaultRole[step.key]); }} aria-pressed={active} className={`block w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${active ? "bg-accent-soft" : ""}`}>
              <span className="grid grid-cols-[118px_1fr_76px] items-center gap-3 text-xs"><span className={active ? "font-medium text-ink" : "text-ink-soft"}>{step.label}</span><span className="h-[22px] overflow-hidden rounded-sm bg-accent-soft"><span className="block h-full min-w-[3px] bg-accent" style={{ width: `${step.width}%` }} /></span><span className="text-right font-medium tabular-nums">{step.value}</span></span>
              {step.note && <span className="ml-[130px] mt-0.5 block text-[11px] text-brick tabular-nums">{step.note}</span>}
            </button>;
          })}
        </div>

        <div className="min-h-[250px] rounded border border-rule bg-paper/45 p-4">
          {!selectedStage || !selected ? <div className="flex min-h-[218px] items-center justify-center text-center text-xs leading-5 text-ink-faint">Select a funnel stage to compare its strongest and weakest contributing ads.</div> : <>
            <div className="flex items-baseline justify-between gap-4"><div><p className="text-sm font-semibold">{selected.label} by ad</p><p className="mt-0.5 text-[11px] text-ink-faint">Compared within campaign funnel role</p></div><span className="text-xs font-medium tabular-nums">{total.toLocaleString("en-US")} total</span></div>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Campaign funnel role">{(["tofu", "mofu", "sales"] as const).map((role) => {
              const count = ads.filter((ad) => ad.role === role).length;
              return <button key={role} type="button" onClick={() => setSelectedRole(role)} aria-pressed={selectedRole === role} className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${selectedRole === role ? "border-accent bg-accent text-white" : "border-rule bg-white text-ink-soft hover:border-accent/50"}`}>{roleLabels[role]} · {count}</button>;
            })}</div>
            <section className="mt-4"><h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-moss">Top contributors</h3>{rankingTable(ranking.top, "No active ads reported.")}</section>
            <section className="mt-5"><h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-brick">Lowest contributors</h3>{rankingTable(ranking.bottom, ranking.top.length ? "All active ads are already shown above." : "No active ads reported.")}</section>
          </>}
        </div>
      </div>
    </article>
  );
}
