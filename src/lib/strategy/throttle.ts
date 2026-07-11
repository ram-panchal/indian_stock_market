/**
 * Rate-limit-safe wrappers around src/lib/market/angelone/angel-data.ts.
 *
 * That module's fetchQuotes()/fetchCandles() have no inter-chunk/inter-call
 * delay of their own — a non-issue for today's existing callers (curated
 * ~39-stock dashboard = 1 quote chunk; option chain = a couple of chunks),
 * but a real problem at full-market scale (2000+ symbols = 40+ chunks for
 * quotes, one call per symbol for candles). Angel returns a non-200 for a
 * throttled request silently — fetchQuotes only special-cases HTTP 401, so
 * a rate-limited chunk just produces empty/missing data with no exception
 * to catch. Left unfixed, a large fraction of the market could silently drop
 * out of a scan while it reports success.
 *
 * Fixed here (script-side self-throttling) rather than inside angel-data.ts
 * itself, to keep the blast radius small — zero risk to the existing
 * dashboard/option-chain code paths.
 */

import type { Candle, Timeframe } from "@/lib/market/types";
import { fetchCandles, fetchQuotes, type QuoteWithDepth } from "@/lib/market/angelone/angel-data";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Matches angel-data.ts's own (unexported) QUOTE_CHUNK — Angel's FULL quote
 *  mode accepts at most 50 tokens per request. */
const QUOTE_BATCH_SIZE = 50;
/** ~10% margin under Angel's documented ~1 req/sec quote-endpoint limit. */
const QUOTE_DELAY_MS = 1100;
/** ~20% margin under Angel's documented ~3 req/sec historical-candle limit. */
const CANDLE_DELAY_MS = 400;
const CANDLE_RETRY_BACKOFF_MS = 2000;

export interface ThrottledProgress {
  onProgress?: (done: number, total: number) => void;
}

export async function fetchQuotesThrottled(
  tokens: string[],
  opts: ThrottledProgress & { batchSize?: number; delayMs?: number } = {},
): Promise<Map<string, QuoteWithDepth>> {
  const batchSize = opts.batchSize ?? QUOTE_BATCH_SIZE;
  const delayMs = opts.delayMs ?? QUOTE_DELAY_MS;
  const batches = chunk(tokens, batchSize);
  const out = new Map<string, QuoteWithDepth>();
  for (let i = 0; i < batches.length; i++) {
    const result = await fetchQuotes(batches[i]);
    for (const [token, qd] of result) out.set(token, qd);
    opts.onProgress?.(i + 1, batches.length);
    if (i < batches.length - 1) await sleep(delayMs);
  }
  return out;
}

/**
 * Sequential (Angel's historical endpoint is one-token-per-call regardless)
 * with one retry + backoff on an empty/failed fetch — a genuine fetch
 * failure and a rate-limited fetch look identical here (empty array), so a
 * single retry after a longer pause cheaply recovers most transient cases.
 */
export async function fetchCandlesThrottled(
  tokens: string[],
  timeframe: Timeframe,
  opts: ThrottledProgress & { maxBars?: number; delayMs?: number; retries?: number } = {},
): Promise<Map<string, Candle[]>> {
  const maxBars = opts.maxBars ?? 270;
  const delayMs = opts.delayMs ?? CANDLE_DELAY_MS;
  const retries = opts.retries ?? 1;
  const out = new Map<string, Candle[]>();

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let candles: Candle[] = [];
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        candles = await fetchCandles(token, timeframe, maxBars);
      } catch {
        candles = [];
      }
      if (candles.length > 0 || attempt === retries) break;
      await sleep(CANDLE_RETRY_BACKOFF_MS);
    }
    out.set(token, candles);
    opts.onProgress?.(i + 1, tokens.length);
    if (i < tokens.length - 1) await sleep(delayMs);
  }
  return out;
}
