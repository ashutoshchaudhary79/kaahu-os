export function PanelHeading({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <span className="text-right text-xs text-ink-faint">{note}</span>
    </div>
  );
}
