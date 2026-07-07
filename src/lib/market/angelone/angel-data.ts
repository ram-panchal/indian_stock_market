/**
 * Angel One market-data REST calls — SERVER ONLY.
 *
 * Thin mappers from Angel's getMarketData / getCandleData / optionGreek
 * responses into our domain types. DATA ACCESS ONLY — no order endpoints.
 */

import type {
  Candle,
  DepthLevel,
  MarketDepth,
  Quote,
  Timeframe,
} from "../types";
import {
  isoToAngelExpiry,
  resolveTokens,
  type AngelRef,
} from "./instrument-master";
import { withAngelSession } from "./session-store";

const QUOTE_URL =
  "https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote/";
const CANDLE_URL =
  "https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData";
const GREEK_URL =
  "https://apiconnect.angelone.in/rest/secure/angelbroking/marketData/v1/optionGreek";

/** FULL mode accepts at most 50 tokens per request. */
const QUOTE_CHUNK = 50;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ------------------------------------------------------------------- quotes

interface AngelDepthLevel {
  price: number;
  quantity: number;
  orders: number;
}
interface AngelFetched {
  exchange: string;
  symbolToken: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  netChange: number;
  percentChange: number;
  tradeVolume: number;
  opnInterest: number;
  depth?: { buy?: AngelDepthLevel[]; sell?: AngelDepthLevel[] };
}
interface AngelQuoteResponse {
  status: boolean;
  message: string;
  data?: { fetched?: AngelFetched[]; unfetched?: unknown[] };
}

export interface QuoteWithDepth {
  quote: Quote;
  depth: MarketDepth;
}

function mapDepthLevels(levels: AngelDepthLevel[] | undefined): DepthLevel[] {
  return (levels ?? []).map((l) => ({
    price: num(l.price),
    qty: num(l.quantity),
    orders: num(l.orders),
  }));
}

function toQuoteWithDepth(ourToken: string, f: AngelFetched, now: number): QuoteWithDepth {
  const bids = mapDepthLevels(f.depth?.buy);
  const asks = mapDepthLevels(f.depth?.sell);
  const oi = num(f.opnInterest);
  const quote: Quote = {
    token: ourToken,
    ltp: num(f.ltp),
    change: num(f.netChange),
    changePercent: num(f.percentChange),
    open: num(f.open),
    high: num(f.high),
    low: num(f.low),
    prevClose: num(f.close),
    volume: num(f.tradeVolume),
    bid: bids[0]?.price ?? 0,
    bidQty: bids[0]?.qty ?? 0,
    ask: asks[0]?.price ?? 0,
    askQty: asks[0]?.qty ?? 0,
    ...(oi > 0 ? { oi } : {}),
    updatedAt: now,
  };
  const depth: MarketDepth = {
    token: ourToken,
    bids,
    asks,
    totalBidQty: bids.reduce((s, l) => s + l.qty, 0),
    totalAskQty: asks.reduce((s, l) => s + l.qty, 0),
    updatedAt: now,
  };
  return { quote, depth };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fetch live quotes (+ depth) for our tokens. Returns a map keyed by our
 * token; tokens Angel could not resolve/fetch are simply absent.
 */
export async function fetchQuotes(
  ourTokens: string[],
): Promise<Map<string, QuoteWithDepth>> {
  const resolved = await resolveTokens([...new Set(ourTokens)]);
  const out = new Map<string, QuoteWithDepth>();
  if (resolved.length === 0) return out;

  // Reverse lookup: "EXCHANGE:symboltoken" -> our token.
  const backRef = new Map<string, string>();
  for (const { ourToken, ref } of resolved) {
    backRef.set(`${ref.exchange}:${ref.symboltoken}`, ourToken);
  }

  for (const batch of chunk(resolved, QUOTE_CHUNK)) {
    const exchangeTokens: Record<string, string[]> = {};
    for (const { ref } of batch) {
      (exchangeTokens[ref.exchange] ??= []).push(ref.symboltoken);
    }
    const body = await withAngelSession<AngelQuoteResponse>(async (_s, headers) => {
      const res = await fetch(QUOTE_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ mode: "FULL", exchangeTokens }),
        cache: "no-store",
      });
      const value = (await res.json().catch(() => null)) as AngelQuoteResponse;
      return { status: res.status, value };
    });
    const now = Date.now();
    for (const f of body?.data?.fetched ?? []) {
      const ourToken = backRef.get(`${f.exchange}:${f.symbolToken}`);
      if (ourToken) out.set(ourToken, toQuoteWithDepth(ourToken, f, now));
    }
  }
  return out;
}

// ------------------------------------------------------------------ candles

const INTERVAL: Record<Timeframe, string> = {
  "1m": "ONE_MINUTE",
  "5m": "FIVE_MINUTE",
  "15m": "FIFTEEN_MINUTE",
  "1h": "ONE_HOUR",
  "1d": "ONE_DAY",
};

/** Lookback window (days) per timeframe — within Angel's per-request limits. */
const LOOKBACK_DAYS: Record<Timeframe, number> = {
  "1m": 6,
  "5m": 20,
  "15m": 40,
  "1h": 90,
  "1d": 500,
};

interface AngelCandleResponse {
  status: boolean;
  message: string;
  data?: [string, number, number, number, number, number][];
}

/** Format an epoch as "YYYY-MM-DD HH:mm" in IST (Angel expects IST). */
function istStamp(epochMs: number): string {
  const d = new Date(epochMs + 5.5 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
  );
}

export async function fetchCandles(
  ourToken: string,
  timeframe: Timeframe,
  maxBars = 500,
): Promise<Candle[]> {
  const [resolved] = await resolveTokens([ourToken]);
  if (!resolved) return [];
  const ref: AngelRef = resolved.ref;
  const now = Date.now();
  const from = now - LOOKBACK_DAYS[timeframe] * 24 * 3600 * 1000;

  const body = await withAngelSession<AngelCandleResponse>(async (_s, headers) => {
    const res = await fetch(CANDLE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        exchange: ref.exchange,
        symboltoken: ref.symboltoken,
        interval: INTERVAL[timeframe],
        fromdate: istStamp(from),
        todate: istStamp(now),
      }),
      cache: "no-store",
    });
    const value = (await res.json().catch(() => null)) as AngelCandleResponse;
    return { status: res.status, value };
  });

  const rows = body?.data ?? [];
  const candles: Candle[] = rows.map(([t, o, h, l, c, v]) => ({
    time: Math.floor(Date.parse(t) / 1000),
    open: num(o),
    high: num(h),
    low: num(l),
    close: num(c),
    volume: num(v),
  }));
  return candles.slice(-maxBars);
}

// ------------------------------------------------------------------- greeks

export interface Greeks {
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

interface AngelGreekRow {
  strikePrice: string | number;
  optionType: string;
  delta: string | number;
  gamma: string | number;
  theta: string | number;
  vega: string | number;
  impliedVolatility: string | number;
}
interface AngelGreekResponse {
  status: boolean;
  message: string;
  data?: AngelGreekRow[];
}

/** Live greeks keyed by "<strike>|<CE|PE>". Empty map on failure (non-fatal). */
export async function fetchGreeks(
  underlyingSymbol: string,
  expiryIso: string,
): Promise<Map<string, Greeks>> {
  const out = new Map<string, Greeks>();
  try {
    const body = await withAngelSession<AngelGreekResponse>(async (_s, headers) => {
      const res = await fetch(GREEK_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: underlyingSymbol,
          expirydate: isoToAngelExpiry(expiryIso),
        }),
        cache: "no-store",
      });
      const value = (await res.json().catch(() => null)) as AngelGreekResponse;
      return { status: res.status, value };
    });
    for (const r of body?.data ?? []) {
      const strike = num(r.strikePrice);
      const type = String(r.optionType).toUpperCase();
      if (type !== "CE" && type !== "PE") continue;
      out.set(`${strike}|${type}`, {
        iv: num(r.impliedVolatility),
        delta: num(r.delta),
        gamma: num(r.gamma),
        theta: num(r.theta),
        vega: num(r.vega),
      });
    }
  } catch {
    // Greeks are best-effort; the chain still shows live LTP/OI without them.
  }
  return out;
}
