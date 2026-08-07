import { PanelHeading } from "./PanelHeading";

type FunnelStep = { label: string; value: string; width: number; note?: string };

export function MetaFunnel({ steps }: { steps: FunnelStep[] }) {
  return (
    <article className="rounded border border-rule bg-white p-5 sm:p-6">
      <PanelHeading title="Meta funnel" note="Paid traffic only" />
      <div className="space-y-3.5">
        {!steps.length && <p className="py-20 text-center text-sm text-ink-faint">No Meta activity in this range</p>}
        {steps.map((step) => (
          <div key={step.label}>
            <div className="grid grid-cols-[108px_1fr_68px] items-center gap-2.5 text-xs sm:grid-cols-[118px_1fr_76px] sm:gap-3">
              <span className="text-ink-soft">{step.label}</span>
              <div className="h-[22px] overflow-hidden rounded-sm bg-accent-soft"><div className="h-full min-w-[3px] bg-accent" style={{ width: `${step.width}%` }} /></div>
              <span className="text-right font-medium tabular-nums">{step.value}</span>
            </div>
            {step.note && <p className="ml-[118px] mt-0.5 text-[11px] text-brick tabular-nums sm:ml-[130px]">{step.note}</p>}
          </div>
        ))}
      </div>
    </article>
  );
}
