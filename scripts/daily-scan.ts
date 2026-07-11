/**
 * Mechanical daily scan — no news judgment, never opens a new position.
 * Invoke via `npm run daily-scan` (never a raw `npx tsx` from some other
 * cwd — store.ts resolves data/strategy/ off process.cwd()).
 *
 *   1. Manage existing open positions (close on stop/target/time-stop).
 *   2. Stage A: full NSE universe -> batch quotes -> liquidity filter -> score.
 *   3. Stage B: historical candles for the Stage A shortlist -> technical score.
 *   4. Write data/strategy/shortlist/<date>.json.
 *
 * Claude's news research (the daily-pick skill) reads that file and decides;
 * scripts/commit-decision.ts is the only thing that ever opens a position.
 */

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env.local") });

import type { Quote } from "@/lib/market/types";
import { getMarketStatus } from "@/lib/market/status";
import { istTodayIso } from "@/lib/strategy/dates";
import {
  MIN_TRADED_VALUE_DEFAULT,
  STAGE_A_SHORTLIST_SIZE,
  filterLiquid,
  scoreQuoteMomentum,
} from "@/lib/strategy/liquidity";
import { equityInstrumentFor, getFullEquityUniverse } from "@/lib/strategy/universe";
import { fetchCandlesThrottled, fetchQuotesThrottled } from "@/lib/strategy/throttle";
import { scoreTechnical } from "@/lib/strategy/technical";
import { closeReasonToStatus, evaluateOpenPosition } from "@/lib/strategy/positions";
import type { ShortlistCandidate, ShortlistSnapshot } from "@/lib/strategy/types";
import {
  appendOrder,
  appendRun,
  appendTrade,
  loadPositions,
  newId,
  writePositions,
  writeShortlist,
} from "@/lib/strategy/store";
import type { PaperOrder, PaperTrade } from "@/lib/trading/types";

const LIKELY_NO_TRADING_THRESHOLD = 20;

function log(msg: string): void {
  console.log(`[daily-scan] ${msg}`);
}

/** Books a SELL trade against an existing position, mirroring the shape the
 *  real PaperTradingEngine would produce for the same fill. */
function closePosition(
  pos: ReturnType<typeof loadPositions>[number],
  closePrice: number,
  closeReason: NonNullable<ReturnType<typeof evaluateOpenPosition>["closeReason"]>,
): void {
  const instrument = equityInstrumentFor(pos.token, pos.symbol, pos.symbol);
  const now = Date.now();
  const order: PaperOrder = {
    id: newId(),
    createdAt: now,
    instrument,
    side: "SELL",
    type: "MARKET",
    qty: pos.qty,
    status: "FILLED",
    fillPrice: closePrice,
    filledAt: now,
  };
  const trade: PaperTrade = {
    id: newId(),
    orderId: order.id,
    instrument,
    side: "SELL",
    qty: pos.qty,
    price: closePrice,
    at: now,
  };
  appendOrder(order);
  appendTrade(trade);
  pos.status = closeReasonToStatus(closeReason);
  pos.closedAt = now;
  pos.closeTradeId = trade.id;
  pos.closePrice = closePrice;
  pos.closeReason = closeReason;
  pos.consecutiveQuoteFailures = 0;
}

async function manageOpenPositions(todayIso: string): Promise<void> {
  const positions = loadPositions();
  const open = positions.filter((p) => p.status === "OPEN");
  if (open.length === 0) {
    log("No open positions to manage.");
    return;
  }

  log(`Managing ${open.length} open position(s)...`);
  const quotes = await fetchQuotesThrottled(open.map((p) => p.token));

  for (const pos of open) {
    const quote: Quote | undefined = quotes.get(pos.token)?.quote;
    const evaluation = evaluateOpenPosition(pos, quote, todayIso);

    if (evaluation.action === "close") {
      const closePrice = evaluation.closePrice!;
      closePosition(pos, closePrice, evaluation.closeReason!);
      log(`  ${pos.symbol}: CLOSED (${evaluation.closeReason}) at ₹${closePrice.toFixed(2)}`);
    } else if (evaluation.action === "mark_stale") {
      pos.status = "STALE_NO_QUOTE";
      log(`  ${pos.symbol}: no fetchable quote for ${pos.consecutiveQuoteFailures + 1} runs in a row — marked STALE_NO_QUOTE, needs manual review.`);
    } else if (!quote) {
      pos.consecutiveQuoteFailures += 1;
      log(`  ${pos.symbol}: no quote this run (${pos.consecutiveQuoteFailures} consecutive) — holding.`);
    } else {
      pos.consecutiveQuoteFailures = 0;
    }
  }

  writePositions(positions);
}

async function runStageAAndB(todayIso: string, alreadyHeldTokens: Set<string>): Promise<ShortlistSnapshot> {
  log("Fetching full NSE equity universe...");
  const universe = await getFullEquityUniverse();
  log(`Universe size: ${universe.length}`);

  log("Stage A: batch-fetching quotes (throttled)...");
  const quotes = await fetchQuotesThrottled(universe.map((u) => u.token), {
    onProgress: (done, total) => {
      if (done === total || done % 5 === 0) log(`  quote batches: ${done}/${total}`);
    },
  });

  const { candidates, quotesFetched, quotesMissing } = filterLiquid(
    universe,
    quotes,
    alreadyHeldTokens,
    MIN_TRADED_VALUE_DEFAULT,
  );
  const scored = scoreQuoteMomentum(candidates, quotes);
  log(`Stage A survivors (liquid, positive momentum): ${scored.length}`);

  const likelyNoTradingToday = scored.length < LIKELY_NO_TRADING_THRESHOLD;
  const warnings: string[] = [];
  if (likelyNoTradingToday) {
    warnings.push(
      `Only ${scored.length} symbols cleared the liquidity floor — this looks like a dead/non-trading session (weekend, holiday, or feed issue), not a normal day.`,
    );
  }
  if (quotesFetched > 0 && quotesMissing / (quotesFetched + quotesMissing) > 0.3) {
    warnings.push(
      `${quotesMissing} of ${quotesFetched + quotesMissing} universe symbols had no fetchable quote this run — unusually high; check Angel One connectivity.`,
    );
  }

  const stageATop = scored.slice(0, STAGE_A_SHORTLIST_SIZE);

  log(`Stage B: fetching historical candles for top ${stageATop.length} candidates (throttled)...`);
  const candlesByToken = await fetchCandlesThrottled(
    stageATop.map((c) => c.token),
    "1d",
    {
      maxBars: 270,
      onProgress: (done, total) => {
        if (done === total || done % 20 === 0) log(`  candle fetches: ${done}/${total}`);
      },
    },
  );

  let stageBExcludedCorporateAction = 0;
  let stageBInsufficientHistory = 0;
  const finalCandidates: ShortlistCandidate[] = [];

  for (const candidate of stageATop) {
    const candles = candlesByToken.get(candidate.token) ?? [];
    const quote = quotes.get(candidate.token)?.quote;
    if (!quote) {
      // Shouldn't happen (it passed Stage A using this same quotes map), but
      // defensively skip rather than crash.
      stageBInsufficientHistory++;
      finalCandidates.push(candidate);
      continue;
    }
    const result = scoreTechnical(candles, quote);
    if (!result.ok) {
      if (result.reason === "corporate_action") stageBExcludedCorporateAction++;
      else stageBInsufficientHistory++;
      finalCandidates.push({ ...candidate, flags: [...candidate.flags, result.reason] });
      continue;
    }
    finalCandidates.push({
      ...candidate,
      stageBScore: result.value.stageBScore,
      reasons: result.value.reasons,
      flags: [...candidate.flags, ...result.value.flags],
      atr14: result.value.atr14,
      high52w: result.value.high52w,
    });
  }

  // Scored candidates first (best first), excluded ones after (Stage-A order preserved).
  const ranked = [...finalCandidates].sort((a, b) => {
    if (a.stageBScore !== undefined && b.stageBScore !== undefined) return b.stageBScore - a.stageBScore;
    if (a.stageBScore !== undefined) return -1;
    if (b.stageBScore !== undefined) return 1;
    return 0;
  });

  const eligible = ranked.filter((c) => !c.alreadyHeld && c.stageBScore !== undefined);
  const topPick = eligible[0] ?? null;
  const runnerUps = eligible.slice(1, 8);

  log(
    topPick
      ? `Top pick candidate: ${topPick.symbol} (stageBScore ${topPick.stageBScore})`
      : "No eligible candidate today (nothing cleared Stage B, or everything eligible is already held).",
  );

  return {
    version: 1,
    dateIso: todayIso,
    runAt: Date.now(),
    marketStatusAtRun: getMarketStatus(),
    likelyNoTradingToday,
    universeSize: universe.length,
    quotesFetched,
    quotesMissing,
    stageASurvivors: scored.length,
    stageBAttempted: stageATop.length,
    stageBExcludedCorporateAction,
    stageBInsufficientHistory,
    ranked,
    topPick,
    runnerUps,
    warnings,
  };
}

async function main(): Promise<void> {
  const runId = newId();
  const startedAt = Date.now();
  const todayIso = istTodayIso(startedAt);
  log(`Run ${runId} starting for ${todayIso} (market status: ${getMarketStatus()})`);

  await manageOpenPositions(todayIso);

  const positionsAfterManagement = loadPositions();
  const alreadyHeldTokens = new Set(
    positionsAfterManagement.filter((p) => p.status === "OPEN").map((p) => p.token),
  );

  const snapshot = await runStageAAndB(todayIso, alreadyHeldTokens);
  writeShortlist(snapshot);
  log(`Wrote shortlist for ${todayIso}.`);

  appendRun({
    runId,
    kind: "scan",
    startedAt,
    finishedAt: Date.now(),
    ok: true,
    counts: {
      universeSize: snapshot.universeSize,
      stageASurvivors: snapshot.stageASurvivors,
      stageBAttempted: snapshot.stageBAttempted,
    },
  });
}

main()
  .then(() => {
    log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[daily-scan] FAILED:", err);
    appendRun({
      runId: newId(),
      kind: "scan",
      startedAt: Date.now(),
      finishedAt: Date.now(),
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
