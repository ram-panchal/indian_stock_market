import type {
  Candle,
  Instrument,
  ListedQuote,
  MarketDepth,
  Movers,
  OptionChain,
  Quote,
  Timeframe,
} from "./types";

export type Unsubscribe = () => void;

export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

/**
 * The single seam between the app and any market-data source.
 *
 * Implementations:
 *  - MockMarketDataProvider — in-browser simulator (always available; clearly
 *    flagged via `isSimulated`).
 *  - AngelOneMarketDataProvider — real Angel One SmartAPI feed (market DATA
 *    only; this interface deliberately has no order-placement surface — paper
 *    trading is handled entirely by the local engine in src/lib/trading).
 */
export interface MarketDataProvider {
  readonly id: string;
  readonly displayName: string;
  /** True when quotes are simulated rather than a real exchange feed. */
  readonly isSimulated: boolean;

  connect(): Promise<void>;
  disconnect(): void;
  getConnectionState(): ConnectionState;
  onConnectionStateChange(cb: (state: ConnectionState) => void): Unsubscribe;

  searchInstruments(query: string): Promise<Instrument[]>;
  getInstrument(token: string): Promise<Instrument | undefined>;

  getIndices(): Promise<ListedQuote[]>;
  getMovers(): Promise<Movers>;
  getQuote(token: string): Promise<Quote>;
  /** Batch quote lookup — one round-trip for many tokens (missing tokens are
   *  simply absent from the map). Prefer this over N× getQuote in loops. */
  getQuotes(tokens: string[]): Promise<Map<string, Quote>>;

  getOptionUnderlyings(): Promise<Instrument[]>;
  getOptionExpiries(underlyingToken: string): Promise<string[]>;
  getOptionChain(underlyingToken: string, expiry: string): Promise<OptionChain>;

  getCandles(
    token: string,
    timeframe: Timeframe,
    maxBars?: number,
  ): Promise<Candle[]>;

  /** Streaming quotes. On the mock provider this is a simulated tick loop. */
  subscribeQuotes(tokens: string[], cb: (quote: Quote) => void): Unsubscribe;
  subscribeDepth(token: string, cb: (depth: MarketDepth) => void): Unsubscribe;
}

/** Thrown when a provider cannot start (e.g. missing credentials). */
export class ProviderUnavailableError extends Error {
  constructor(
    public readonly providerId: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
