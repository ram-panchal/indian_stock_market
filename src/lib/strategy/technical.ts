/**
 * Stage B — candle-level composite score computed only for the Stage A
 * shortlist (the expensive per-symbol historical-candle fetch this two-stage
 * funnel exists to defer). Discrete point-scoring, not a continuous/opaque
 * score, so every point is individually explainable — consistent with the
 * "no fake precision" goal extended into the scoring approach itself.
 */

import type { Candle, Quote } from "@/lib/market/types";
import { atr, macd, rsi, sma } from "@/lib/indicators";
import { istTodayIso } from "./dates";

export interface TechnicalResult {
  stageBScore: number;
  reasons: string[];
  flags: string[];
  atr14: number;
  high52w?: number;
}

const MIN_HISTORY_BARS = 60;
/** Look back this many raw sessions for the corporate-action discontinuity guard. */
const CORP_ACTION_LOOKBACK = 30;
/** Most NSE stocks have 5/10/20% circuit bands, so a >25% raw single-session
 *  move is already unusual enough to warrant "don't trust this
 *  automatically" — whether it's an unadjusted split/bonus or a rare
 *  genuine move. Defensive either way. */
const CORP_ACTION_THRESHOLD = 0.25;

/** Drops the last candle if it's still today's (possibly-forming) session —
 *  breakout/volume-average windows should be completed history, with the
 *  live quote as the comparison point, not baked into its own window. */
function historicalOnly(candles: Candle[]): Candle[] {
  if (candles.length === 0) return candles;
  const last = candles[candles.length - 1];
  return istTodayIso(last.time * 1000) === istTodayIso() ? candles.slice(0, -1) : candles;
}

function hasSuspectedCorporateAction(candles: Candle[]): boolean {
  const recent = candles.slice(-CORP_ACTION_LOOKBACK);
  for (let i = 1; i < recent.length; i++) {
    const prevClose = recent[i - 1].close;
    if (prevClose <= 0) continue;
    if (Math.abs(recent[i].close / prevClose - 1) > CORP_ACTION_THRESHOLD) return true;
  }
  return false;
}

function highestHigh(candles: Candle[], sessions: number): number {
  return candles.slice(-sessions).reduce((max, c) => Math.max(max, c.high), -Infinity);
}

function averageVolume(candles: Candle[], sessions: number): number {
  const window = candles.slice(-sessions);
  if (window.length === 0) return 0;
  return window.reduce((sum, c) => sum + c.volume, 0) / window.length;
}

export type ScoreTechnicalResult =
  | { ok: true; value: TechnicalResult }
  | { ok: false; reason: "insufficient_history" | "corporate_action" };

/**
 * Excluded (never a score of 0, so "excluded" and "evaluated but scored
 * zero" stay unambiguous) when there's insufficient history (<60 usable
 * bars — also naturally catches empty/failed candle fetches and recent
 * listings) or the corporate-action guard trips.
 */
export function scoreTechnical(rawCandles: Candle[], quote: Quote): ScoreTechnicalResult {
  if (rawCandles.length < MIN_HISTORY_BARS) {
    return { ok: false, reason: "insufficient_history" };
  }
  if (hasSuspectedCorporateAction(rawCandles)) {
    return { ok: false, reason: "corporate_action" };
  }
  const candles = historicalOnly(rawCandles);
  if (candles.length < MIN_HISTORY_BARS) {
    return { ok: false, reason: "insufficient_history" };
  }

  const reasons: string[] = [];
  const flags: string[] = [];
  let score = 0;

  // Breakout: 55d (strong) takes priority over 20d (base) — not stacked.
  const high55 = highestHigh(candles, 55);
  const high20 = highestHigh(candles, 20);
  if (Number.isFinite(high55) && quote.ltp > high55) {
    score += 2;
    reasons.push("Broke above its ~quarterly (55-day) high");
  } else if (Number.isFinite(high20) && quote.ltp > high20) {
    score += 1;
    reasons.push("Broke above its 20-day high");
  }

  // Volume surge vs 20-day average: 3x (strong) takes priority over 2x (base).
  const avgVol20 = averageVolume(candles, 20);
  const volRatio = avgVol20 > 0 ? quote.volume / avgVol20 : 0;
  if (avgVol20 > 0 && volRatio >= 3) {
    score += 2;
    reasons.push(`Volume surged to ${volRatio.toFixed(1)}x its 20-day average`);
  } else if (avgVol20 > 0 && volRatio >= 2) {
    score += 1;
    reasons.push(`Volume up to ${volRatio.toFixed(1)}x its 20-day average`);
  }

  // Trend alignment: price above a rising 20-day average, itself above a rising 50-day average.
  const sma20 = sma(candles, 20);
  const sma50 = sma(candles, 50);
  if (sma20.length >= 2 && sma50.length >= 2) {
    const lastSma20 = sma20[sma20.length - 1].value;
    const prevSma20 = sma20[sma20.length - 2].value;
    const lastSma50 = sma50[sma50.length - 1].value;
    const prevSma50 = sma50[sma50.length - 2].value;
    if (
      quote.ltp > lastSma20 &&
      lastSma20 > lastSma50 &&
      lastSma20 > prevSma20 &&
      lastSma50 > prevSma50
    ) {
      score += 1;
      reasons.push("Uptrend confirmed: price above rising 20/50-day averages");
    }
  }

  // RSI regime: for a momentum/breakout strategy specifically, running hot
  // (55-75) is normal and often a *good* sign, not a sell signal — only the
  // extreme >80 tail gets a small penalty. Deliberately NOT the naive
  // "RSI>70 = overbought, bad" reading, which would fight the strategy.
  const rsiSeries = rsi(candles, 14);
  if (rsiSeries.length > 0) {
    const lastRsi = rsiSeries[rsiSeries.length - 1].value;
    if (lastRsi >= 55 && lastRsi <= 75) {
      score += 1;
      reasons.push(`RSI at ${lastRsi.toFixed(0)} — strong momentum, not yet extreme`);
    } else if (lastRsi > 80) {
      score -= 1;
      reasons.push(`RSI at ${lastRsi.toFixed(0)} — extremely overbought, move may be stretched`);
      flags.push("high_volatility");
    }
  }

  // MACD confirmation: histogram positive and still rising vs the prior bar.
  const hist = macd(candles).histogram;
  if (hist.length >= 2) {
    const last = hist[hist.length - 1].value;
    const prev = hist[hist.length - 2].value;
    if (last > 0 && last > prev) {
      score += 1;
      reasons.push("MACD histogram rising — momentum accelerating");
    }
  }

  // 52-week high: soft signal, only fires with a full year of history —
  // absence never disqualifies, it just doesn't contribute a point.
  let high52w: number | undefined;
  if (candles.length >= 252) {
    const h52 = highestHigh(candles, 252);
    if (Number.isFinite(h52)) {
      high52w = h52;
      if (quote.ltp >= h52) {
        score += 2;
        reasons.push("Hit a fresh 52-week high today");
      } else if (quote.ltp >= h52 * 0.95) {
        score += 1;
        reasons.push("Trading within 5% of its 52-week high");
      }
    }
  } else {
    flags.push("thin_history");
  }

  const atrSeries = atr(candles, 14);
  const atr14 = atrSeries.length > 0 ? atrSeries[atrSeries.length - 1].value : 0;

  return { ok: true, value: { stageBScore: score, reasons, flags, atr14, high52w } };
}
