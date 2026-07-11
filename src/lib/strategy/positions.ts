/**
 * Position lifecycle: stop/target/time-stop computation, the daily
 * hold/close/stale decision, and track-record aggregation.
 */

import type { Quote } from "@/lib/market/types";
import { addTradingDays } from "./dates";
import type { CloseReason, PickLogEntry, PositionStatus, StrategyPosition, TrackRecordSummary } from "./types";

const ATR_STOP_MULTIPLE = 1.5;
const MIN_STOP_PCT = 0.02;
const REWARD_RISK_RATIO = 2.0;
const TIME_STOP_TRADING_DAYS = 10;
/** After this many consecutive scan runs with no fetchable quote, stop
 *  guessing and surface the position for manual review instead. */
const STALE_QUOTE_FAILURE_THRESHOLD = 3;

/** ATR-anchored so the stop scales with each stock's own volatility, floored
 *  at 2% of entry to guard against a degenerate near-zero ATR reading. */
export function computeStopTargetTimeStop(
  entryPrice: number,
  atr14: number,
  entryDateIso: string,
): { stopLossPrice: number; targetPrice: number; maxHoldUntilDate: string } {
  const risk = Math.max(ATR_STOP_MULTIPLE * atr14, MIN_STOP_PCT * entryPrice);
  return {
    stopLossPrice: entryPrice - risk,
    targetPrice: entryPrice + REWARD_RISK_RATIO * risk,
    maxHoldUntilDate: addTradingDays(entryDateIso, TIME_STOP_TRADING_DAYS),
  };
}

export interface PositionEvaluation {
  action: "hold" | "close" | "mark_stale";
  closeReason?: CloseReason;
  closePrice?: number;
}

/**
 * Runs once a day, so triggers are checked against the day's traded range
 * (high/low), not just the latest snapshot ltp — a level touched intraday
 * and pulled back from should still count. When both stop and target were
 * technically within today's range, stop-loss wins the tie-break: the
 * conservative assumption when the exact intraday order can't be known from
 * high/low alone. The actual fill is booked at bid/ltp, never at the exact
 * trigger level — a gapped market can jump straight past it.
 */
export function evaluateOpenPosition(
  pos: StrategyPosition,
  quote: Quote | undefined,
  todayIso: string,
): PositionEvaluation {
  if (!quote) {
    const wouldBeFailures = pos.consecutiveQuoteFailures + 1;
    return wouldBeFailures >= STALE_QUOTE_FAILURE_THRESHOLD
      ? { action: "mark_stale" }
      : { action: "hold" };
  }

  if (quote.low > 0 && quote.low <= pos.stopLossPrice) {
    return { action: "close", closeReason: "stop_loss", closePrice: quote.bid || quote.ltp };
  }
  if (quote.high >= pos.targetPrice) {
    return { action: "close", closeReason: "target", closePrice: quote.bid || quote.ltp };
  }
  if (todayIso >= pos.maxHoldUntilDate) {
    return { action: "close", closeReason: "time_stop", closePrice: quote.bid || quote.ltp };
  }
  return { action: "hold" };
}

export function closeReasonToStatus(reason: CloseReason): PositionStatus {
  switch (reason) {
    case "target":
      return "CLOSED_TARGET";
    case "stop_loss":
      return "CLOSED_STOPLOSS";
    case "time_stop":
      return "CLOSED_TIME";
    case "manual":
      return "CLOSED_MANUAL";
    case "stale_no_quote":
      return "STALE_NO_QUOTE";
  }
}

/** Combines the picks log (which includes skipped/no-pick days) with the
 *  positions ledger (which only has entries that actually opened a trade) —
 *  neither alone has enough to answer "how is this strategy actually doing." */
export function computeTrackRecord(
  picks: PickLogEntry[],
  positions: StrategyPosition[],
): TrackRecordSummary {
  const entered = picks.filter((p) => p.action === "entered").length;
  const skipped = picks.length - entered;

  let wins = 0;
  let losses = 0;
  let openCount = 0;
  for (const pos of positions) {
    if (pos.status === "OPEN") {
      openCount++;
    } else if (pos.status === "STALE_NO_QUOTE" || pos.closePrice === undefined) {
      // Never got a valid exit price — not counted as a win or a loss.
      continue;
    } else {
      const pnl = (pos.closePrice - pos.entryPrice) * pos.qty;
      if (pnl >= 0) wins++;
      else losses++;
    }
  }
  const decided = wins + losses;
  return {
    totalPicks: picks.length,
    entered,
    skipped,
    wins,
    losses,
    openCount,
    winRatePct: decided > 0 ? (wins / decided) * 100 : 0,
  };
}
