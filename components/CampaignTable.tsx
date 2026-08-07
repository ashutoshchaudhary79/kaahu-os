import { PanelHeading } from "./PanelHeading";
import type { Campaign } from "@/lib/sample-data";

export function CampaignTable({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <section className="rounded border border-rule bg-white p-5 sm:p-6">
      <PanelHeading title="Campaign breakdown" note="Sorted by spend" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead><tr>{["Campaign", "Spend", "CTR", "CPC", "Purchases", "ROAS", "CPA"].map((heading, index) => <th key={heading} className={`border-b border-rule px-3 pb-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-faint ${index ? "text-right" : "text-left"}`}>{heading}</th>)}</tr></thead>
          <tbody>{campaigns.map((campaign) => <tr key={campaign.name} className="last:[&_td]:border-b-0">
            <td className="border-b border-rule px-3 py-3.5 font-medium">{campaign.name}<span className="mt-0.5 block text-[11px] font-normal text-ink-faint">{campaign.type}</span></td>
            {[campaign.spend, campaign.ctr, campaign.cpc, campaign.purchases].map((value, index) => <td key={index} className="border-b border-rule px-3 py-3.5 text-right tabular-nums">{value}</td>)}
            <td className={`border-b border-rule px-3 py-3.5 text-right font-semibold tabular-nums ${campaign.strong ? "text-moss" : "text-brick"}`}>{campaign.roas}</td>
            <td className="border-b border-rule px-3 py-3.5 text-right tabular-nums">{campaign.cpa}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
