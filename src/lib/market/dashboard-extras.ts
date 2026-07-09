/**
 * MOCK DATA — dashboard extras.
 *
 * Everything here is either derived from the active provider's quotes
 * (sector performance, 52-week lists) or simulated with a per-IST-day seed
 * (FII/DII flows, global index moves, breadth statistics, events calendar)
 * so values stay stable across reloads but change day to day. None of this
 * is real market data.
 */

import type { Candle, ListedQuote, Movers } from "./types";
import type { MarketDataProvider } from "./provider";
import { gaussian, hashString, mulberry32 } from "./mock/random";
import { EQ, EQUITIES, IDX } from "./mock/seed";

export const NIFTY_TOKEN = IDX("NIFTY");
export const BANKNIFTY_TOKEN = IDX("BANKNIFTY");
export const FINNIFTY_TOKEN = IDX("FINNIFTY");

const IST_MS = 5.5 * 3600 * 1000;

export function istDayKey(epochMs = Date.now()): string {
  return new Date(epochMs + IST_MS).toISOString().slice(0, 10);
}

function dayRng(scope: string): () => number {
  return mulberry32(hashString(`extras|${scope}|${istDayKey()}`));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

// ------------------------------------------------------------ global indices

export interface GlobalIndexQuote {
  symbol: string;
  name: string;
  flag: string;
  value: number;
  changePercent: number;
}

const GLOBAL_SEEDS = [
  { symbol: "DJI", name: "Dow Jones", flag: "🇺🇸", base: 44_950 },
  { symbol: "IXIC", name: "Nasdaq", flag: "🇺🇸", base: 20_630 },
  { symbol: "SPX", name: "S&P 500", flag: "🇺🇸", base: 6_280 },
  { symbol: "FTSE", name: "FTSE 100", flag: "🇬🇧", base: 8_920 },
  { symbol: "N225", name: "Nikkei 225", flag: "🇯🇵", base: 39_980 },
  { symbol: "DAX", name: "DAX", flag: "🇩🇪", base: 24_160 },
] as const;

export function getGlobalMarkets(): GlobalIndexQuote[] {
  return GLOBAL_SEEDS.map((seed) => {
    const rng = dayRng(`global|${seed.symbol}`);
    const changePercent = clamp(gaussian(rng) * 0.55, -1.8, 1.8);
    return {
      symbol: seed.symbol,
      name: seed.name,
      flag: seed.flag,
      value: seed.base * (1 + changePercent / 100),
      changePercent,
    };
  });
}

// ------------------------------------------------------------- FII/DII flows

export type FlowPeriod = "day" | "week" | "month" | "year";

export interface FlowPoint {
  label: string;
  /** Net flow in ₹ Crore; negative = selling. */
  fii: number;
  dii: number;
}

const FLOW_BASE: Record<FlowPeriod, number> = {
  day: 1_800,
  week: 4_200,
  month: 9_500,
  year: 68_000,
};

const istShortDate = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
});

function flowPoint(period: FlowPeriod, key: string, label: string): FlowPoint {
  const rng = mulberry32(hashString(`extras|flow|${period}|${key}`));
  const base = FLOW_BASE[period];
  // FII skew slightly negative, DII counter-flow biased positive — mirrors
  // the familiar "FII sells, DII absorbs" narrative in the simulator.
  const fii = (gaussian(rng) - 0.2) * base;
  const dii = (gaussian(rng) + 0.4) * base * 0.75 - fii * 0.35;
  return { label, fii: Math.round(fii * 100) / 100, dii: Math.round(dii * 100) / 100 };
}

export function getFiiDii(period: FlowPeriod): FlowPoint[] {
  const out: FlowPoint[] = [];
  const cursor = new Date(Date.now() + IST_MS);
  if (period === "day") {
    while (out.length < 12) {
      if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) {
        const iso = cursor.toISOString().slice(0, 10);
        out.push(flowPoint(period, iso, istShortDate.format(cursor)));
      }
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  } else if (period === "week") {
    cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay() + 1); // Monday
    while (out.length < 12) {
      const iso = cursor.toISOString().slice(0, 10);
      out.push(flowPoint(period, iso, istShortDate.format(cursor)));
      cursor.setUTCDate(cursor.getUTCDate() - 7);
    }
  } else if (period === "month") {
    while (out.length < 12) {
      const key = cursor.toISOString().slice(0, 7);
      out.push(
        flowPoint(period, key, cursor.toLocaleString("en-IN", { month: "short", timeZone: "UTC" })),
      );
      cursor.setUTCMonth(cursor.getUTCMonth() - 1);
    }
  } else {
    let year = cursor.getUTCFullYear();
    while (out.length < 8) {
      out.push(flowPoint(period, String(year), String(year)));
      year--;
    }
  }
  return out.reverse();
}

// ---------------------------------------------------------- market statistics

export interface MarketStats {
  /** Total market cap in ₹ Lakh Crore. */
  marketCapLcr: number;
  new52WHigh: number;
  new52WLow: number;
  avgPe: number;
  vix: number;
  vixChangePercent: number;
}

export function getMarketStats(
  advances: number,
  declines: number,
  niftyChangePercent: number,
): MarketStats {
  const rng = dayRng("stats");
  const avgPe = 21.6 + rng() * 1.8;
  const vixBase = 11 + rng() * 4;
  const breadthRatio = advances + declines > 0 ? advances / (advances + declines) : 0.5;
  return {
    marketCapLcr: 450.8 * (1 + niftyChangePercent / 100),
    new52WHigh: Math.round(40 + breadthRatio * 160 + rng() * 30),
    new52WLow: Math.round(150 - breadthRatio * 130 + rng() * 25),
    avgPe,
    // VIX rises when the index sells off; small seeded wander otherwise.
    vix: vixBase + Math.max(0, -niftyChangePercent) * 1.4 + Math.abs(niftyChangePercent) * 0.3,
    vixChangePercent: gaussian(rng) * 2.2 - niftyChangePercent * 1.6,
  };
}

// --------------------------------------------------------- sector performance

export interface SectorPerf {
  name: string;
  changePercent: number;
}

const SECTOR_MAP: { name: string; symbols: string[] }[] = [
  { name: "Nifty IT", symbols: ["INFY", "TCS", "WIPRO", "HCLTECH", "TECHM"] },
  { name: "Nifty Bank", symbols: ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK", "INDUSINDBK"] },
  { name: "Nifty Auto", symbols: ["MARUTI", "M&M", "TMPV", "EICHERMOT", "HEROMOTOCO"] },
  { name: "Nifty FMCG", symbols: ["HINDUNILVR", "ITC", "NESTLEIND"] },
  { name: "Nifty Pharma", symbols: ["SUNPHARMA", "DRREDDY", "CIPLA"] },
  { name: "Nifty Metal", symbols: ["TATASTEEL", "JSWSTEEL", "COALINDIA"] },
  { name: "Nifty Energy", symbols: ["RELIANCE", "ONGC", "NTPC", "POWERGRID"] },
];

export async function getSectorPerformance(
  provider: MarketDataProvider,
): Promise<SectorPerf[]> {
  // One batched quote call for every sector constituent — not N× getQuote,
  // which would flood the live provider with per-symbol round-trips.
  const tokens = [...new Set(SECTOR_MAP.flatMap((s) => s.symbols.map(EQ)))];
  const quotes = await provider.getQuotes(tokens);
  const out: SectorPerf[] = [];
  for (const sector of SECTOR_MAP) {
    const valid = sector.symbols
      .map((s) => quotes.get(EQ(s)))
      .filter((q) => q !== undefined);
    if (valid.length === 0) continue;
    out.push({
      name: sector.name,
      changePercent:
        valid.reduce((sum, q) => sum + q.changePercent, 0) / valid.length,
    });
  }
  return out.sort((a, b) => b.changePercent - a.changePercent);
}

// ------------------------------------------------------------- full listings

export async function getAllListedQuotes(
  provider: MarketDataProvider,
): Promise<ListedQuote[]> {
  // Single batched round-trip for the whole curated universe.
  const quotes = await provider.getQuotes(
    EQUITIES.map((seed) => seed.instrument.token),
  );
  return EQUITIES.flatMap((seed) => {
    const quote = quotes.get(seed.instrument.token);
    return quote ? [{ instrument: seed.instrument, quote }] : [];
  });
}

// ------------------------------------------------------------- 52-week lists

interface Extremes {
  hi: number;
  lo: number;
}

/** 52-week extremes come from daily candles; computed once per page session.
 *  This is fine on the simulator — a real provider would serve these from
 *  its own statistics endpoint rather than 40 candle requests. */
let extremesPromise: Promise<Map<string, Extremes>> | null = null;

function get52WExtremes(
  provider: MarketDataProvider,
): Promise<Map<string, Extremes>> {
  if (!extremesPromise) {
    extremesPromise = (async () => {
      const map = new Map<string, Extremes>();
      await Promise.all(
        EQUITIES.map(async (seed) => {
          try {
            const candles = await provider.getCandles(seed.instrument.token, "1d", 260);
            if (candles.length === 0) return;
            map.set(seed.instrument.token, {
              hi: Math.max(...candles.map((c) => c.high)),
              lo: Math.min(...candles.map((c) => c.low)),
            });
          } catch {
            // Skip instruments without history.
          }
        }),
      );
      return map;
    })();
  }
  return extremesPromise;
}

export interface Week52Lists {
  /** Sorted by proximity to the 52-week high/low (closest first). */
  high: ListedQuote[];
  low: ListedQuote[];
}

export async function get52WLists(
  provider: MarketDataProvider,
): Promise<Week52Lists> {
  const [extremes, all] = await Promise.all([
    get52WExtremes(provider),
    getAllListedQuotes(provider),
  ]);
  const scored = all
    .map((entry) => {
      const ex = extremes.get(entry.instrument.token);
      if (!ex) return null;
      return {
        entry,
        distHi: (ex.hi - entry.quote.ltp) / ex.hi,
        distLo: (entry.quote.ltp - ex.lo) / ex.lo,
      };
    })
    .filter((r) => r !== null);
  return {
    high: [...scored].sort((a, b) => a.distHi - b.distHi).map((r) => r.entry),
    low: [...scored].sort((a, b) => a.distLo - b.distLo).map((r) => r.entry),
  };
}

// ------------------------------------------------------------ session candles

/** Restrict a candle series to its most recent IST session day. */
export function lastSessionCandles(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const lastDay = istDayKey(candles[candles.length - 1].time * 1000);
  return candles.filter((c) => istDayKey(c.time * 1000) === lastDay);
}

// ------------------------------------------------------------ breadth series

export interface BreadthSeries {
  adv: number[];
  dec: number[];
}

/**
 * Synthesise a plausible intraday advances/declines curve from the index's
 * session path, calibrated so the last point matches the live breadth counts.
 */
export function synthBreadthSeries(
  closes: number[],
  advances: number,
  declines: number,
): BreadthSeries {
  const total = advances + declines;
  if (closes.length < 2 || total <= 0) return { adv: [], dec: [] };
  const open = closes[0];
  const rets = closes.map((c) => c / open - 1);
  const finalRatio = clamp(advances / total, 0.05, 0.95);
  const logit = (p: number) => Math.log(p / (1 - p));
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
  const slope = 60;
  const intercept = logit(finalRatio) - slope * rets[rets.length - 1];
  const rng = dayRng("breadth");
  const adv = rets.map((r, i) => {
    const noise = i === rets.length - 1 ? 0 : (rng() - 0.5) * 0.14;
    return total * sigmoid(intercept + slope * r + noise);
  });
  return { adv, dec: adv.map((a) => total - a) };
}

// ---------------------------------------------------------------- highlights

export function buildHighlights(
  indices: ListedQuote[],
  movers: Movers,
  sectors: SectorPerf[],
  fiiToday: FlowPoint | undefined,
  marketOpen: boolean,
): string[] {
  const out: string[] = [];
  const verb = marketOpen ? "trading" : "closed";
  const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

  const nifty = indices.find((e) => e.instrument.token === NIFTY_TOKEN);
  if (nifty) {
    const dir = nifty.quote.change >= 0 ? "higher" : "lower";
    out.push(`Nifty 50 ${verb} ${dir} by ${fmt.format(Math.abs(nifty.quote.change))} pts`);
  }
  const bank = indices.find((e) => e.instrument.token === BANKNIFTY_TOKEN);
  if (bank) {
    const dir = bank.quote.change >= 0 ? "gained" : "shed";
    out.push(`Bank Nifty ${dir} ${fmt.format(Math.abs(bank.quote.change))} pts today`);
  }
  if (sectors.length > 0) {
    const top = sectors[0];
    const short = top.name.replace("Nifty ", "");
    out.push(
      top.changePercent >= 0
        ? `${short} stocks led the gains (${top.changePercent.toFixed(2)}%)`
        : `${short} held up best in a weak market`,
    );
  }
  if (fiiToday) {
    const side = fiiToday.fii >= 0 ? "buying" : "selling";
    out.push(`FII ${side} worth ₹${fmt.format(Math.abs(Math.round(fiiToday.fii)))} Cr`);
  }
  const topGainer = movers.gainers[0];
  if (topGainer) {
    out.push(
      `${topGainer.instrument.symbol} surged ${topGainer.quote.changePercent.toFixed(2)}% — top gainer`,
    );
  }
  return out;
}

// ------------------------------------------------------------------- events

export interface EventItem {
  flag: string;
  title: string;
  /** ISO date. */
  date: string;
}

const RBI_MPC_2026 = ["2026-02-06", "2026-04-09", "2026-06-05", "2026-08-06", "2026-10-01", "2026-12-04"];
const INDIA_GDP_2026 = ["2026-02-27", "2026-05-29", "2026-08-31", "2026-11-30"];
const FOMC_2026 = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"];

function firstFriday(year: number, month: number): string {
  for (let d = 1; d <= 7; d++) {
    const date = new Date(Date.UTC(year, month, d));
    if (date.getUTCDay() === 5) return date.toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

export function getUpcomingEvents(count = 4): EventItem[] {
  const today = istDayKey();
  const now = new Date(`${today}T00:00:00Z`);
  const candidates: EventItem[] = [];

  for (const date of RBI_MPC_2026)
    candidates.push({ flag: "🇮🇳", title: "RBI Policy Decision", date });
  for (const date of INDIA_GDP_2026)
    candidates.push({ flag: "🇮🇳", title: "India GDP Growth", date });
  for (const date of FOMC_2026)
    candidates.push({ flag: "🇺🇸", title: "US Fed Rate Decision", date });
  for (let i = 0; i < 3; i++) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    candidates.push({
      flag: "🇺🇸",
      title: "US Non-Farm Payroll",
      date: firstFriday(m.getUTCFullYear(), m.getUTCMonth()),
    });
    candidates.push({
      flag: "🇮🇳",
      title: "India CPI Inflation",
      date: new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 12))
        .toISOString()
        .slice(0, 10),
    });
  }

  return candidates
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, count);
}
