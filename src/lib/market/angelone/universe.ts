/**
 * Curated Angel One universe — shared static data (client + server safe; no
 * secrets). Mirrors the mock seed universe so tokens stay stable across
 * providers (watchlists / paper trades persist our `IDX:`/`EQ:`/`OPT:` tokens).
 *
 * Angel `symboltoken`s for equities and options are resolved at runtime from
 * the instrument master; only the index tokens (few, stable) are pinned here.
 */

import type { Instrument } from "../types";

/** Our token conventions (identical to the mock, so nothing else changes). */
export const IDX = (symbol: string) => `IDX:${symbol}`;
export const EQ = (symbol: string) => `EQ:${symbol}`;

export function optionToken(
  underlyingSymbol: string,
  expiry: string,
  strike: number,
  type: "CE" | "PE",
): string {
  return `OPT:${underlyingSymbol}:${expiry}:${strike}:${type}`;
}

export interface IndexDef {
  symbol: string;
  name: string;
  /** Angel One symboltoken on exchange NSE (verified from scrip master). */
  angelToken: string;
}

/** Angel index tokens are in the 99926xxx range on exchange NSE. */
export const INDICES: IndexDef[] = [
  { symbol: "NIFTY", name: "NIFTY 50", angelToken: "99926000" },
  { symbol: "BANKNIFTY", name: "NIFTY BANK", angelToken: "99926009" },
  { symbol: "FINNIFTY", name: "NIFTY FIN SERVICE", angelToken: "99926037" },
  { symbol: "MIDCPNIFTY", name: "NIFTY MIDCAP SELECT", angelToken: "99926074" },
  { symbol: "NIFTYIT", name: "NIFTY IT", angelToken: "99926008" },
];

export interface EquityDef {
  symbol: string;
  name: string;
}

/** NSE cash symbols; Angel token resolved from master as `<symbol>-EQ`. */
export const EQUITIES: EquityDef[] = [
  { symbol: "RELIANCE", name: "Reliance Industries" },
  { symbol: "HDFCBANK", name: "HDFC Bank" },
  { symbol: "ICICIBANK", name: "ICICI Bank" },
  { symbol: "INFY", name: "Infosys" },
  { symbol: "TCS", name: "Tata Consultancy Services" },
  { symbol: "SBIN", name: "State Bank of India" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel" },
  { symbol: "ITC", name: "ITC" },
  { symbol: "LT", name: "Larsen & Toubro" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank" },
  { symbol: "AXISBANK", name: "Axis Bank" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance" },
  { symbol: "MARUTI", name: "Maruti Suzuki India" },
  { symbol: "M&M", name: "Mahindra & Mahindra" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical" },
  { symbol: "TITAN", name: "Titan Company" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement" },
  { symbol: "ASIANPAINT", name: "Asian Paints" },
  { symbol: "NTPC", name: "NTPC" },
  { symbol: "POWERGRID", name: "Power Grid Corporation" },
  { symbol: "TMPV", name: "Tata Motors Passenger Vehicles" },
  { symbol: "TATASTEEL", name: "Tata Steel" },
  { symbol: "JSWSTEEL", name: "JSW Steel" },
  { symbol: "WIPRO", name: "Wipro" },
  { symbol: "HCLTECH", name: "HCL Technologies" },
  { symbol: "TECHM", name: "Tech Mahindra" },
  { symbol: "ADANIENT", name: "Adani Enterprises" },
  { symbol: "ADANIPORTS", name: "Adani Ports & SEZ" },
  { symbol: "COALINDIA", name: "Coal India" },
  { symbol: "ONGC", name: "Oil & Natural Gas Corp" },
  { symbol: "GRASIM", name: "Grasim Industries" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv" },
  { symbol: "NESTLEIND", name: "Nestle India" },
  { symbol: "DRREDDY", name: "Dr. Reddy's Laboratories" },
  { symbol: "CIPLA", name: "Cipla" },
  { symbol: "EICHERMOT", name: "Eicher Motors" },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp" },
  { symbol: "INDUSINDBK", name: "IndusInd Bank" },
  { symbol: "SHRIRAMFIN", name: "Shriram Finance" },
];

export interface OptionUnderlyingDef {
  /** Our underlying symbol AND the Angel option `name` field (they match). */
  symbol: string;
  name: string;
  /** Strike spacing used to pick the ±N strikes around ATM. */
  strikeStep: number;
}

/** Index options; `name` in the NFO master matches these symbols exactly. */
export const OPTION_UNDERLYINGS: OptionUnderlyingDef[] = [
  { symbol: "NIFTY", name: "NIFTY 50", strikeStep: 50 },
  { symbol: "BANKNIFTY", name: "NIFTY BANK", strikeStep: 100 },
  { symbol: "FINNIFTY", name: "NIFTY FIN SERVICE", strikeStep: 50 },
  { symbol: "MIDCPNIFTY", name: "NIFTY MIDCAP SELECT", strikeStep: 25 },
];

// --------------------------------------------------------------- Instruments

/** Build the Instrument for an index (no master lookup needed). */
export function indexInstrument(def: IndexDef): Instrument {
  return {
    token: IDX(def.symbol),
    symbol: def.symbol,
    name: def.name,
    exchange: "NSE",
    segment: "INDEX",
    lotSize: 1,
    tickSize: 0.05,
  };
}

/** Build the Instrument for an equity (lot 1, standard 0.05 tick). */
export function equityInstrument(def: EquityDef): Instrument {
  return {
    token: EQ(def.symbol),
    symbol: def.symbol,
    name: def.name,
    exchange: "NSE",
    segment: "EQUITY",
    lotSize: 1,
    tickSize: 0.05,
  };
}

export const INDEX_INSTRUMENTS: Instrument[] = INDICES.map(indexInstrument);
export const EQUITY_INSTRUMENTS: Instrument[] = EQUITIES.map(equityInstrument);
export const OPTION_UNDERLYING_INSTRUMENTS: Instrument[] = OPTION_UNDERLYINGS.map(
  (u) => indexInstrument(INDICES.find((i) => i.symbol === u.symbol)!),
);

export const INDEX_TOKENS: string[] = INDEX_INSTRUMENTS.map((i) => i.token);
export const EQUITY_TOKENS: string[] = EQUITY_INSTRUMENTS.map((i) => i.token);
