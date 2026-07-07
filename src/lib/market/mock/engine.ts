/**
 * MOCK DATA — in-browser market simulator.
 *
 * Drives every quote/candle/depth/option value when the mock provider is
 * active. Prices follow a mean-reverting random walk anchored to the seed
 * universe; options are repriced with Black–Scholes off the simulated spot,
 * so the whole board moves coherently.
 *
 * Deliberate simplifications (all mock-only):
 *  - The feed ticks 24×7 (the real exchange clock is still shown in the UI).
 *  - One real second ≈ one market minute of price movement, so charts and
 *    P&L are lively during a demo.
 *  - Exchange holidays are not modelled; expiries are upcoming Thursdays.
 */

import type {
  Candle,
  Instrument,
  ListedQuote,
  MarketDepth,
  Movers,
  OptionChain,
  OptionChainRow,
  OptionQuote,
  OptionType,
  Quote,
  Timeframe,
} from "../types";
import { TIMEFRAME_SECONDS } from "../types";
import { blackScholes } from "./black-scholes";
import { gaussian, hashString, mulberry32, roundToTick, type Rng } from "./random";
import {
  EQUITIES,
  OPTION_UNDERLYINGS,
  UNIVERSE,
  optionToken,
  type OptionUnderlyingConfig,
  type SeedInstrument,
} from "./seed";

const TICK_MS = 900;
/** One real second of simulation ≈ this many seconds of market time. */
const SIM_SPEED = 60;
const TRADING_SECONDS_PER_YEAR = 252 * 6.25 * 3600;
const SNAPSHOT_KEY = "im.sim.snapshot.v1";
const MAX_1M_BARS = 6 * 375; // ~6 trading sessions

interface SimState {
  seed: SeedInstrument;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  /** Per-session drift so each name trends somewhere on a given day. */
  drift: number;
}

interface OptionStatic {
  instrument: Instrument;
  iv: number;
  prevClose: number;
  oi: number;
  oiChangeBase: number;
  volumeBase: number;
}

type QuoteListener = (quote: Quote) => void;
type DepthListener = (depth: MarketDepth) => void;

function istDayKey(epochMs: number): string {
  return new Date(epochMs + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Epoch seconds for `isoDate` 15:30 IST (option expiry cutoff). */
function expiryEpochSec(isoDate: string): number {
  return Date.parse(`${isoDate}T15:30:00+05:30`) / 1000;
}

export class MockEngine {
  private sims = new Map<string, SimState>();
  private optionStatics = new Map<string, OptionStatic>();
  private quoteListeners = new Map<string, Set<QuoteListener>>();
  private depthListeners = new Map<string, Set<DepthListener>>();
  private oneMinCache = new Map<string, Candle[]>();
  private dailyCache = new Map<string, Candle[]>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;

  constructor() {
    const dayRng = mulberry32(hashString(istDayKey(Date.now())));
    for (const seed of UNIVERSE) {
      const openJitter = 1 + (dayRng() - 0.5) * 0.008;
      const open = roundToTick(seed.basePrice * openJitter, seed.instrument.tickSize);
      this.sims.set(seed.instrument.token, {
        seed,
        price: open,
        open,
        high: open,
        low: open,
        volume: Math.round(seed.dayVolume * 0.25 * dayRng()),
        drift: (dayRng() - 0.5) * seed.sigma,
      });
    }
    this.restoreSnapshot();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ---------------------------------------------------------------- ticking

  private tick(): void {
    this.tickCount++;
    const now = Date.now();
    const dtYears = ((TICK_MS / 1000) * SIM_SPEED) / TRADING_SECONDS_PER_YEAR;

    for (const sim of this.sims.values()) {
      this.stepSim(sim, dtYears);
      const token = sim.seed.instrument.token;
      this.updateLiveCandle(token, sim.price, now);
      this.emitQuote(token, () => this.buildQuote(sim, now));
      this.emitDepth(token, now);
    }

    // Options are derived lazily — only priced while someone is listening.
    for (const token of this.quoteListeners.keys()) {
      if (!token.startsWith("OPT:")) continue;
      const q = this.getOptionQuote(token, now);
      if (!q) continue;
      this.updateLiveCandle(token, q.ltp, now);
      this.emitQuote(token, () => q);
      this.emitDepth(token, now);
    }

    if (this.tickCount % 12 === 0) this.persistSnapshot();
  }

  private stepSim(sim: SimState, dtYears: number): void {
    const { seed } = sim;
    const z = gaussian(Math.random);
    const meanReversion = -2.5 * (sim.price / seed.basePrice - 1);
    const ret =
      seed.sigma * Math.sqrt(dtYears) * z + (sim.drift + meanReversion) * dtYears;
    sim.price = roundToTick(
      Math.max(sim.price * (1 + ret), seed.instrument.tickSize),
      seed.instrument.tickSize,
    );
    sim.high = Math.max(sim.high, sim.price);
    sim.low = Math.min(sim.low, sim.price);
    if (seed.dayVolume > 0) {
      const perTick = (seed.dayVolume / 375) * ((TICK_MS / 1000) * SIM_SPEED / 60);
      sim.volume += Math.round(perTick * (0.4 + Math.random() * 1.2));
    }
  }

  private emitQuote(token: string, build: () => Quote): void {
    const set = this.quoteListeners.get(token);
    if (!set || set.size === 0) return;
    const quote = build();
    for (const cb of set) cb(quote);
  }

  private emitDepth(token: string, now: number): void {
    const set = this.depthListeners.get(token);
    if (!set || set.size === 0) return;
    const depth = this.buildDepth(token, now);
    if (!depth) return;
    for (const cb of set) cb(depth);
  }

  // ---------------------------------------------------------------- quotes

  private buildQuote(sim: SimState, now: number): Quote {
    const { seed } = sim;
    const tick = seed.instrument.tickSize;
    const spread = Math.max(tick, sim.price * 0.0004);
    return {
      token: seed.instrument.token,
      ltp: sim.price,
      change: sim.price - seed.basePrice,
      changePercent: ((sim.price - seed.basePrice) / seed.basePrice) * 100,
      open: sim.open,
      high: sim.high,
      low: sim.low,
      prevClose: seed.basePrice,
      volume: sim.volume,
      bid: roundToTick(sim.price - spread, tick),
      bidQty: 50 + Math.floor(Math.random() * 2000),
      ask: roundToTick(sim.price + spread, tick),
      askQty: 50 + Math.floor(Math.random() * 2000),
      updatedAt: now,
    };
  }

  getQuote(token: string, now = Date.now()): Quote | undefined {
    const sim = this.sims.get(token);
    if (sim) return this.buildQuote(sim, now);
    if (token.startsWith("OPT:")) return this.getOptionQuote(token, now);
    return undefined;
  }

  getInstrument(token: string): Instrument | undefined {
    const sim = this.sims.get(token);
    if (sim) return sim.seed.instrument;
    if (token.startsWith("OPT:")) return this.parseOptionToken(token)?.instrument;
    return undefined;
  }

  subscribeQuotes(tokens: string[], cb: QuoteListener): () => void {
    for (const token of tokens) {
      let set = this.quoteListeners.get(token);
      if (!set) {
        set = new Set();
        this.quoteListeners.set(token, set);
      }
      set.add(cb);
    }
    // Paint immediately instead of waiting for the next tick.
    queueMicrotask(() => {
      const now = Date.now();
      for (const token of tokens) {
        const q = this.getQuote(token, now);
        if (q) cb(q);
      }
    });
    return () => {
      for (const token of tokens) {
        const set = this.quoteListeners.get(token);
        set?.delete(cb);
        if (set && set.size === 0) this.quoteListeners.delete(token);
      }
    };
  }

  subscribeDepth(token: string, cb: DepthListener): () => void {
    let set = this.depthListeners.get(token);
    if (!set) {
      set = new Set();
      this.depthListeners.set(token, set);
    }
    set.add(cb);
    queueMicrotask(() => {
      const d = this.buildDepth(token, Date.now());
      if (d) cb(d);
    });
    return () => {
      const s = this.depthListeners.get(token);
      s?.delete(cb);
      if (s && s.size === 0) this.depthListeners.delete(token);
    };
  }

  private buildDepth(token: string, now: number): MarketDepth | undefined {
    const quote = this.getQuote(token, now);
    if (!quote) return undefined;
    const inst = this.getInstrument(token);
    const tick = inst?.tickSize ?? 0.05;
    const rng = Math.random;
    const level = (base: number, dir: 1 | -1, i: number) => ({
      price: roundToTick(base + dir * i * tick * (1 + Math.floor(rng() * 3)), tick),
      qty: Math.round((quote.bidQty + quote.askQty) * (0.3 + rng() * 1.5)),
      orders: 1 + Math.floor(rng() * 40),
    });
    const bids = Array.from({ length: 5 }, (_, i) => level(quote.bid, -1, i));
    const asks = Array.from({ length: 5 }, (_, i) => level(quote.ask, 1, i));
    return {
      token,
      bids,
      asks,
      totalBidQty: bids.reduce((s, l) => s + l.qty, 0),
      totalAskQty: asks.reduce((s, l) => s + l.qty, 0),
      updatedAt: now,
    };
  }

  // --------------------------------------------------------------- listings

  getIndices(): ListedQuote[] {
    const now = Date.now();
    return UNIVERSE.filter((s) => s.instrument.segment === "INDEX").map((s) => ({
      instrument: s.instrument,
      quote: this.buildQuote(this.sims.get(s.instrument.token)!, now),
    }));
  }

  getMovers(): Movers {
    const now = Date.now();
    const all: ListedQuote[] = EQUITIES.map((s) => ({
      instrument: s.instrument,
      quote: this.buildQuote(this.sims.get(s.instrument.token)!, now),
    }));
    const byChange = [...all].sort(
      (a, b) => b.quote.changePercent - a.quote.changePercent,
    );
    const byValue = [...all].sort(
      (a, b) => b.quote.ltp * b.quote.volume - a.quote.ltp * a.quote.volume,
    );
    return {
      gainers: byChange.filter((e) => e.quote.changePercent > 0).slice(0, 8),
      losers: byChange
        .filter((e) => e.quote.changePercent < 0)
        .reverse()
        .slice(0, 8),
      mostActive: byValue.slice(0, 8),
      advances: all.filter((e) => e.quote.change > 0).length,
      declines: all.filter((e) => e.quote.change < 0).length,
      unchanged: all.filter((e) => e.quote.change === 0).length,
    };
  }

  searchInstruments(query: string): Instrument[] {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const scored = UNIVERSE.map((s) => {
      const sym = s.instrument.symbol.toUpperCase();
      const name = s.instrument.name.toUpperCase();
      let score = -1;
      if (sym === q) score = 100;
      else if (sym.startsWith(q)) score = 80;
      else if (name.startsWith(q)) score = 60;
      else if (sym.includes(q)) score = 40;
      else if (name.includes(q)) score = 20;
      return { inst: s.instrument, score };
    })
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score || a.inst.symbol.localeCompare(b.inst.symbol));
    return scored.slice(0, 12).map((r) => r.inst);
  }

  // ---------------------------------------------------------------- options

  getExpiries(): string[] {
    // Next 5 weekly Thursdays from today (IST). Mock simplification — real
    // NSE expiry calendars come from the live provider's instrument master.
    const out: string[] = [];
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
    while (out.length < 5) {
      if (d.getUTCDay() === 4) out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }

  private parseOptionToken(
    token: string,
  ): { instrument: Instrument; cfg: OptionUnderlyingConfig } | undefined {
    const parts = token.split(":");
    if (parts.length !== 5 || parts[0] !== "OPT") return undefined;
    const [, underlyingSymbol, expiry, strikeStr, type] = parts;
    const strike = Number(strikeStr);
    const cfg = OPTION_UNDERLYINGS.find(
      (u) => u.token === `IDX:${underlyingSymbol}`,
    );
    if (!cfg || !Number.isFinite(strike) || (type !== "CE" && type !== "PE"))
      return undefined;
    const underlying = this.sims.get(cfg.token)?.seed.instrument;
    if (!underlying) return undefined;
    return {
      cfg,
      instrument: {
        token,
        symbol: `${underlyingSymbol} ${expiry.slice(5)} ${strike} ${type}`,
        name: `${underlying.name} ${strike} ${type}`,
        exchange: "NFO",
        segment: "OPTION",
        lotSize: cfg.lotSize,
        tickSize: 0.05,
        underlyingToken: cfg.token,
        expiry,
        strike,
        optionType: type as OptionType,
      },
    };
  }

  private getOptionStatic(token: string): OptionStatic | undefined {
    const cached = this.optionStatics.get(token);
    if (cached) return cached;
    const parsed = this.parseOptionToken(token);
    if (!parsed) return undefined;
    const { instrument, cfg } = parsed;
    const underlyingSeed = this.sims.get(cfg.token)!.seed;
    const s0 = underlyingSeed.basePrice;
    const strike = instrument.strike!;
    const rng = mulberry32(hashString(`${token}|${istDayKey(Date.now())}`));

    // Volatility smile anchored to the seed spot, with a put-side skew.
    const x = (strike - s0) / s0;
    const smile = 1 + 2.2 * x * x * (x < 0 ? 220 : 140);
    const iv = Math.min(Math.max(cfg.baseIV * smile + (rng() - 0.5) * 0.01, 0.07), 0.6);

    const tYears = Math.max(
      (expiryEpochSec(instrument.expiry!) - Date.now() / 1000) / (365 * 86400),
      0.0005,
    );
    const prevClose = roundToTick(
      blackScholes(instrument.optionType!, s0, strike, tYears + 1 / 365, iv).price,
      0.05,
    );

    // OI bell around ATM; round-number strikes attract extra interest.
    const atm0 = Math.round(s0 / cfg.strikeStep) * cfg.strikeStep;
    const bell = Math.exp(-(((strike - atm0) / (cfg.strikeStep * 11)) ** 2));
    const roundBoost = strike % (cfg.strikeStep * 10) === 0 ? 1.45 : 1;
    const oi =
      Math.round((cfg.maxOI * bell * roundBoost * (0.5 + rng())) / cfg.lotSize) *
      cfg.lotSize;
    const stat: OptionStatic = {
      instrument,
      iv,
      prevClose,
      oi,
      oiChangeBase: Math.round(oi * (rng() * 0.4 - 0.16)),
      volumeBase: Math.round(oi * (0.25 + rng() * 0.9)),
    };
    this.optionStatics.set(token, stat);
    return stat;
  }

  getOptionQuote(token: string, now = Date.now()): OptionQuote | undefined {
    const stat = this.getOptionStatic(token);
    if (!stat) return undefined;
    const inst = stat.instrument;
    const underlyingSim = this.sims.get(inst.underlyingToken!);
    if (!underlyingSim) return undefined;
    const tYears = Math.max(
      (expiryEpochSec(inst.expiry!) - now / 1000) / (365 * 86400),
      0.0005,
    );
    const greeks = blackScholes(
      inst.optionType!,
      underlyingSim.price,
      inst.strike!,
      tYears,
      stat.iv,
    );
    const ltp = roundToTick(greeks.price, 0.05);
    const spread = Math.max(0.05, ltp * 0.004);
    const oiChange = stat.oiChangeBase + Math.round((Math.random() - 0.5) * inst.lotSize * 4);
    return {
      token,
      instrument: inst,
      ltp,
      change: ltp - stat.prevClose,
      changePercent:
        stat.prevClose > 0 ? ((ltp - stat.prevClose) / stat.prevClose) * 100 : 0,
      open: stat.prevClose,
      high: Math.max(ltp, stat.prevClose),
      low: Math.min(ltp, stat.prevClose),
      prevClose: stat.prevClose,
      volume: stat.volumeBase + this.tickCount * Math.ceil(inst.lotSize / 5),
      bid: roundToTick(Math.max(ltp - spread, 0.05), 0.05),
      bidQty: inst.lotSize * (1 + Math.floor(Math.random() * 20)),
      ask: roundToTick(ltp + spread, 0.05),
      askQty: inst.lotSize * (1 + Math.floor(Math.random() * 20)),
      oi: stat.oi,
      oiChange,
      iv: stat.iv * 100,
      delta: greeks.delta,
      gamma: greeks.gamma,
      theta: greeks.theta,
      vega: greeks.vega,
      updatedAt: now,
    };
  }

  getOptionChain(underlyingToken: string, expiry: string): OptionChain | undefined {
    const cfg = OPTION_UNDERLYINGS.find((u) => u.token === underlyingToken);
    const sim = this.sims.get(underlyingToken);
    if (!cfg || !sim) return undefined;
    const now = Date.now();
    const underlyingSymbol = sim.seed.instrument.symbol;
    const atm = Math.round(sim.price / cfg.strikeStep) * cfg.strikeStep;
    const rows: OptionChainRow[] = [];
    for (let i = -20; i <= 20; i++) {
      const strike = atm + i * cfg.strikeStep;
      rows.push({
        strike,
        ce: this.getOptionQuote(optionToken(underlyingSymbol, expiry, strike, "CE"), now),
        pe: this.getOptionQuote(optionToken(underlyingSymbol, expiry, strike, "PE"), now),
      });
    }
    return {
      underlying: sim.seed.instrument,
      spot: sim.price,
      expiry,
      rows,
      updatedAt: now,
    };
  }

  // ---------------------------------------------------------------- candles

  getCandles(token: string, timeframe: Timeframe, maxBars = 500): Candle[] {
    if (timeframe === "1d") return this.getDailyCandles(token, maxBars);
    const oneMin = this.getOneMinCandles(token);
    const bucketSec = TIMEFRAME_SECONDS[timeframe];
    if (timeframe === "1m") return oneMin.slice(-maxBars);
    const out: Candle[] = [];
    for (const bar of oneMin) {
      const bucket = Math.floor(bar.time / bucketSec) * bucketSec;
      const last = out[out.length - 1];
      if (last && last.time === bucket) {
        last.high = Math.max(last.high, bar.high);
        last.low = Math.min(last.low, bar.low);
        last.close = bar.close;
        last.volume += bar.volume;
      } else {
        out.push({ ...bar, time: bucket });
      }
    }
    return out.slice(-maxBars);
  }

  private getOneMinCandles(token: string): Candle[] {
    let cache = this.oneMinCache.get(token);
    if (cache) return cache;
    const quote = this.getQuote(token);
    if (!quote) return [];
    const inst = this.getInstrument(token)!;
    const sigma = token.startsWith("OPT:")
      ? 1.6
      : (this.sims.get(token)?.seed.sigma ?? 0.2);
    cache = generateHistory(
      token,
      quote.ltp,
      sigma,
      inst.tickSize,
      this.sessionMinuteTimes(MAX_1M_BARS),
      this.sims.get(token)?.seed.dayVolume ?? 0,
    );
    this.oneMinCache.set(token, cache);
    return cache;
  }

  private getDailyCandles(token: string, maxBars: number): Candle[] {
    let cache = this.dailyCache.get(token);
    const quote = this.getQuote(token);
    if (!quote) return [];
    if (!cache) {
      const inst = this.getInstrument(token)!;
      const sigma = token.startsWith("OPT:")
        ? 1.6
        : (this.sims.get(token)?.seed.sigma ?? 0.2);
      cache = generateHistory(
        token,
        quote.prevClose,
        sigma,
        inst.tickSize,
        this.pastSessionDays(260),
        (this.sims.get(token)?.seed.dayVolume ?? 0) * 375,
      );
      this.dailyCache.set(token, cache);
    }
    // Today's forming bar comes straight from the live session state.
    const todayStart = Math.floor(Date.now() / 86400000) * 86400;
    const live: Candle = {
      time: todayStart,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      close: quote.ltp,
      volume: quote.volume,
    };
    return [...cache.filter((c) => c.time < todayStart), live].slice(-maxBars);
  }

  private updateLiveCandle(token: string, price: number, nowMs: number): void {
    const cache = this.oneMinCache.get(token);
    if (!cache || cache.length === 0) return;
    const bucket = Math.floor(nowMs / 60000) * 60;
    const last = cache[cache.length - 1];
    if (last.time >= bucket) {
      last.close = price;
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.volume += Math.round(Math.random() * 500);
    } else {
      cache.push({
        time: bucket,
        open: last.close,
        high: Math.max(last.close, price),
        low: Math.min(last.close, price),
        close: price,
        volume: Math.round(Math.random() * 500),
      });
      if (cache.length > MAX_1M_BARS + 400) cache.splice(0, 400);
    }
  }

  /** Ascending epoch-second starts of the last `n` 1-minute bars, restricted
   *  to NSE session hours (09:15–15:30 IST, Mon–Fri), ending at "now" or the
   *  most recent session close. */
  private sessionMinuteTimes(n: number): number[] {
    const out: number[] = [];
    const IST = 5.5 * 3600 * 1000;
    let cursor = new Date(Date.now() + IST);
    const minutes = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
    while (out.length < n) {
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6) {
        const dayStartUtcMs =
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()) -
          IST;
        const endMin = Math.min(minutes(cursor), 15 * 60 + 30);
        for (let m = endMin - 1; m >= 9 * 60 + 15 && out.length < n; m--) {
          out.push(Math.floor((dayStartUtcMs + m * 60000) / 1000));
        }
      }
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()) -
          1,
      );
      cursor.setUTCHours(23, 59, 0, 0);
    }
    return out.reverse();
  }

  private pastSessionDays(n: number): number[] {
    const out: number[] = [];
    const d = new Date();
    while (out.length < n) {
      d.setUTCDate(d.getUTCDate() - 1);
      const day = d.getUTCDay();
      if (day === 0 || day === 6) continue;
      out.push(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000,
      );
    }
    return out.reverse();
  }

  // ------------------------------------------------------------- snapshots

  /** Keep intraday state across reloads within the same IST day so paper
   *  P&L doesn't jump when the page refreshes. */
  private persistSnapshot(): void {
    try {
      const prices: Record<string, [number, number, number, number, number]> = {};
      for (const [token, sim] of this.sims) {
        prices[token] = [sim.price, sim.open, sim.high, sim.low, sim.volume];
      }
      sessionStorage.setItem(
        SNAPSHOT_KEY,
        JSON.stringify({ day: istDayKey(Date.now()), prices }),
      );
    } catch {
      // Storage full/unavailable — continuity is best-effort only.
    }
  }

  private restoreSnapshot(): void {
    try {
      const raw = sessionStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as {
        day: string;
        prices: Record<string, [number, number, number, number, number]>;
      };
      if (snap.day !== istDayKey(Date.now())) return;
      for (const [token, [price, open, high, low, volume]] of Object.entries(
        snap.prices,
      )) {
        const sim = this.sims.get(token);
        if (!sim || !Number.isFinite(price)) continue;
        sim.price = price;
        sim.open = open;
        sim.high = high;
        sim.low = low;
        sim.volume = volume;
      }
    } catch {
      // Corrupt snapshot — start fresh.
    }
  }
}

/** Backward random walk anchored at `anchorPrice` on the last bar, then
 *  replayed forward into coherent OHLC bars. Seeded per token so a session
 *  keeps consistent history across chart re-opens. */
function generateHistory(
  token: string,
  anchorPrice: number,
  sigma: number,
  tickSize: number,
  times: number[],
  refVolume: number,
): Candle[] {
  const n = times.length;
  if (n === 0) return [];
  const rng: Rng = mulberry32(hashString(`${token}|history`));
  const perBarSigma = sigma / Math.sqrt(252 * 375);
  const isDaily = times.length > 1 && times[1] - times[0] >= 86400;
  const s = isDaily ? sigma / Math.sqrt(252) : perBarSigma;

  const closes = new Array<number>(n);
  closes[n - 1] = anchorPrice;
  for (let i = n - 2; i >= 0; i--) {
    const ret = s * gaussian(rng) - 0.00002;
    closes[i] = Math.max(closes[i + 1] / (1 + ret), tickSize);
  }
  const bars: Candle[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const open = i === 0 ? closes[0] * (1 + (rng() - 0.5) * s) : closes[i - 1];
    const close = closes[i];
    const wick = Math.abs(close - open) * 0.6 + close * s * 0.7 * rng();
    bars[i] = {
      time: times[i],
      open: roundToTick(open, tickSize),
      high: roundToTick(Math.max(open, close) + wick * rng(), tickSize),
      low: roundToTick(Math.max(Math.min(open, close) - wick * rng(), tickSize), tickSize),
      close: roundToTick(close, tickSize),
      volume: Math.round(((refVolume || 100000) / (isDaily ? 1 : 375)) * (0.3 + rng() * 1.4)),
    };
  }
  return bars;
}
