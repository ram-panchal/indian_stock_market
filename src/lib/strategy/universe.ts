import { getMaster } from "@/lib/market/angelone/instrument-master";
import type { Instrument } from "@/lib/market/types";
import { readJsonFile, writeJsonFileAtomic } from "./store";

export interface UniverseSymbol {
  token: string;
  symbol: string;
  name: string;
}

/**
 * Minimal, standard-defaults Instrument for an NSE cash equity, built without
 * an extra instrument-master round-trip. Equities always trade lot-size 1
 * (unlike F&O), and 0.05 is the standard NSE equity tick size — accurate for
 * the vast majority of stocks and irrelevant to a paper-trade P&L record
 * anyway (unlike the interactive engine, this ledger doesn't enforce
 * tick-boundary rounding at entry).
 */
export function equityInstrumentFor(token: string, symbol: string, name: string): Instrument {
  return {
    token,
    symbol,
    name,
    exchange: "NSE",
    segment: "EQUITY",
    lotSize: 1,
    tickSize: 0.05,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const UNIVERSE_CACHE_PATH = "cache/equity-universe.json";
/** Matches instrument-master.ts's own in-process TTL. */
const UNIVERSE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface UniverseCache {
  builtAt: number;
  universe: UniverseSymbol[];
}

async function fetchUniverseFromNetwork(retries: number): Promise<UniverseSymbol[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const master = await getMaster();
      const out: UniverseSymbol[] = [];
      for (const [symbol, row] of master.eqBySymbol) {
        out.push({ token: `EQ:${symbol}`, symbol, name: row.name || symbol });
      }
      return out;
    } catch (err) {
      lastErr = err;
      const reason = err instanceof Error ? err.message : String(err);
      if (attempt < retries) {
        const delay = 5000 * (attempt + 1);
        console.log(
          `[universe] instrument-master fetch failed (attempt ${attempt + 1}/${retries + 1}): ${reason} — retrying in ${delay}ms...`,
        );
        await sleep(delay);
      }
    }
  }
  throw lastErr;
}

/**
 * Every NSE cash-equity symbol currently in Angel's instrument master — the
 * full market (~2000-2500 symbols), not the ~39-stock curated list the
 * existing dashboard/movers use (src/lib/market/angelone/universe.ts).
 *
 * Cached to disk (data/strategy/cache/), separately from instrument-master.ts's
 * own 12h in-process cache — that cache lives only for the life of one Node
 * process, so it gives zero benefit across separate script runs (each
 * `npm run daily-scan` is a fresh process). This file has also proven to be a
 * slow, sometimes-unreliable ~30MB+ fetch in practice (measured as low as
 * ~56KB/s), so avoiding a repeat download every single day matters for more
 * than just speed.
 *
 * On a network failure, falls back to a stale disk cache rather than
 * aborting the whole scan — equity listings change rarely enough that a
 * slightly outdated symbol list is a safe degrade (a delisted symbol simply
 * fails to quote and drops out naturally at Stage A; a very recent IPO is
 * missed until the next successful refresh).
 */
export async function getFullEquityUniverse(retries = 2): Promise<UniverseSymbol[]> {
  const cached = readJsonFile<UniverseCache | null>(UNIVERSE_CACHE_PATH, null);
  if (cached && Date.now() - cached.builtAt < UNIVERSE_CACHE_TTL_MS) {
    console.log(
      `[universe] using disk-cached universe (${cached.universe.length} symbols, ${Math.round((Date.now() - cached.builtAt) / 60000)}m old).`,
    );
    return cached.universe;
  }

  try {
    const universe = await fetchUniverseFromNetwork(retries);
    writeJsonFileAtomic<UniverseCache>(UNIVERSE_CACHE_PATH, { builtAt: Date.now(), universe });
    return universe;
  } catch (err) {
    if (cached) {
      console.log(
        `[universe] network fetch failed, falling back to stale disk cache (${Math.round((Date.now() - cached.builtAt) / 3600000)}h old): ${err instanceof Error ? err.message : err}`,
      );
      return cached.universe;
    }
    throw err;
  }
}
