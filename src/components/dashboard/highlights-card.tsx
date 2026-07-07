"use client";

import { usePolled } from "@/lib/hooks/use-polled";
import { useMarketStatus } from "@/lib/hooks/use-market-status";
import {
  buildHighlights,
  getFiiDii,
  getSectorPerformance,
} from "@/lib/market/dashboard-extras";
import { Panel, PanelHeader } from "./panel";

export function HighlightsCard() {
  const status = useMarketStatus();
  const marketOpen = status === "open";
  const { data } = usePolled(
    async (p) => {
      const [indices, movers, sectors] = await Promise.all([
        p.getIndices(),
        p.getMovers(),
        getSectorPerformance(p),
      ]);
      const flows = getFiiDii("day");
      return buildHighlights(
        indices,
        movers,
        sectors,
        flows[flows.length - 1],
        marketOpen,
      );
    },
    30_000,
    [marketOpen],
  );

  return (
    <Panel>
      <PanelHeader icon="⚡" title="Market Highlights" />
      <ul className="space-y-2 p-3 text-xs">
        {!data || data.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="h-3.5 animate-pulse rounded bg-surface-2" />
            ))
          : data.map((line) => (
              <li key={line} className="flex gap-2 text-ink-2">
                <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent" />
                {line}
              </li>
            ))}
      </ul>
    </Panel>
  );
}
