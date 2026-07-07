"use client";

import { useState } from "react";
import { usePolled } from "@/lib/hooks/use-polled";
import { useQuote } from "@/lib/hooks/use-quote";
import {
  BANKNIFTY_TOKEN,
  FINNIFTY_TOKEN,
  NIFTY_TOKEN,
  lastSessionCandles,
} from "@/lib/market/dashboard-extras";
import { formatPrice } from "@/lib/market/format";
import { AreaChart } from "@/components/ui/area-chart";
import { Segmented } from "@/components/ui/segmented";
import { Panel, PanelHeader } from "./panel";

const INDEX_TABS = [
  { value: NIFTY_TOKEN, label: "NIFTY 50" },
  { value: BANKNIFTY_TOKEN, label: "BANKNIFTY" },
  { value: FINNIFTY_TOKEN, label: "FINNIFTY" },
];

export function IndexTrendCard() {
  const [token, setToken] = useState(NIFTY_TOKEN);
  const quote = useQuote(token);
  const { data: candles } = usePolled(
    (p) => p.getCandles(token, "5m", 76),
    60_000,
    [token],
  );

  const closes = lastSessionCandles(candles ?? []).map((c) => c.close);
  const up = (quote?.change ?? 0) >= 0;
  const color = up ? "var(--up)" : "var(--down)";

  return (
    <Panel className="flex flex-col">
      <PanelHeader icon="📉" title="Index Trend (1D)" />
      <div className="flex flex-1 flex-col p-3">
        <Segmented
          size="xs"
          options={INDEX_TABS}
          value={token}
          onChange={setToken}
        />
        <div className="relative mt-3 flex-1">
          {closes.length > 1 ? (
            <>
              <span className="tnum absolute top-0 left-0 z-10 text-[9px] text-ink-3">
                {formatPrice(Math.max(...closes), 0)}
              </span>
              <span className="tnum absolute bottom-0 left-0 z-10 text-[9px] text-ink-3">
                {formatPrice(Math.min(...closes), 0)}
              </span>
              <AreaChart height={110} series={[{ values: closes, color }]} />
            </>
          ) : (
            <div className="h-[110px] animate-pulse rounded bg-surface-2" />
          )}
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-ink-3">
          <span>09:15</span>
          <span>11:30</span>
          <span>13:00</span>
          <span>15:30</span>
        </div>
        <div className="mt-2 border-t border-border pt-2 text-xs">
          {quote ? (
            <span className="tnum">
              <span className="font-semibold text-ink">{formatPrice(quote.ltp)}</span>{" "}
              <span className={up ? "text-up" : "text-down"}>
                {up ? "▲" : "▼"} {up ? "+" : ""}
                {quote.changePercent.toFixed(2)}%
              </span>
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </div>
      </div>
    </Panel>
  );
}
