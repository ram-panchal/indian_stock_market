"use client";

import { usePolled } from "@/lib/hooks/use-polled";
import {
  NIFTY_TOKEN,
  lastSessionCandles,
  synthBreadthSeries,
} from "@/lib/market/dashboard-extras";
import { AreaChart } from "@/components/ui/area-chart";
import { Panel, PanelHeader } from "./panel";

/** SVG arc from `startDeg` to `endDeg` (0° = right, 90° = top, 180° = left). */
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy - r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg));
  const y2 = cy - r * Math.sin(rad(endDeg));
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function BreadthCard() {
  const { data } = usePolled((p) => p.getMovers(), 5000, []);
  const { data: candles } = usePolled(
    (p) => p.getCandles(NIFTY_TOKEN, "5m", 76),
    60_000,
    [],
  );

  const advances = data?.advances ?? 0;
  const declines = data?.declines ?? 0;
  const total = advances + declines + (data?.unchanged ?? 0);

  const closes = lastSessionCandles(candles ?? []).map((c) => c.close);
  const breadth = synthBreadthSeries(closes, advances, declines);

  // Gauge: green arc for advances (from 180°), red for declines, small gap.
  const advFrac = total > 0 ? advances / total : 0.5;
  const gapDeg = 4;
  const advEnd = 180 - Math.max(advFrac * 180 - gapDeg / 2, 0);

  return (
    <Panel>
      <PanelHeader icon="🧭" title="Market Breadth" />
      <div className="p-3">
        <div className="relative mx-auto max-w-56">
          <svg viewBox="0 0 180 100" className="w-full" aria-hidden>
            <path
              d={arcPath(90, 90, 74, 180, 0)}
              fill="none"
              stroke="var(--surface-3)"
              strokeWidth="11"
              strokeLinecap="round"
            />
            {total > 0 ? (
              <>
                <path
                  d={arcPath(90, 90, 74, 180, advEnd)}
                  fill="none"
                  stroke="var(--up)"
                  strokeWidth="11"
                  strokeLinecap="round"
                />
                <path
                  d={arcPath(90, 90, 74, advEnd - gapDeg, 0)}
                  fill="none"
                  stroke="var(--down)"
                  strokeWidth="11"
                  strokeLinecap="round"
                />
              </>
            ) : null}
          </svg>
          <div className="absolute inset-x-0 bottom-0 text-center">
            <p className="tnum text-2xl font-semibold text-ink">{total || "—"}</p>
            <p className="text-[10px] text-ink-3">Total</p>
          </div>
        </div>
        <div className="mt-2 flex justify-between text-xs">
          <div className="text-center">
            <p className="tnum text-base font-semibold text-up">{advances}</p>
            <p className="text-[10px] text-ink-3">Advances</p>
          </div>
          <div className="text-center">
            <p className="tnum text-base font-semibold text-down">{declines}</p>
            <p className="text-[10px] text-ink-3">Declines</p>
          </div>
        </div>

        {breadth.adv.length > 1 ? (
          <div className="mt-3 border-t border-border pt-3">
            <AreaChart
              height={56}
              series={[
                { values: breadth.adv, color: "var(--up)" },
                { values: breadth.dec, color: "var(--down)" },
              ]}
            />
            <div className="mt-1 flex justify-between text-[9px] text-ink-3">
              <span>09:15</span>
              <span>11:30</span>
              <span>13:00</span>
              <span>15:30</span>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
