/**
 * Validates and commits Claude's daily-pick decision. This is the ONLY place
 * a new strategy position is ever opened — and it only opens one for a
 * symbol that actually appears, eligible, in that date's mechanical
 * shortlist (scripts/daily-scan.ts's output). Claude's news judgment can
 * select/downgrade/veto among mechanically-screened candidates; it can never
 * invent one — this check is what makes that structural, not just a
 * SKILL.md instruction Claude could forget.
 *
 * Deliberately does NOT auto-substitute a different symbol when the chosen
 * one is unaffordable or otherwise refused: the PendingDecision's reasoning
 * text describes one specific stock, and silently swapping in a different,
 * un-vetted one would make that reasoning inaccurate. On any refusal, the
 * daily-pick skill should either write a new, specific PendingDecision for a
 * different candidate it actually researched, or report "no pick today."
 *
 * Usage: npm run commit-decision  (reads data/strategy/tmp/pending-decision-<today>.json)
 *    or: npm run commit-decision -- /absolute/or/relative/path.json  (for testing)
 */

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env.local") });

import { computeCash } from "@/lib/trading/derive";
import type { PaperOrder, PaperTrade } from "@/lib/trading/types";
import { istTodayIso } from "@/lib/strategy/dates";
import { computeStopTargetTimeStop } from "@/lib/strategy/positions";
import { computePositionSize } from "@/lib/strategy/sizing";
import { equityInstrumentFor } from "@/lib/strategy/universe";
import { fetchQuotesThrottled } from "@/lib/strategy/throttle";
import type { PendingDecision, PickLogEntry, StrategyPosition } from "@/lib/strategy/types";
import {
  appendOrder,
  appendPick,
  appendRun,
  appendTrade,
  dataRoot,
  loadPaperState,
  loadPositions,
  loadShortlist,
  newId,
  writePositions,
} from "@/lib/strategy/store";

function log(msg: string): void {
  console.log(`[commit-decision] ${msg}`);
}

function fail(runId: string, startedAt: number, message: string): never {
  console.error(`[commit-decision] REFUSED: ${message}`);
  appendRun({ runId, kind: "commit", startedAt, finishedAt: Date.now(), ok: false, error: message });
  process.exit(1);
}

function readDecision(): PendingDecision {
  const override = process.argv[2];
  let raw: string;
  if (override) {
    raw = fs.readFileSync(path.resolve(process.cwd(), override), "utf8");
  } else {
    const todayIso = istTodayIso();
    const full = path.join(dataRoot(), "tmp", `pending-decision-${todayIso}.json`);
    raw = fs.readFileSync(full, "utf8");
  }
  return JSON.parse(raw) as PendingDecision;
}

async function main(): Promise<void> {
  const runId = newId();
  const startedAt = Date.now();

  let decision: PendingDecision;
  try {
    decision = readDecision();
  } catch (err) {
    fail(runId, startedAt, `Could not read the pending decision file: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!decision.dateIso || (decision.action !== "enter" && decision.action !== "no_pick")) {
    fail(runId, startedAt, "Pending decision is missing dateIso or has an invalid action.");
  }

  if (decision.action === "no_pick") {
    const entry: PickLogEntry = {
      version: 1,
      runId,
      dateIso: decision.dateIso,
      decidedAt: Date.now(),
      action: "no_pick",
      reasoning: decision.reasoning,
      newsRefs: decision.newsRefs,
      quantSummary: null,
    };
    appendPick(entry);
    appendRun({ runId, kind: "commit", startedAt, finishedAt: Date.now(), ok: true, counts: { action: 1 } });
    log(`Logged "no pick" for ${decision.dateIso}.`);
    return;
  }

  // action === "enter" from here on.
  const symbol = decision.symbol?.trim().toUpperCase();
  if (!symbol) fail(runId, startedAt, 'action "enter" requires a symbol.');

  const shortlist = loadShortlist(decision.dateIso);
  if (!shortlist) {
    fail(runId, startedAt, `No shortlist found for ${decision.dateIso} — run "npm run daily-scan" first.`);
  }

  const candidate = shortlist.ranked.find(
    (c) => c.symbol.toUpperCase() === symbol && c.stageBScore !== undefined && !c.alreadyHeld,
  );
  if (!candidate) {
    fail(
      runId,
      startedAt,
      `"${symbol}" does not appear as an eligible candidate in the ${decision.dateIso} shortlist (either not present, excluded at Stage B, or already held). Refusing to invent a pick outside the mechanical screen.`,
    );
  }

  // Duplicate-entry-today guard, checked two independent ways.
  const positions = loadPositions();
  const alreadyEnteredToday = positions.some(
    (p) => istTodayIso(p.entryAt) === decision.dateIso,
  );
  if (alreadyEnteredToday) {
    const entry: PickLogEntry = {
      version: 1,
      runId,
      dateIso: decision.dateIso,
      decidedAt: Date.now(),
      action: "skipped_duplicate_run",
      symbol,
      token: candidate.token,
      reasoning: decision.reasoning,
      quantSummary: { stageAScore: candidate.stageAScore, stageBScore: candidate.stageBScore!, reasons: candidate.reasons },
    };
    appendPick(entry);
    fail(runId, startedAt, `A position was already entered for ${decision.dateIso} — refusing a second entry the same day.`);
  }

  // Size the position off total mark-to-market equity, not just free cash.
  const paperState = loadPaperState();
  const cash = computeCash(paperState);
  const openPositions = positions.filter((p) => p.status === "OPEN");
  const openQuotes =
    openPositions.length > 0 ? await fetchQuotesThrottled(openPositions.map((p) => p.token)) : new Map();
  const openMarketValue = openPositions.reduce((sum, p) => {
    const ltp = openQuotes.get(p.token)?.quote.ltp ?? p.entryPrice;
    return sum + p.qty * ltp;
  }, 0);
  const totalEquity = cash + openMarketValue;

  // Fresh live quote for the fill — some time may have passed since the scan ran.
  const freshQuotes = await fetchQuotesThrottled([candidate.token]);
  const freshQuote = freshQuotes.get(candidate.token)?.quote;
  const entryPrice = freshQuote?.ask || freshQuote?.ltp || candidate.ltp;

  const sizing = computePositionSize(totalEquity, cash, entryPrice);
  if (!sizing) {
    const entry: PickLogEntry = {
      version: 1,
      runId,
      dateIso: decision.dateIso,
      decidedAt: Date.now(),
      action: cash < entryPrice ? "skipped_insufficient_cash" : "skipped_no_affordable_candidate",
      symbol,
      token: candidate.token,
      reasoning: decision.reasoning,
      quantSummary: { stageAScore: candidate.stageAScore, stageBScore: candidate.stageBScore!, reasons: candidate.reasons },
    };
    appendPick(entry);
    fail(
      runId,
      startedAt,
      `${symbol} at ~₹${entryPrice.toFixed(2)}/share doesn't fit the position budget (cash ₹${cash.toFixed(0)}, total equity ₹${totalEquity.toFixed(0)}). Not substituting a different, un-vetted symbol — pick another researched candidate explicitly if one fits.`,
    );
  }

  const { stopLossPrice, targetPrice, maxHoldUntilDate } = computeStopTargetTimeStop(
    entryPrice,
    candidate.atr14 ?? 0,
    decision.dateIso,
  );

  const instrument = equityInstrumentFor(candidate.token, candidate.symbol, candidate.name);
  const now = Date.now();
  const order: PaperOrder = {
    id: newId(),
    createdAt: now,
    instrument,
    side: "BUY",
    type: "MARKET",
    qty: sizing.qty,
    status: "FILLED",
    fillPrice: entryPrice,
    filledAt: now,
  };
  const trade: PaperTrade = {
    id: newId(),
    orderId: order.id,
    instrument,
    side: "BUY",
    qty: sizing.qty,
    price: entryPrice,
    at: now,
  };
  appendOrder(order);
  appendTrade(trade);

  const position: StrategyPosition = {
    id: newId(),
    token: candidate.token,
    symbol: candidate.symbol,
    pickRunId: runId,
    entryTradeId: trade.id,
    entryOrderId: order.id,
    entryPrice,
    entryAt: now,
    qty: sizing.qty,
    stopLossPrice,
    targetPrice,
    maxHoldUntilDate,
    status: "OPEN",
    consecutiveQuoteFailures: 0,
  };
  writePositions([...positions, position]);

  const pickEntry: PickLogEntry = {
    version: 1,
    runId,
    dateIso: decision.dateIso,
    decidedAt: Date.now(),
    action: "entered",
    symbol,
    token: candidate.token,
    conviction: decision.conviction,
    riskFlags: decision.riskFlags,
    reasoning: decision.reasoning,
    newsRefs: decision.newsRefs,
    quantSummary: { stageAScore: candidate.stageAScore, stageBScore: candidate.stageBScore!, reasons: candidate.reasons },
    entry: {
      price: entryPrice,
      qty: sizing.qty,
      positionValue: sizing.positionValue,
      stopLossPrice,
      targetPrice,
      maxHoldUntilDate,
    },
    positionId: position.id,
  };
  appendPick(pickEntry);
  appendRun({ runId, kind: "commit", startedAt, finishedAt: Date.now(), ok: true, counts: { qty: sizing.qty } });

  log(
    `Entered ${symbol}: ${sizing.qty} shares @ ₹${entryPrice.toFixed(2)} (₹${sizing.positionValue.toFixed(0)}), ` +
      `stop ₹${stopLossPrice.toFixed(2)}, target ₹${targetPrice.toFixed(2)}, time-stop ${maxHoldUntilDate}.`,
  );
}

main().catch((err) => {
  console.error("[commit-decision] FAILED:", err);
  appendRun({
    runId: newId(),
    kind: "commit",
    startedAt: Date.now(),
    finishedAt: Date.now(),
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
