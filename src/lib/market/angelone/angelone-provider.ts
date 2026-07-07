"use client";

/**
 * ANGEL ONE (SmartAPI) — live market-DATA provider.
 *
 * ── Safety boundary ────────────────────────────────────────────────────────
 * DATA ONLY. This class implements MarketDataProvider and nothing else — there
 * is no order-placement code here or anywhere in the repo. All trading is paper
 * trading in src/lib/trading. Do not add order APIs.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Transport: the browser never holds Angel credentials or tokens. Every call
 * goes through our own /api/angelone/* routes, which log in server-side and
 * proxy Angel's REST market-data endpoints.
 *
 * Streaming: SmartStream 2.0 requires auth *headers* a browser WebSocket can't
 * set, so live updates use a single consolidated poller against the batch
 * getMarketData endpoint — ~1s while the market is open, slowed right down when
 * closed (a closed market has no new ticks; values simply hold at last trade).
 * Nothing is simulated: if the feed is unavailable, cells stop updating rather
 * than showing invented movement.
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
import {
  ProviderUnavailableError,
  type ConnectionState,
  type MarketDataProvider,
  type Unsubscribe,
} from "../provider";
import { getMarketStatus } from "../status";
import {
  EQUITY_INSTRUMENTS,
  EQUITY_TOKENS,
  INDEX_INSTRUMENTS,
  INDEX_TOKENS,
  OPTION_UNDERLYING_INSTRUMENTS,
  equityInstrument,
  indexInstrument,
  INDICES,
  EQUITIES,
} from "./universe";
import { LivePoller } from "./live-poller";

interface QuoteResponse {
  quotes: Quote[];
  depth: Record<string, MarketDepth>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const reason = await res
      .json()
      .then((b) => (b as { reason?: string }).reason)
      .catch(() => undefined);
    throw new Error(reason ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function fetchQuotes(tokens: string[]): Promise<QuoteResponse> {
  if (tokens.length === 0) return { quotes: [], depth: {} };
  return postJson<QuoteResponse>("/api/angelone/quote", { tokens });
}

export class AngelOneMarketDataProvider implements MarketDataProvider {
  readonly id = "angelone";
  readonly displayName = "Angel One (live)";
  readonly isSimulated = false;

  private state: ConnectionState = "disconnected";
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private poller = new LivePoller(fetchQuotes, getMarketStatus);
  private equityByToken = new Map(EQUITY_INSTRUMENTS.map((i) => [i.token, i]));

  async connect(): Promise<void> {
    this.setState("connecting");
    let body: { ok: boolean; reason?: string };
    try {
      const res = await fetch("/api/angelone/session", { method: "POST" });
      body = (await res.json()) as { ok: boolean; reason?: string };
      if (!res.ok || !body.ok) {
        this.setState("error");
        throw new ProviderUnavailableError(this.id, body.reason ?? "Angel One session unavailable.");
      }
    } catch (err) {
      this.setState("error");
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError(this.id, "Could not reach the Angel One session endpoint.");
    }
    this.setState("connected");
  }

  disconnect(): void {
    this.poller.stop();
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

  // ------------------------------------------------------------- instruments

  async searchInstruments(query: string): Promise<Instrument[]> {
    const res = await fetch(`/api/angelone/instruments?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const body = (await res.json()) as { instruments?: Instrument[] };
    return body.instruments ?? [];
  }

  async getInstrument(token: string): Promise<Instrument | undefined> {
    if (token.startsWith("IDX:")) {
      const def = INDICES.find((i) => i.symbol === token.slice(4));
      return def ? indexInstrument(def) : undefined;
    }
    if (token.startsWith("EQ:")) {
      const cached = this.equityByToken.get(token);
      if (cached) return cached;
      const def = EQUITIES.find((e) => e.symbol === token.slice(3));
      return def ? equityInstrument(def) : undefined;
    }
    if (token.startsWith("OPT:")) {
      const res = await fetch(`/api/angelone/instruments?optionToken=${encodeURIComponent(token)}`);
      const body = (await res.json()) as { instrument: Instrument | null };
      return body.instrument ?? undefined;
    }
    return undefined;
  }

  // ------------------------------------------------------------------ quotes

  async getIndices(): Promise<ListedQuote[]> {
    const { quotes } = await fetchQuotes(INDEX_TOKENS);
    const byToken = new Map(quotes.map((q) => [q.token, q]));
    return INDEX_INSTRUMENTS.flatMap((instrument) => {
      const quote = byToken.get(instrument.token);
      return quote ? [{ instrument, quote }] : [];
    });
  }

  async getMovers(): Promise<Movers> {
    const { quotes } = await fetchQuotes(EQUITY_TOKENS);
    const byToken = new Map(quotes.map((q) => [q.token, q]));
    const all: ListedQuote[] = EQUITY_INSTRUMENTS.flatMap((instrument) => {
      const quote = byToken.get(instrument.token);
      return quote ? [{ instrument, quote }] : [];
    });
    const byChange = [...all].sort((a, b) => b.quote.changePercent - a.quote.changePercent);
    const byValue = [...all].sort(
      (a, b) => b.quote.ltp * b.quote.volume - a.quote.ltp * a.quote.volume,
    );
    return {
      gainers: byChange.filter((e) => e.quote.changePercent > 0).slice(0, 8),
      losers: byChange.filter((e) => e.quote.changePercent < 0).reverse().slice(0, 8),
      mostActive: byValue.slice(0, 8),
      advances: all.filter((e) => e.quote.change > 0).length,
      declines: all.filter((e) => e.quote.change < 0).length,
      unchanged: all.filter((e) => e.quote.change === 0).length,
    };
  }

  async getQuote(token: string): Promise<Quote> {
    const { quotes } = await fetchQuotes([token]);
    const quote = quotes.find((q) => q.token === token);
    if (!quote) throw new Error(`No live quote for ${token}`);
    return quote;
  }

  // ----------------------------------------------------------------- options

  async getOptionUnderlyings(): Promise<Instrument[]> {
    return OPTION_UNDERLYING_INSTRUMENTS;
  }

  async getOptionExpiries(underlyingToken: string): Promise<string[]> {
    const symbol = underlyingToken.startsWith("IDX:") ? underlyingToken.slice(4) : underlyingToken;
    const res = await fetch(`/api/angelone/instruments?expiries=${encodeURIComponent(symbol)}`);
    const body = (await res.json()) as { expiries?: string[] };
    return body.expiries ?? [];
  }

  async getOptionChain(underlyingToken: string, expiry: string): Promise<OptionChain> {
    const { chain } = await postJson<{ chain: OptionChain }>("/api/angelone/option-chain", {
      underlyingToken,
      expiry,
    });
    return chain;
  }

  // ----------------------------------------------------------------- candles

  async getCandles(token: string, timeframe: Timeframe, maxBars = 500): Promise<Candle[]> {
    const { candles } = await postJson<{ candles: Candle[] }>("/api/angelone/candles", {
      token,
      timeframe,
      maxBars,
    });
    return candles;
  }

  // --------------------------------------------------------------- streaming

  subscribeQuotes(tokens: string[], cb: (quote: Quote) => void): Unsubscribe {
    return this.poller.subscribeQuotes(tokens, cb);
  }

  subscribeDepth(token: string, cb: (depth: MarketDepth) => void): Unsubscribe {
    return this.poller.subscribeDepth(token, cb);
  }
}
