/**
 * MOCK DATA PROVIDER — wraps the in-browser simulator behind the
 * MarketDataProvider seam. Everything it serves is SIMULATED; the UI surfaces
 * this via `isSimulated` badges.
 */

import type {
  Candle,
  Instrument,
  ListedQuote,
  MarketDepth,
  Movers,
  OptionChain,
  Quote,
  Timeframe,
} from "../types";
import type {
  ConnectionState,
  MarketDataProvider,
  Unsubscribe,
} from "../provider";
import { MockEngine } from "./engine";
import { OPTION_UNDERLYING_TOKENS } from "./seed";

export class MockMarketDataProvider implements MarketDataProvider {
  readonly id = "mock";
  readonly displayName = "Simulated feed";
  readonly isSimulated = true;

  private engine = new MockEngine();
  private state: ConnectionState = "disconnected";
  private stateListeners = new Set<(s: ConnectionState) => void>();

  async connect(): Promise<void> {
    this.engine.start();
    this.setState("connected");
  }

  disconnect(): void {
    this.engine.stop();
    this.setState("disconnected");
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  onConnectionStateChange(cb: (s: ConnectionState) => void): Unsubscribe {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    for (const cb of this.stateListeners) cb(state);
  }

  async searchInstruments(query: string): Promise<Instrument[]> {
    return this.engine.searchInstruments(query);
  }

  async getInstrument(token: string): Promise<Instrument | undefined> {
    return this.engine.getInstrument(token);
  }

  async getIndices(): Promise<ListedQuote[]> {
    return this.engine.getIndices();
  }

  async getMovers(): Promise<Movers> {
    return this.engine.getMovers();
  }

  async getQuote(token: string): Promise<Quote> {
    const q = this.engine.getQuote(token);
    if (!q) throw new Error(`Unknown instrument: ${token}`);
    return q;
  }

  async getQuotes(tokens: string[]): Promise<Map<string, Quote>> {
    const out = new Map<string, Quote>();
    for (const token of tokens) {
      const q = this.engine.getQuote(token);
      if (q) out.set(token, q);
    }
    return out;
  }

  async getOptionUnderlyings(): Promise<Instrument[]> {
    const out: Instrument[] = [];
    for (const token of OPTION_UNDERLYING_TOKENS) {
      const inst = this.engine.getInstrument(token);
      if (inst) out.push(inst);
    }
    return out;
  }

  async getOptionExpiries(): Promise<string[]> {
    return this.engine.getExpiries();
  }

  async getOptionChain(
    underlyingToken: string,
    expiry: string,
  ): Promise<OptionChain> {
    const chain = this.engine.getOptionChain(underlyingToken, expiry);
    if (!chain) throw new Error(`No option chain for ${underlyingToken}`);
    return chain;
  }

  async getCandles(
    token: string,
    timeframe: Timeframe,
    maxBars = 500,
  ): Promise<Candle[]> {
    return this.engine.getCandles(token, timeframe, maxBars);
  }

  subscribeQuotes(tokens: string[], cb: (quote: Quote) => void): Unsubscribe {
    return this.engine.subscribeQuotes(tokens, cb);
  }

  subscribeDepth(token: string, cb: (depth: MarketDepth) => void): Unsubscribe {
    return this.engine.subscribeDepth(token, cb);
  }
}
