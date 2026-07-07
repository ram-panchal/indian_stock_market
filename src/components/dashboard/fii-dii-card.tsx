"use client";

import { useMemo, useState } from "react";
import {
  getFiiDii,
  type FlowPeriod,
  type FlowPoint,
} from "@/lib/market/dashboard-extras";
import { formatPrice } from "@/lib/market/format";
import { Segmented } from "@/components/ui/segmented";
import { Panel, PanelHeader } from "./panel";

const PERIODS = [
  { value: "day" as FlowPeriod, label: "Day" },
  { value: "week" as FlowPeriod, label: "Week" },
  { value: "month" as FlowPeriod, label: "Month" },
  { value: "year" as FlowPeriod, label: "Year" },
];

function FlowBars({ points }: { points: FlowPoint[] }) {
  const maxAbs = Math.max(
    ...points.flatMap((p) => [Math.abs(p.fii), Math.abs(p.dii)]),
    1,
  );
  const H = 100;
  const zero = H / 2;
  const scale = (v: number) => (Math.abs(v) / maxAbs) * (H / 2 - 4);
  const groupW = 100 / points.length;
  const barW = groupW * 0.3;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-28 w-full"
      aria-hidden
    >
      <line x1="0" y1={zero} x2="100" y2={zero} stroke="var(--border)" strokeWidth="0.5" />
      {points.map((p, i) => {
        const x = i * groupW + groupW * 0.18;
        return (
          <g key={i}>
            <rect
              x={x}
              width={barW}
              y={p.fii >= 0 ? zero - scale(p.fii) : zero}
              height={Math.max(scale(p.fii), 0.5)}
              fill={p.fii >= 0 ? "var(--up)" : "var(--down)"}
              opacity="0.85"
            />
            <rect
              x={x + barW + groupW * 0.06}
              width={barW}
              y={p.dii >= 0 ? zero - scale(p.dii) : zero}
              height={Math.max(scale(p.dii), 0.5)}
              fill={p.dii >= 0 ? "var(--up)" : "var(--down)"}
              opacity="0.45"
            />
          </g>
        );
      })}
    </svg>
  );
}

export function FiiDiiCard() {
  const [period, setPeriod] = useState<FlowPeriod>("day");
  const points = useMemo(() => getFiiDii(period), [period]);
  const latest = points[points.length - 1];

  return (
    <Panel className="flex flex-col">
      <PanelHeader
        icon="💰"
        title="FII / DII Activity"
        right={<span className="text-[10px] text-ink-3">(₹ Crore)</span>}
      />
      <div className="flex flex-1 flex-col p-3">
        <Segmented size="xs" options={PERIODS} value={period} onChange={setPeriod} />
        <div className="mt-3 flex-1">
          <FlowBars points={points} />
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-ink-3">
          <span>{points[0]?.label}</span>
          <span>{latest?.label}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-xs">
          <span>
            <span className="text-ink-3">FII </span>
            <span className={`tnum ${latest && latest.fii >= 0 ? "text-up" : "text-down"}`}>
              {latest ? `${latest.fii >= 0 ? "+" : "-"}${formatPrice(Math.abs(latest.fii))}` : "—"}
            </span>
          </span>
          <span>
            <span className="text-ink-3">DII </span>
            <span className={`tnum ${latest && latest.dii >= 0 ? "text-up" : "text-down"}`}>
              {latest ? `${latest.dii >= 0 ? "+" : "-"}${formatPrice(Math.abs(latest.dii))}` : "—"}
            </span>
          </span>
        </div>
      </div>
    </Panel>
  );
}
