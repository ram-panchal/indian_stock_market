/** Shared card scaffolding for dashboard panels. */

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-border bg-surface ${className}`}>
      {children}
    </section>
  );
}

export function PanelHeader({
  icon,
  title,
  right,
}: {
  icon: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-[13px]"
        >
          {icon}
        </span>
        <h3 className="text-xs font-semibold text-ink">{title}</h3>
      </div>
      {right}
    </div>
  );
}

export function PanelFooterButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="border-t border-border p-2">
      <button
        onClick={onClick}
        className="w-full rounded-md border border-border bg-surface-2 py-1.5 text-[11px] font-medium text-ink-2 transition-colors hover:text-ink"
      >
        {label} →
      </button>
    </div>
  );
}
