"use client";

import { Fragment } from "react";
import { useState } from "react";
import { createPortal } from "react-dom";

const ACRONYMS: Record<string, string> = {
  AOV: "Average Order Value",
  BOFU: "Bottom of Funnel",
  CAC: "Customer Acquisition Cost",
  CPA: "Cost per Acquisition",
  CPC: "Cost per Click",
  CPM: "Cost per Mille (cost per 1,000 impressions)",
  CTR: "Click-Through Rate",
  CVR: "Conversion Rate",
  GA4: "Google Analytics 4",
  KPI: "Key Performance Indicator",
  MOFU: "Middle of Funnel",
  ROAS: "Return on Ad Spend",
  SMS: "Short Message Service",
  TOFU: "Top of Funnel",
  UTM: "Urchin Tracking Module",
};

const acronymPattern = new RegExp(`\\b(${Object.keys(ACRONYMS).join("|")})\\b`, "g");

/** Adds an immediate hover definition to every known acronym in a text label. */
export function AcronymText({ children }: { children: string }) {
  const [tooltip, setTooltip] = useState<{ text: string; left: number; top: number; below: boolean } | null>(null);
  const show = (element: HTMLElement, text: string) => {
    const rect = element.getBoundingClientRect();
    const below = rect.top < 55;
    setTooltip({
      text,
      left: Math.min(Math.max(rect.left + rect.width / 2, 150), window.innerWidth - 150),
      top: below ? rect.bottom + 8 : rect.top - 8,
      below,
    });
  };

  return <>
    {children.split(acronymPattern).map((part, index) => ACRONYMS[part]
      ? <abbr
          key={`${part}-${index}`}
          aria-label={`${part}: ${ACRONYMS[part]}`}
          className="acronym-tooltip"
          onMouseEnter={(event) => show(event.currentTarget, ACRONYMS[part])}
          onMouseLeave={() => setTooltip(null)}
        >{part}</abbr>
      : <Fragment key={`${part}-${index}`}>{part}</Fragment>)}
    {tooltip && typeof document !== "undefined" && createPortal(
      <span
        role="tooltip"
        className="pointer-events-none fixed z-[9999] max-w-[min(280px,80vw)] rounded-md bg-ink px-2.5 py-1.5 text-left font-sans text-[11px] font-medium normal-case leading-[1.35] tracking-normal text-white shadow-lg"
        style={{ left: tooltip.left, top: tooltip.top, transform: tooltip.below ? "translate(-50%, 0)" : "translate(-50%, -100%)" }}
      >{tooltip.text}</span>,
      document.body,
    )}
  </>;
}
