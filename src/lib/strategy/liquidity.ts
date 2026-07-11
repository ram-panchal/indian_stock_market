/**
 * Stage A — cheap, mechanical screening using only already-fetched quote
 * data (no candles yet). No price floor at all, deliberately, to honor
 * "any price range" — illiquid names are filtered economically instead, by
 * traded value.
 */

import type { QuoteWithDepth } from "@/lib/market/angelone/angel-data";
import type { ShortlistCandidate } from "./types";
import type { UniverseSymbol } from "./universe";

/** Same formula this repo's own getMovers() (angelone-provider.ts) already
 *  uses to rank "most active" — proven house convention, not a new idea. */
export function tradedValue(ltp: number, volume: number): number {
  return ltp * volume;
}

/** ₹1 crore. A stated default, not a backtested truth. Cross-checked against
 *  position sizing: a ~₹1L paper position against a ₹1 Cr trading day is a
 *  realistic ~1% of that day's turnover — comfortably fillable. */
export const MIN_TRADED_VALUE_DEFAULT = 1_00_00_000;

/** How many Stage A survivors advance to the (expensive) Stage B candle
 *  fetch + technical scoring. */
export const STAGE_A_SHORTLIST_SIZE = 120;

export interface LiquidityFilterResult {
  candidates: ShortlistCandidate[];
  quotesFetched: number;
  quotesMissing: number;
}

/**
 * Drops: missing quotes · non-positive ltp/volume · non-positive change%
 * (long-only screener, consistent with the existing paper engine's equity-
 * short restriction) · likely circuit-locked names (zero ask depth while
 * trading at the day's high — no real sellers left, booking a fill there
 * would be dishonestly optimistic) · below the traded-value liquidity floor.
 */
export function filterLiquid(
  universe: UniverseSymbol[],
  quotes: Map<string, QuoteWithDepth>,
  alreadyHeldTokens: ReadonlySet<string>,
  minTradedValue: number = MIN_TRADED_VALUE_DEFAULT,
): LiquidityFilterResult {
  let quotesMissing = 0;
  const candidates: ShortlistCandidate[] = [];

  for (const u of universe) {
    const qd = quotes.get(u.token);
    if (!qd) {
      quotesMissing++;
      continue;
    }
    const { quote } = qd;
    if (quote.ltp <= 0 || quote.volume <= 0) continue;
    if (quote.changePercent <= 0) continue;

    const likelyCircuitLocked = quote.askQty === 0 && quote.ltp === quote.high;
    if (likelyCircuitLocked) continue;

    const tv = tradedValue(quote.ltp, quote.volume);
    if (tv < minTradedValue) continue;

    candidates.push({
      token: u.token,
      symbol: u.symbol,
      name: u.name,
      ltp: quote.ltp,
      changePercent: quote.changePercent,
      tradedValue: tv,
      stageAScore: 0, // filled in by scoreQuoteMomentum
      reasons: [],
      flags: [],
      alreadyHeld: alreadyHeldTokens.has(u.token),
    });
  }

  return { candidates, quotesFetched: quotes.size, quotesMissing };
}

const WEIGHT_CHANGE_PERCENT = 0.45;
const WEIGHT_TRADED_VALUE = 0.2;
const WEIGHT_DAY_HIGH_PROXIMITY = 0.35;

/** Percentile rank of `value` within `values` (0..1, higher = better). */
function percentileRank(values: number[], value: number): number {
  if (values.length <= 1) return 1;
  let countBelow = 0;
  for (const v of values) if (v < value) countBelow++;
  return countBelow / (values.length - 1);
}

/**
 * Composite score via percentile rank — not a raw weighted sum — so unlike
 * units (a % change, rupees of traded value, a 0..1 proximity ratio) don't
 * distort each other by scale. Weights (0.45 / 0.20 / 0.35) are a starting
 * heuristic, not backtested; worth revisiting once enough real runs
 * accumulate to say something evidence-based.
 */
export function scoreQuoteMomentum(
  candidates: ShortlistCandidate[],
  quotes: Map<string, QuoteWithDepth>,
): ShortlistCandidate[] {
  const proximityOf = (c: ShortlistCandidate): number => {
    const high = quotes.get(c.token)?.quote.high ?? c.ltp;
    return high > 0 ? 1 - (high - c.ltp) / high : 0;
  };

  const changePercents = candidates.map((c) => c.changePercent);
  const tradedValues = candidates.map((c) => c.tradedValue);
  const proximities = candidates.map(proximityOf);

  return candidates
    .map((c, i) => ({
      ...c,
      stageAScore:
        WEIGHT_CHANGE_PERCENT * percentileRank(changePercents, c.changePercent) +
        WEIGHT_TRADED_VALUE * percentileRank(tradedValues, c.tradedValue) +
        WEIGHT_DAY_HIGH_PROXIMITY * percentileRank(proximities, proximities[i]),
    }))
    .sort((a, b) => b.stageAScore - a.stageAScore);
}
