/** Deterministic coloured monogram chip — stands in for instrument logos. */

function hue(label: string): number {
  let h = 0;
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + label.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export function SymbolChip({
  label,
  size = "sm",
  round = false,
}: {
  label: string;
  size?: "sm" | "md";
  round?: boolean;
}) {
  const h = hue(label);
  const initials = label.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center font-bold ${
        size === "md" ? "h-8 w-8 text-[11px]" : "h-6 w-6 text-[9px]"
      } ${round ? "rounded-full" : "rounded-md"}`}
      style={{
        backgroundColor: `hsl(${h} 70% 50% / 0.16)`,
        color: `hsl(${h} 70% 58%)`,
      }}
    >
      {initials}
    </span>
  );
}
