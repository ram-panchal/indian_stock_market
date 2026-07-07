"use client";

import { useState } from "react";
import { usePolled } from "@/lib/hooks/use-polled";
import { getSectorPerformance } from "@/lib/market/dashboard-extras";
import { formatPercent } from "@/lib/market/format";
import { Panel, PanelFooterButton, PanelHeader } from "./panel";

export function SectorPerformanceCard() {
  const [expanded, setExpanded] = useState(false);
  const { data } = usePolled((p) => getSectorPerformance(p), 5000, []);

  const sectors = data ?? [];
  const maxAbs = Math.max(...sectors.map((s) => Math.abs(s.changePercent)), 0.01);
  const visible = expanded ? sectors : sectors.slice(0, 5);

  return (
    <Panel>
      <PanelHeader icon="🔥" title="Sector Performance" />
      <div className="space-y-2.5 p-3">
        {sectors.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-3.5 animate-pulse rounded bg-surface-2" />
            ))
          : visible.map((sector) => {
              const up = sector.changePercent >= 0;
              return (
                <div key={sector.name} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 truncate text-ink-2">
                    {sector.name}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={`h-full rounded-full ${up ? "bg-up" : "bg-down"}`}
                      style={{
                        width: `${Math.max((Math.abs(sector.changePercent) / maxAbs) * 100, 4)}%`,
                      }}
                    />
                  </div>
                  <span
                    className={`tnum w-14 shrink-0 text-right ${up ? "text-up" : "text-down"}`}
                  >
                    {formatPercent(sector.changePercent)}
                  </span>
                </div>
              );
            })}
      </div>
      {sectors.length > 5 ? (
        <PanelFooterButton
          label={expanded ? "Show Less" : "View All Sectors"}
          onClick={() => setExpanded((e) => !e)}
        />
      ) : null}
    </Panel>
  );
}
