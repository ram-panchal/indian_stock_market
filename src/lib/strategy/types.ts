/**
 * On-disk shapes for the daily swing-pick strategy feature. Shared by the
 * standalone scripts (scripts/daily-scan.ts, scripts/commit-decision.ts) and
 * the read-only API routes (src/app/api/strategy/*) — nobody else should
 * define these shapes independently.
 */

export type Conviction = "Low" | "Medium" | "High";

export type RiskFlag =
  | "high_volatility"
  | "lower_liquidity"
  | "earnings_due_in_window"
  | "no_specific_catalyst"
  | "broad_market_weak"
  | "thin_history"
  | "other";

export interface ShortlistCandidate {
  token: string;
  symbol: string;
  name: string;
  ltp: number;
  changePercent: number;
  tradedValue: number;
  stageAScore: number;
  /** Absent when excluded before/at Stage B (insufficient history, corporate action, etc). */
  stageBScore?: number;
  reasons: string[];
  flags: string[];
  alreadyHeld: boolean;
  atr14?: number;
  high52w?: number;
}

export type MarketStatusAtRun = "pre-open" | "open" | "closed";

export interface ShortlistSnapshot {
  version: 1;
  dateIso: string;
  runAt: number;
  marketStatusAtRun: MarketStatusAtRun;
  /** Fewer than ~20 symbols cleared the liquidity floor — proxy for "this
   *  looks like a dead session" since holidays aren't modelled anywhere in
   *  this app. Not a hard block, just an honest flag. */
  likelyNoTradingToday: boolean;
  universeSize: number;
  quotesFetched: number;
  quotesMissing: number;
  stageASurvivors: number;
  stageBAttempted: number;
  stageBExcludedCorporateAction: number;
  stageBInsufficientHistory: number;
  /** Stage B ranked, best first. Includes already-held names (flagged), for transparency. */
  ranked: ShortlistCandidate[];
  /** ranked[0] excluding alreadyHeld, or null if nothing qualifies. */
  topPick: ShortlistCandidate | null;
  /** Next few candidates after topPick, excluding alreadyHeld. */
  runnerUps: ShortlistCandidate[];
  warnings: string[];
}

export type PickAction =
  | "entered"
  | "no_pick"
  | "skipped_duplicate_run"
  | "skipped_no_affordable_candidate"
  | "skipped_insufficient_cash";

export interface PickLogEntry {
  version: 1;
  runId: string;
  dateIso: string;
  decidedAt: number;
  action: PickAction;
  symbol?: string;
  token?: string;
  conviction?: Conviction;
  riskFlags?: RiskFlag[];
  /** Claude's free-text writeup — may include Hindi. */
  reasoning: string;
  newsRefs?: { title: string; url: string }[];
  quantSummary: { stageAScore: number; stageBScore: number; reasons: string[] } | null;
  entry?: {
    price: number;
    qty: number;
    positionValue: number;
    stopLossPrice: number;
    targetPrice: number;
    maxHoldUntilDate: string;
  };
  /** Set when action === "entered" — foreign key into positions.json. */
  positionId?: string;
}

export type PositionStatus =
  | "OPEN"
  | "CLOSED_TARGET"
  | "CLOSED_STOPLOSS"
  | "CLOSED_TIME"
  | "CLOSED_MANUAL"
  | "STALE_NO_QUOTE";

export type CloseReason = "target" | "stop_loss" | "time_stop" | "manual" | "stale_no_quote";

export interface StrategyPosition {
  id: string;
  token: string;
  symbol: string;
  /** Foreign key -> PickLogEntry.runId that opened this position. */
  pickRunId: string;
  entryTradeId: string;
  entryOrderId: string;
  entryPrice: number;
  entryAt: number;
  qty: number;
  stopLossPrice: number;
  targetPrice: number;
  maxHoldUntilDate: string;
  status: PositionStatus;
  /** Consecutive daily-scan runs in a row with no fetchable quote for this token. */
  consecutiveQuoteFailures: number;
  closedAt?: number;
  closeTradeId?: string;
  closePrice?: number;
  closeReason?: CloseReason;
}

/** Written by Claude (the daily-pick skill), consumed by scripts/commit-decision.ts. */
export interface PendingDecision {
  dateIso: string;
  action: "enter" | "no_pick";
  symbol?: string;
  conviction?: Conviction;
  riskFlags?: RiskFlag[];
  reasoning: string;
  newsRefs?: { title: string; url: string }[];
}

export interface RunLogEntry {
  runId: string;
  kind: "scan" | "commit";
  startedAt: number;
  finishedAt?: number;
  ok: boolean;
  error?: string;
  counts?: Record<string, number>;
}

export interface StrategyLedgerHeader {
  version: 1;
  startingBalance: number;
  createdAt: number;
}

export interface TrackRecordSummary {
  totalPicks: number;
  entered: number;
  skipped: number;
  wins: number;
  losses: number;
  openCount: number;
  winRatePct: number;
}
