/**
 * Angel One instrument master — SERVER ONLY.
 *
 * Fetches Angel's public OpenAPIScripMaster.json, keeps only the instruments
 * this app trades (curated NSE equities + index options for our underlyings),
 * indexes them, and resolves our stable `IDX:`/`EQ:`/`OPT:` tokens to Angel
 * `{ exchange, symboltoken }`. Cached in-process with a daily TTL.
 */

import type { Exchange, Instrument, OptionType } from "../types";
import {
  EQUITIES,
  IDX,
  INDICES,
  OPTION_UNDERLYINGS,
  optionToken,
} from "./universe";

const SCRIP_MASTER_URL =
  "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";

const MASTER_TTL_MS = 12 * 60 * 60 * 1000;

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

interface ScripRow {
  token: string;
  symbol: string;
  name: string;
  expiry: string;
  strike: string;
  lotsize: string;
  instrumenttype: string;
  exch_seg: string;
  tick_size: string;
}

export interface AngelRef {
  exchange: Exchange;
  symboltoken: string;
}

interface OptionLeg {
  row: ScripRow;
  strike: number; // rupees
  type: OptionType;
}

interface Master {
  builtAt: number;
  /** "RELIANCE" -> equity row. */
  eqBySymbol: Map<string, ScripRow>;
  /** underlyingSymbol -> Angel expiry (DDMMMYYYY) -> legs, sorted by strike. */
  optionsByUnderlying: Map<string, Map<string, OptionLeg[]>>;
}

// ------------------------------------------------------------ expiry helpers

export function isoToAngelExpiry(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}${MONTHS[Number(m) - 1]}${y}`;
}

export function angelExpiryToIso(a: string): string {
  const d = a.slice(0, 2);
  const mon = a.slice(2, 5).toUpperCase();
  const y = a.slice(5);
  const m = MONTHS.indexOf(mon) + 1;
  return `${y}-${String(m).padStart(2, "0")}-${d}`;
}

function angelExpiryMs(a: string): number {
  return Date.parse(`${angelExpiryToIso(a)}T15:30:00+05:30`);
}

// ---------------------------------------------------------------- build/cache

let cached: Master | null = null;
let inflight: Promise<Master> | null = null;

const UNDERLYING_NAMES = new Set(OPTION_UNDERLYINGS.map((u) => u.symbol));

function buildMaster(rows: ScripRow[]): Master {
  const eqBySymbol = new Map<string, ScripRow>();
  const optionsByUnderlying = new Map<string, Map<string, OptionLeg[]>>();

  for (const r of rows) {
    if (r.exch_seg === "NSE" && r.instrumenttype === "" && r.symbol.endsWith("-EQ")) {
      eqBySymbol.set(r.symbol.slice(0, -3), r);
      continue;
    }
    if (r.exch_seg === "NFO" && r.instrumenttype === "OPTIDX" && UNDERLYING_NAMES.has(r.name)) {
      const type = r.symbol.slice(-2) as OptionType;
      if (type !== "CE" && type !== "PE") continue;
      let byExpiry = optionsByUnderlying.get(r.name);
      if (!byExpiry) {
        byExpiry = new Map();
        optionsByUnderlying.set(r.name, byExpiry);
      }
      let legs = byExpiry.get(r.expiry);
      if (!legs) {
        legs = [];
        byExpiry.set(r.expiry, legs);
      }
      legs.push({ row: r, strike: Math.round(Number(r.strike)) / 100, type });
    }
  }

  for (const byExpiry of optionsByUnderlying.values()) {
    for (const legs of byExpiry.values()) legs.sort((a, b) => a.strike - b.strike);
  }

  return { builtAt: Date.now(), eqBySymbol, optionsByUnderlying };
}

export async function getMaster(): Promise<Master> {
  if (cached && Date.now() - cached.builtAt < MASTER_TTL_MS) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch(SCRIP_MASTER_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Instrument master fetch failed: HTTP ${res.status}`);
    const rows = (await res.json()) as ScripRow[];
    cached = buildMaster(rows);
    return cached;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

// ---------------------------------------------------------------- resolution

/** Resolve one of our tokens to an Angel exchange + symboltoken. */
export async function resolveToken(ourToken: string): Promise<AngelRef | undefined> {
  if (ourToken.startsWith("IDX:")) {
    const sym = ourToken.slice(4);
    const idx = INDICES.find((i) => i.symbol === sym);
    return idx ? { exchange: "NSE", symboltoken: idx.angelToken } : undefined;
  }
  const master = await getMaster();
  if (ourToken.startsWith("EQ:")) {
    const row = master.eqBySymbol.get(ourToken.slice(3));
    return row ? { exchange: "NSE", symboltoken: row.token } : undefined;
  }
  if (ourToken.startsWith("OPT:")) {
    const leg = findOptionLeg(master, ourToken);
    return leg ? { exchange: "NFO", symboltoken: leg.row.token } : undefined;
  }
  return undefined;
}

/** Resolve many of our tokens at once (order preserved, misses dropped). */
export async function resolveTokens(
  ourTokens: string[],
): Promise<{ ourToken: string; ref: AngelRef }[]> {
  const out: { ourToken: string; ref: AngelRef }[] = [];
  for (const t of ourTokens) {
    const ref = await resolveToken(t);
    if (ref) out.push({ ourToken: t, ref });
  }
  return out;
}

function parseOurOptionToken(
  ourToken: string,
): { underlyingSymbol: string; expiryIso: string; strike: number; type: OptionType } | undefined {
  const parts = ourToken.split(":");
  if (parts.length !== 5 || parts[0] !== "OPT") return undefined;
  const [, underlyingSymbol, expiryIso, strikeStr, type] = parts;
  const strike = Number(strikeStr);
  if (!Number.isFinite(strike) || (type !== "CE" && type !== "PE")) return undefined;
  return { underlyingSymbol, expiryIso, strike, type };
}

function findOptionLeg(master: Master, ourToken: string): OptionLeg | undefined {
  const parsed = parseOurOptionToken(ourToken);
  if (!parsed) return undefined;
  const byExpiry = master.optionsByUnderlying.get(parsed.underlyingSymbol);
  const legs = byExpiry?.get(isoToAngelExpiry(parsed.expiryIso));
  if (!legs) return undefined;
  return legs.find((l) => l.type === parsed.type && Math.abs(l.strike - parsed.strike) < 0.001);
}

// ------------------------------------------------------------------- lookups

/** Upcoming expiries (ISO) for an option underlying, soonest first. */
export async function getExpiries(underlyingSymbol: string): Promise<string[]> {
  const master = await getMaster();
  const byExpiry = master.optionsByUnderlying.get(underlyingSymbol);
  if (!byExpiry) return [];
  const now = Date.now();
  return [...byExpiry.keys()]
    .filter((e) => angelExpiryMs(e) >= now - 6 * 60 * 60 * 1000)
    .sort((a, b) => angelExpiryMs(a) - angelExpiryMs(b))
    .map(angelExpiryToIso);
}

export interface ChainLeg {
  strike: number;
  ce?: Instrument;
  pe?: Instrument;
}

/**
 * The `count` listed strikes nearest `spot` for an underlying+expiry, with our
 * Instrument built for each present CE/PE leg (real lot size + tick from Angel).
 */
export async function getChainStrikes(
  underlyingSymbol: string,
  expiryIso: string,
  spot: number,
  count = 20,
): Promise<ChainLeg[]> {
  const master = await getMaster();
  const legs = master.optionsByUnderlying.get(underlyingSymbol)?.get(isoToAngelExpiry(expiryIso));
  if (!legs || legs.length === 0) return [];

  const underlyingName = INDICES.find((i) => i.symbol === underlyingSymbol)?.name ?? underlyingSymbol;
  const byStrike = new Map<number, ChainLeg>();
  for (const leg of legs) {
    let row = byStrike.get(leg.strike);
    if (!row) {
      row = { strike: leg.strike };
      byStrike.set(leg.strike, row);
    }
    const inst = optionInstrument(leg, underlyingSymbol, underlyingName, expiryIso);
    if (leg.type === "CE") row.ce = inst;
    else row.pe = inst;
  }

  const strikes = [...byStrike.keys()].sort((a, b) => a - b);
  // Window of `count` strikes on each side of the strike closest to spot.
  let atmIdx = 0;
  let best = Infinity;
  strikes.forEach((s, i) => {
    const d = Math.abs(s - spot);
    if (d < best) {
      best = d;
      atmIdx = i;
    }
  });
  const from = Math.max(0, atmIdx - count);
  const to = Math.min(strikes.length, atmIdx + count + 1);
  return strikes.slice(from, to).map((s) => byStrike.get(s)!);
}

function optionInstrument(
  leg: OptionLeg,
  underlyingSymbol: string,
  underlyingName: string,
  expiryIso: string,
): Instrument {
  return {
    token: optionToken(underlyingSymbol, expiryIso, leg.strike, leg.type),
    symbol: `${underlyingSymbol} ${expiryIso.slice(5)} ${leg.strike} ${leg.type}`,
    name: `${underlyingName} ${leg.strike} ${leg.type}`,
    exchange: "NFO",
    segment: "OPTION",
    lotSize: Number(leg.row.lotsize) || 1,
    tickSize: Number(leg.row.tick_size) / 100 || 0.05,
    underlyingToken: IDX(underlyingSymbol),
    expiry: expiryIso,
    strike: leg.strike,
    optionType: leg.type,
  };
}

/** Build the Instrument for a single option token (for order tickets, etc.). */
export async function getOptionInstrument(ourToken: string): Promise<Instrument | undefined> {
  const master = await getMaster();
  const parsed = parseOurOptionToken(ourToken);
  if (!parsed) return undefined;
  const leg = findOptionLeg(master, ourToken);
  if (!leg) return undefined;
  const underlyingName =
    INDICES.find((i) => i.symbol === parsed.underlyingSymbol)?.name ?? parsed.underlyingSymbol;
  return optionInstrument(leg, parsed.underlyingSymbol, underlyingName, parsed.expiryIso);
}

// -------------------------------------------------------------------- search

/** Search curated indices + equities by symbol/name (options excluded). */
export function searchUniverse(query: string): Instrument[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const pool: { inst: Instrument; sym: string; name: string }[] = [
    ...INDICES.map((i) => ({
      inst: {
        token: IDX(i.symbol),
        symbol: i.symbol,
        name: i.name,
        exchange: "NSE" as Exchange,
        segment: "INDEX" as const,
        lotSize: 1,
        tickSize: 0.05,
      },
      sym: i.symbol,
      name: i.name,
    })),
    ...EQUITIES.map((e) => ({
      inst: {
        token: `EQ:${e.symbol}`,
        symbol: e.symbol,
        name: e.name,
        exchange: "NSE" as Exchange,
        segment: "EQUITY" as const,
        lotSize: 1,
        tickSize: 0.05,
      },
      sym: e.symbol,
      name: e.name,
    })),
  ];
  const scored = pool
    .map(({ inst, sym, name }) => {
      const s = sym.toUpperCase();
      const n = name.toUpperCase();
      let score = -1;
      if (s === q) score = 100;
      else if (s.startsWith(q)) score = 80;
      else if (n.startsWith(q)) score = 60;
      else if (s.includes(q)) score = 40;
      else if (n.includes(q)) score = 20;
      return { inst, score };
    })
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score || a.inst.symbol.localeCompare(b.inst.symbol));
  return scored.slice(0, 12).map((r) => r.inst);
}
