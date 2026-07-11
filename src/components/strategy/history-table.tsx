"use client";

import Link from "next/link";
import { formatINR, formatISTDateTime, formatPercent } from "@/lib/market/format";
import { PnlText } from "@/components/market/price-cells";
import { SymbolChip } from "@/components/ui/symbol-chip";
import type { PickLogEntry, StrategyPosition, TrackRecordSummary } from "@/lib/strategy/types";

export interface LivePosition extends StrategyPosition {
  currentPrice?: number;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
}

export interface HistoryPick extends PickLogEntry {
  position?: StrategyPosition;
}

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface p-3">
      <h3 className="text-[10px] font-semibold tracking-wide text-ink-3 uppercase">{label}</h3>
      <p className="mt-1 text-base font-semibold text-ink">{value}</p>
    </div>
  );
}

function outcome(
  pick: HistoryPick,
  livePositions: LivePosition[],
): { label: string; priceLabel: string; pnl?: number; pnlPct?: number } {
  if (!pick.position || !pick.entry) {
    return { label: pick.action.replace(/_/g, " "), priceLabel: "—" };
  }
  if (pick.position.status === "OPEN" || pick.position.status === "STALE_NO_QUOTE") {
    const live = livePositions.find((p) => p.id === pick.position!.id);
    if (live?.currentPrice !== undefined) {
      return {
        label: pick.position.status === "STALE_NO_QUOTE" ? "Stale (no quote)" : "Open",
        priceLabel: formatINR(live.currentPrice),
        pnl: live.unrealizedPnl,
        pnlPct: live.unrealizedPnlPct,
      };
    }
    return { label: pick.position.status === "STALE_NO_QUOTE" ? "Stale (no quote)" : "Open", priceLabel: "—" };
  }
  const closePrice = pick.position.closePrice ?? 0;
  const pnl = (closePrice - pick.entry.price) * pick.entry.qty;
  const pnlPct = (closePrice / pick.entry.price - 1) * 100;
  const label =
    pick.position.status === "CLOSED_TARGET"
      ? "Closed (target)"
      : pick.position.status === "CLOSED_STOPLOSS"
        ? "Closed (stop-loss)"
        : pick.position.status === "CLOSED_TIME"
          ? "Closed (time-stop)"
          : "Closed";
  return { label, priceLabel: formatINR(closePrice), pnl, pnlPct };
}

export function HistoryTable({
  trackRecord,
  picks,
  livePositions,
}: {
  trackRecord: TrackRecordSummary;
  picks: HistoryPick[];
  livePositions: LivePosition[];
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-t-lg border border-border bg-border sm:grid-cols-4">
        <StatTile label="Total picks" value={trackRecord.totalPicks} />
        <StatTile label="Entered / skipped" value={`${trackRecord.entered} / ${trackRecord.skipped}`} />
        <StatTile
          label="Win rate"
          value={trackRecord.wins + trackRecord.losses > 0 ? `${trackRecord.winRatePct.toFixed(0)}%` : "—"}
        />
        <StatTile label="Wins / losses / open" value={`${trackRecord.wins} / ${trackRecord.losses} / ${trackRecord.openCount}`} />
      </div>

      {picks.length === 0 ? (
        <p className="rounded-b-lg border border-t-0 border-border bg-surface px-4 py-10 text-center text-xs text-ink-3">
          No picks logged yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-b-lg border border-t-0 border-border bg-surface">
          <table className="w-full min-w-[680px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-ink-3">
                <th className="px-3 py-2 font-normal">Date</th>
                <th className="px-3 py-2 font-normal">Symbol</th>
                <th className="px-3 py-2 font-normal">Conviction</th>
                <th className="px-3 py-2 text-right font-normal">Entry</th>
                <th className="px-3 py-2 text-right font-normal">Current / exit</th>
                <th className="px-3 py-2 text-right font-normal">P&amp;L</th>
                <th className="px-3 py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {picks.map((pick) => {
                const out = outcome(pick, livePositions);
                return (
                  <tr key={pick.runId} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-3 py-2 text-ink-2" title={formatISTDateTime(pick.decidedAt)}>
                      {pick.dateIso}
                    </td>
                    <td className="px-3 py-2">
                      {pick.symbol && pick.token ? (
                        <Link
                          href={`/charts?token=${encodeURIComponent(pick.token)}`}
                          className="flex items-center gap-1.5 font-medium text-ink hover:underline"
                        >
                          <SymbolChip label={pick.symbol} />
                          {pick.symbol}
                        </Link>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{pick.conviction ?? "—"}</td>
                    <td className="tnum px-3 py-2 text-right text-ink-2">
                      {pick.entry ? formatINR(pick.entry.price) : "—"}
                    </td>
                    <td className="tnum px-3 py-2 text-right text-ink-2">{out.priceLabel}</td>
                    <td className="px-3 py-2 text-right">
                      {out.pnl !== undefined ? (
                        <span>
                          <PnlText value={out.pnl} />{" "}
                          <span className="text-[10px] text-ink-3">
                            ({formatPercent(out.pnlPct ?? 0)})
                          </span>
                        </span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ink-3">{out.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
