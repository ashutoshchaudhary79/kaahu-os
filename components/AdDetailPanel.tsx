"use client";

import { useEffect, useRef, useState } from "react";
import type { AdSettings, SettingsRecord, SettingValue } from "@/lib/meta-ad-settings";
import type { PerformanceRow } from "./CampaignTable";

const label = (text: string) => text.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
function Value({ value, currency }: { value: SettingValue; currency?: string }) {
  if (value === null || value === "") return <span className="text-ink-faint">Unavailable</span>;
  if (Array.isArray(value)) return value.length ? <div className="space-y-2">{value.map((item, index) => <div key={index} className="border-l border-rule pl-3"><Value value={item} currency={currency} /></div>)}</div> : <span>None configured</span>;
  if (typeof value === "object") return <Fields fields={value} currency={currency} />;
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return <a href={value} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline">{value}</a>;
  return <span className="whitespace-pre-wrap break-words">{typeof value === "boolean" ? value ? "Yes" : "No" : String(value)}</span>;
}
function Fields({ fields, currency }: { fields: SettingsRecord; currency?: string }) {
  const display = (key: string, value: SettingValue): SettingValue => {
    if (key === "genders" && Array.isArray(value)) return value.map((gender) => gender === 1 ? "Men" : gender === 2 ? "Women" : gender);
    if (/^(daily_budget|lifetime_budget|bid_amount)$/.test(key) && currency && value !== null && value !== "" && Number.isFinite(Number(value))) {
      const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
      const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
      return formatter.format(Number(value) / 10 ** digits);
    }
    return value;
  };
  return <dl className="space-y-3">{Object.entries(fields).map(([key, value]) => <div key={key}><dt className="text-[11px] text-ink-faint">{label(key)}{/^(daily_budget|lifetime_budget|bid_amount)$/.test(key) && !currency ? " (account minor units)" : ""}</dt><dd className="mt-1 text-sm"><Value value={display(key, value)} currency={currency} /></dd></div>)}</dl>;
}
export function AdDetailPanel({ ad, range, onClose }: { ad: PerformanceRow | null; range: { from: string; to: string }; onClose: () => void }) {
  const [settings, setSettings] = useState<AdSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!ad) return;
    const controller = new AbortController();
    setSettings(null); setError(null); setWarning(null); setLoading(true);
    fetch(`/api/meta/ad-detail?adId=${encodeURIComponent(ad.id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { settings?: AdSettings; error?: string; warning?: string };
        if (!response.ok || !body.settings) throw new Error(body.error ?? "Ad details unavailable");
        if (!controller.signal.aborted) { setSettings(body.settings); setWarning(body.warning ?? null); }
      }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Ad details unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab") return;
      const elements = panel.current?.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { controller.abort(); document.body.style.overflow = overflow; document.removeEventListener("keydown", keyboard); previousFocus?.focus(); };
  }, [ad]);
  if (!ad) return null;
  const thumbnail = settings?.creative.thumbnail_url ?? settings?.creative.image_url;
  return <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="ad-detail-title">
    <button type="button" tabIndex={-1} aria-label="Close ad details" onClick={onClose} className="absolute inset-0 bg-ink/35 backdrop-blur-[1px]" />
    <section ref={panel} tabIndex={-1} className="absolute inset-y-0 right-0 flex w-full max-w-[880px] flex-col bg-paper shadow-2xl outline-none">
      <header className="flex items-start justify-between gap-4 border-b border-rule bg-white p-5"><div><p className="text-xs uppercase tracking-wide text-accent">Meta ad details</p><h2 id="ad-detail-title" className="mt-1 text-xl font-semibold">{ad.name}</h2><p className="mt-1 text-xs text-ink-faint">Ad ID {ad.id}</p></div><button type="button" onClick={onClose} className="rounded border border-rule px-3 py-2 text-sm">Close</button></header>
      <div className="flex-1 space-y-5 overflow-auto p-5 sm:p-7">
        <section className="rounded border border-rule bg-white p-4"><h3 className="text-sm font-semibold">Performance · {range.from} to {range.to}</h3><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Spend",ad.spend],["Purchases",ad.purchases],["CPA",ad.cpa],["Meta ROAS",ad.roas],["Frequency",ad.frequency],["Link CTR",ad.ctr],["CPC",ad.cpc],["Landing views",ad.landingPageViews],["Add to cart",ad.addToCart],["Checkouts",ad.checkoutInitiated]].map(([key,value]) => <div key={key}><p className="text-[11px] text-ink-faint">{key}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}</div></section>
        {loading && <p role="status" className="text-sm text-ink-faint">Retrieving ad settings…</p>}
        {error && <p role="alert" className="rounded border border-brick/30 p-4 text-sm text-brick">{error}</p>}
        {settings && <>
          <div className="rounded border border-rule bg-accent-soft p-4 text-xs leading-5"><p>Settings observed {new Date(settings.retrievedAt).toLocaleString()}. These describe that snapshot, not necessarily the selected performance dates. Snapshots are saved when ads are inspected.</p><p className="mt-2">Audience and placements below describe configuration, not the people or placements that actually received delivery. Automated expansion may extend audience suggestions.</p>{settings.currency && <p className="mt-2">Account currency: {settings.currency}. Budgets and bids are converted from Meta’s account minor units.</p>}</div>
          {(warning || settings.warnings.length > 0) && <div role="status" className="space-y-1 text-sm text-brick">{warning && <p>{warning}</p>}{settings.warnings.map((item) => <p key={item}>{item}</p>)}</div>}
          <a className="inline-block text-sm text-accent underline" href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${settings.accountId.replace("act_", "")}&selected_ad_ids=${ad.id}`} target="_blank" rel="noopener noreferrer">Open in Ads Manager ↗</a>
          {typeof thumbnail === "string" && /^https:\/\//.test(thumbnail) && <div role="img" aria-label={`Creative preview for ${ad.name}`} className="aspect-video rounded border border-rule bg-white bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(thumbnail)})` }} />}
          {([['Creative, copy and CTA',settings.creative],['Configured audience',settings.audience],['Configured placements and devices',settings.placements],['Delivery and budget settings',settings.delivery],['Status and campaign identity',settings.identity]] as const).map(([title,fields]) => <section key={title} className="rounded border border-rule bg-white p-4"><h3 className="mb-4 text-sm font-semibold">{title}</h3>{Object.keys(fields).length ? <Fields fields={fields} currency={settings.currency} /> : <p className="text-sm text-ink-faint">No explicit settings returned by Meta. No settings have been inferred.</p>}{title === 'Creative, copy and CTA' && <p className="mt-4 text-xs text-ink-faint">Dynamic and flexible ads may have multiple assets and messaging variants; configured variants do not identify which combination each person saw.</p>}</section>)}
        </>}
      </div>
    </section>
  </div>;
}
