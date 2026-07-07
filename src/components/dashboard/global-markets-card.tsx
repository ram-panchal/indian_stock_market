"use client";

import { useMemo } from "react";
import { getGlobalMarkets } from "@/lib/market/dashboard-extras";
import { formatPercent, formatPrice } from "@/lib/market/format";
import { Panel, PanelHeader } from "./panel";

export function GlobalMarketsCard() {
  // Seeded per IST day — stable across reloads, no crypto, indices only.
  const markets = useMemo(() => getGlobalMarkets(), []);

  return (
    <Panel className="flex flex-col">
      <PanelHeader icon="🌐" title="Global Market" />
      <div className="flex-1 space-y-1 p-2">
        {markets.map((m) => {
          const up = m.changePercent >= 0;
          return (
            <div
              key={m.symbol}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-surface-2"
            >
              <span aria-hidden className="text-sm">
                {m.flag}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{m.name}</span>
              <span className="tnum text-ink">{formatPrice(m.value)}</span>
              <span className={`tnum w-14 text-right ${up ? "text-up" : "text-down"}`}>
                {formatPercent(m.changePercent)}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
