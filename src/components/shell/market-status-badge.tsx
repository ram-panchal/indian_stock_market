"use client";

import { useMarketStatus } from "@/lib/hooks/use-market-status";
import { MARKET_STATUS_LABEL } from "@/lib/market/status";

const DOT: Record<string, string> = {
  open: "bg-up",
  "pre-open": "bg-warn",
  closed: "bg-ink-3",
};

export function MarketStatusBadge() {
  const status = useMarketStatus();
  if (!status) return null;
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-ink-2 sm:inline-flex"
      title="NSE session clock (IST). Exchange holidays not modelled."
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {MARKET_STATUS_LABEL[status]}
    </span>
  );
}
