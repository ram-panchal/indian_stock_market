"use client";

import { usePolled } from "@/lib/hooks/use-polled";
import { useQuote } from "@/lib/hooks/use-quote";
import { NIFTY_TOKEN, getMarketStats } from "@/lib/market/dashboard-extras";
import { formatPercent } from "@/lib/market/format";
import { Panel, PanelHeader } from "./panel";

export function MarketStatsCard() {
  const { data: movers } = usePolled((p) => p.getMovers(), 5000, []);
  const nifty = useQuote(NIFTY_TOKEN);

  const stats =
    movers && nifty
      ? getMarketStats(movers.advances, movers.declines, nifty.changePercent)
      : null;

  const rows: [string, React.ReactNode][] = [
    [
      "Market Cap",
      stats ? (
        <span className="tnum text-ink">₹{stats.marketCapLcr.toFixed(2)} L Cr</span>
      ) : (
        "—"
      ),
    ],
    [
      "Advance / Decline",
      movers ? (
        <span className="tnum">
          <span className="text-up">{movers.advances}</span>
          <span className="text-ink-3"> / </span>
          <span className="text-down">{movers.declines}</span>
        </span>
      ) : (
        "—"
      ),
    ],
    [
      "New 52W High",
      stats ? <span className="tnum text-ink">{stats.new52WHigh}</span> : "—",
    ],
    [
      "New 52W Low",
      stats ? <span className="tnum text-ink">{stats.new52WLow}</span> : "—",
    ],
    [
      "Average PE",
      stats ? <span className="tnum text-ink">{stats.avgPe.toFixed(2)}</span> : "—",
    ],
    [
      "India VIX",
      stats ? (
        <span className="tnum">
          <span className="text-ink">{stats.vix.toFixed(2)} </span>
          <span className={stats.vixChangePercent >= 0 ? "text-up" : "text-down"}>
            {formatPercent(stats.vixChangePercent)}
          </span>
        </span>
      ) : (
        "—"
      ),
    ],
  ];

  return (
    <Panel>
      <PanelHeader icon="📈" title="Market Statistics" />
      <dl className="space-y-2.5 p-3 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between">
            <dt className="text-ink-3">{label}</dt>
            <dd className="text-ink-2">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
