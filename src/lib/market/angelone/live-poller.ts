"use client";

/**
 * Consolidated live poller for the Angel One provider.
 *
 * One timer drives every quote/depth subscription. Each cycle it batch-fetches
 * the union of all subscribed tokens and fans results out to per-token
 * listeners — mirroring the mock engine's tick model so price-store.ts and
 * useQuote work unchanged. Cadence follows the real market clock: fast while
 * open/pre-open, slow when closed (no ticks to miss). It never invents data;
 * a failed fetch simply skips that cycle and retries on the next.
 */

import type { MarketDepth, MarketStatus, Quote } from "../types";

const OPEN_INTERVAL_MS = 1000;
const CLOSED_INTERVAL_MS = 15000;

interface QuoteResponse {
  quotes: Quote[];
  depth: Record<string, MarketDepth>;
}

type Fetcher = (tokens: string[]) => Promise<QuoteResponse>;
type StatusFn = () => MarketStatus;

export class LivePoller {
  private quoteSubs = new Map<string, Set<(q: Quote) => void>>();
  private depthSubs = new Map<string, Set<(d: MarketDepth) => void>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loopActive = false;
  private inFlight = false;

  constructor(
    private readonly fetcher: Fetcher,
    private readonly status: StatusFn,
  ) {}

  subscribeQuotes(tokens: string[], cb: (q: Quote) => void): () => void {
    for (const token of tokens) {
      let set = this.quoteSubs.get(token);
      if (!set) this.quoteSubs.set(token, (set = new Set()));
      set.add(cb);
    }
    this.ensureRunning();
    return () => {
      for (const token of tokens) {
        const set = this.quoteSubs.get(token);
        set?.delete(cb);
        if (set && set.size === 0) this.quoteSubs.delete(token);
      }
    };
  }

  subscribeDepth(token: string, cb: (d: MarketDepth) => void): () => void {
    let set = this.depthSubs.get(token);
    if (!set) this.depthSubs.set(token, (set = new Set()));
    set.add(cb);
    this.ensureRunning();
    return () => {
      const s = this.depthSubs.get(token);
      s?.delete(cb);
      if (s && s.size === 0) this.depthSubs.delete(token);
    };
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.loopActive = false;
  }

  private ensureRunning(): void {
    if (this.loopActive) return;
    this.loopActive = true;
    void this.tick();
  }

  private currentTokens(): string[] {
    return [...new Set([...this.quoteSubs.keys(), ...this.depthSubs.keys()])];
  }

  private async tick(): Promise<void> {
    const tokens = this.currentTokens();
    if (tokens.length === 0) {
      this.loopActive = false;
      return;
    }
    if (!this.inFlight) {
      this.inFlight = true;
      try {
        const { quotes, depth } = await this.fetcher(tokens);
        for (const q of quotes) {
          const set = this.quoteSubs.get(q.token);
          if (set) for (const cb of set) cb(q);
        }
        for (const [token, d] of Object.entries(depth)) {
          const set = this.depthSubs.get(token);
          if (set) for (const cb of set) cb(d);
        }
      } catch {
        // Transient failure — retry next cycle rather than fabricate data.
      } finally {
        this.inFlight = false;
      }
    }
    const interval = this.status() === "closed" ? CLOSED_INTERVAL_MS : OPEN_INTERVAL_MS;
    this.timer = setTimeout(() => void this.tick(), interval);
  }
}
