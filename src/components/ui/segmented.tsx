"use client";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "xs";
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-surface-2 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded ${size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"} font-medium transition-colors ${
            value === opt.value
              ? "bg-surface-3 text-ink shadow-sm"
              : "text-ink-3 hover:text-ink-2"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
