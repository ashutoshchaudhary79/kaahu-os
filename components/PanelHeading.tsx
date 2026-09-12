import { AcronymText } from "./AcronymText";

export function PanelHeading({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <h2 className="text-[15px] font-semibold"><AcronymText>{title}</AcronymText></h2>
      <span className="text-right text-xs text-ink-faint"><AcronymText>{note}</AcronymText></span>
    </div>
  );
}
