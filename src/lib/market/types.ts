/**
 * Provider-agnostic market domain types.
 *
 * Every data source (mock simulator today, Angel One SmartAPI later) maps its
 * wire formats into these types. UI and business logic import ONLY from here —
 * never from a concrete provider.
 */

export type Exchange = "NSE" | "BSE" | "NFO";

export type Segment = "INDEX" | "EQUITY" | "OPTION";

export type OptionType = "CE" | "PE";

export interface Instrument {
  /** Provider-agnostic unique id. Maps to Angel One's symboltoken for the real feed. */
  token: string;
  /** Trading symbol, e.g. "RELIANCE", "NIFTY". */
  symbol: string;
  name: string;
  exchange: Exchange;
  segment: Segment;
  /** 1 for equities/indices; contract lot size for derivatives. */
  lotSize: number;
  tickSize: number;
  /** Option-only fields. */
  underlyingToken?: string;
  /** ISO date, e.g. "2026-07-30". */
  expiry?: string;
  strike?: number;
  optionType?: OptionType;
}

export interface Quote {
  token: string;
  ltp: number;
  /** Absolute change vs previous close. */
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  /** Previous close. */
  prevClose: number;
  volume: number;
  bid: number;
  bidQty: number;
  ask: number;
  askQty: number;
  /** Open interest — derivatives only. */
  oi?: number;
  /** Epoch ms of last update. */
  updatedAt: number;
}

export interface DepthLevel {
  price: number;
  qty: number;
  orders: number;
}

export interface MarketDepth {
  token: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  totalBidQty: number;
  totalAskQty: number;
  updatedAt: number;
}

/** Candle time is epoch SECONDS (UTC) — matches lightweight-charts' UTCTimestamp. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "1d";

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "1d": 86400,
};

export interface OptionQuote extends Quote {
  instrument: Instrument;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  oi: number;
  oiChange: number;
}

export interface OptionChainRow {
  strike: number;
  ce?: OptionQuote;
  pe?: OptionQuote;
}

export interface OptionChain {
  underlying: Instrument;
  spot: number;
  expiry: string;
  rows: OptionChainRow[];
  updatedAt: number;
}

export type MarketStatus = "pre-open" | "open" | "closed";

export interface ListedQuote {
  instrument: Instrument;
  quote: Quote;
}

export interface Movers {
  gainers: ListedQuote[];
  losers: ListedQuote[];
  /** Ranked by traded value (ltp × volume). */
  mostActive: ListedQuote[];
  advances: number;
  declines: number;
  unchanged: number;
}
