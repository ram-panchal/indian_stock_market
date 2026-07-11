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

/**
 * Delay before the first (and any catch-up) fetch. Subscriptions arrive as a
 * burst of separate microtasks — each dashboard cell registers its token behind
 * `handle.ready.then(...)`. Firing the fetch on the very first subscription
 * would poll a single token and leave the rest waiting a full interval (up to
 * 15s when the market is closed). A short debounce lets the whole burst
 * register so ONE fetch covers every subscribed token.
 */
const KICK_DELAY_MS = 60;

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
  /** Epoch ms the pending timer is set to fire; Infinity when none scheduled. */
  private timerAt = Infinity;
  private loopActive = false;
  private inFlight = false;

  constructor(
    private readonly fetcher: Fetcher,
    private readonly status: StatusFn,
  ) {}

  subscribeQuotes(tokens: string[], cb: (q: Quote) => void): () => void {
    let fresh = false;
    for (const token of tokens) {
      let set = this.quoteSubs.get(token);
      if (!set) {
        this.quoteSubs.set(token, (set = new Set()));
        fresh = true;
      }
      set.add(cb);
    }
    this.ensureRunning(fresh);
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
    const fresh = !set;
    if (!set) this.depthSubs.set(token, (set = new Set()));
    set.add(cb);
    this.ensureRunning(fresh);
    return () => {
      const s = this.depthSubs.get(token);
      s?.delete(cb);
      if (s && s.size === 0) this.depthSubs.delete(token);
    };
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.timerAt = Infinity;
    this.loopActive = false;
  }

  private ensureRunning(hasNewToken: boolean): void {
    const wasActive = this.loopActive;
    this.loopActive = true;
    // Kick a near-term fetch when the loop first starts OR a brand-new token
    // appears, so the initial burst — and later additions — fill promptly
    // instead of waiting up to a full (15s, when closed) interval.
    if (!wasActive || hasNewToken) this.scheduleTick(KICK_DELAY_MS);
  }

  /**
   * Schedule the next tick `delay` ms out, but only ever move it EARLIER — a
   * pending sooner fetch is never pushed back. This debounces a burst of new
   * subscriptions into a single fetch and lets late additions pre-empt a long
   * closed-market interval.
   */
  private scheduleTick(delay: number): void {
    const at = Date.now() + delay;
    if (this.timer && at >= this.timerAt) return;
    if (this.timer) clearTimeout(this.timer);
    this.timerAt = at;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timerAt = Infinity;
      void this.tick();
    }, delay);
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
    // A fetch is already running (a kick fired mid-flight). Don't pile on;
    // retry shortly so any tokens added during the flight are picked up soon.
    if (this.inFlight) {
      this.scheduleTick(KICK_DELAY_MS);
      return;
    }
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
    const interval = this.status() === "closed" ? CLOSED_INTERVAL_MS : OPEN_INTERVAL_MS;
    this.scheduleTick(interval);
  }
}
