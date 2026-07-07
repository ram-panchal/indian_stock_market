"use client";

/**
 * Live price cells. Each one subscribes to its own token via useQuote, so a
 * tick re-renders exactly the cells showing that instrument — this is the
 * pattern that keeps dense tables smooth under frequent updates.
 */

import { memo, useEffect, useRef, useState } from "react";
import { useQuote } from "@/lib/hooks/use-quote";
import { formatPercent, formatPrice } from "@/lib/market/format";

/** Flash green/red when the value moves up/down. */
function useTickFlash(value: number | undefined): string {
  const prev = useRef<number | undefined>(undefined);
  const [flash, setFlash] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (value === undefined) return;
    const last = prev.current;
    prev.current = value;
    if (last === undefined || value === last) return;
    setFlash(value > last ? "flash-up" : "flash-down");
    setNonce((n) => n + 1);
  }, [value]);

  // nonce keys the span so the CSS animation restarts on every change
  return `${flash}#${nonce}`;
}

export const LtpCell = memo(function LtpCell({
  token,
  className = "",
}: {
  token: string;
  className?: string;
}) {
  const quote = useQuote(token);
  const flashKey = useTickFlash(quote?.ltp);
  const [flash, nonce] = flashKey.split("#");
  if (!quote) return <span className={`tnum text-ink-3 ${className}`}>—</span>;
  return (
    <span key={nonce} className={`tnum rounded px-1 ${flash} ${className}`}>
      {formatPrice(quote.ltp)}
    </span>
  );
});

export const ChangeCell = memo(function ChangeCell({
  token,
  showAbs = false,
  className = "",
}: {
  token: string;
  showAbs?: boolean;
  className?: string;
}) {
  const quote = useQuote(token);
  if (!quote) return <span className={`tnum text-ink-3 ${className}`}>—</span>;
  const up = quote.change >= 0;
  return (
    <span className={`tnum ${up ? "text-up" : "text-down"} ${className}`}>
      {showAbs ? `${up ? "+" : ""}${formatPrice(quote.change)} ` : ""}
      {formatPercent(quote.changePercent)}
    </span>
  );
});

export function PnlText({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const tone = value > 0 ? "text-up" : value < 0 ? "text-down" : "text-ink-2";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`tnum ${tone} ${className}`}>
      {sign}
      {formatPrice(value)}
    </span>
  );
}
