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
  /** Pinned Angel NSE symboltoken for the `<symbol>-EQ` scrip. Lets the curated
   *  dashboard/watchlist/movers set resolve WITHOUT waiting on the multi-MB
   *  scrip master (the master is still used for every other NSE stock). */
  angelToken: string;
}

/** NSE cash symbols with pinned Angel symboltokens (verified from the master). */
export const EQUITIES: EquityDef[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", angelToken: "2885" },
  { symbol: "HDFCBANK", name: "HDFC Bank", angelToken: "1333" },
  { symbol: "ICICIBANK", name: "ICICI Bank", angelToken: "4963" },
  { symbol: "INFY", name: "Infosys", angelToken: "1594" },
  { symbol: "TCS", name: "Tata Consultancy Services", angelToken: "11536" },
  { symbol: "SBIN", name: "State Bank of India", angelToken: "3045" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", angelToken: "10604" },
  { symbol: "ITC", name: "ITC", angelToken: "1660" },
  { symbol: "LT", name: "Larsen & Toubro", angelToken: "11483" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", angelToken: "1922" },
  { symbol: "AXISBANK", name: "Axis Bank", angelToken: "5900" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", angelToken: "1394" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", angelToken: "317" },
  { symbol: "MARUTI", name: "Maruti Suzuki India", angelToken: "10999" },
  { symbol: "M&M", name: "Mahindra & Mahindra", angelToken: "2031" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", angelToken: "3351" },
  { symbol: "TITAN", name: "Titan Company", angelToken: "3506" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", angelToken: "11532" },
  { symbol: "ASIANPAINT", name: "Asian Paints", angelToken: "236" },
  { symbol: "NTPC", name: "NTPC", angelToken: "11630" },
  { symbol: "POWERGRID", name: "Power Grid Corporation", angelToken: "14977" },
  { symbol: "TMPV", name: "Tata Motors Passenger Vehicles", angelToken: "3456" },
  { symbol: "TATASTEEL", name: "Tata Steel", angelToken: "3499" },
  { symbol: "JSWSTEEL", name: "JSW Steel", angelToken: "11723" },
  { symbol: "WIPRO", name: "Wipro", angelToken: "3787" },
  { symbol: "HCLTECH", name: "HCL Technologies", angelToken: "7229" },
  { symbol: "TECHM", name: "Tech Mahindra", angelToken: "13538" },
  { symbol: "ADANIENT", name: "Adani Enterprises", angelToken: "25" },
  { symbol: "ADANIPORTS", name: "Adani Ports & SEZ", angelToken: "15083" },
  { symbol: "COALINDIA", name: "Coal India", angelToken: "20374" },
  { symbol: "ONGC", name: "Oil & Natural Gas Corp", angelToken: "2475" },
  { symbol: "GRASIM", name: "Grasim Industries", angelToken: "1232" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv", angelToken: "16675" },
  { symbol: "NESTLEIND", name: "Nestle India", angelToken: "17963" },
  { symbol: "DRREDDY", name: "Dr. Reddy's Laboratories", angelToken: "881" },
  { symbol: "CIPLA", name: "Cipla", angelToken: "694" },
  { symbol: "EICHERMOT", name: "Eicher Motors", angelToken: "910" },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp", angelToken: "1348" },
  { symbol: "INDUSINDBK", name: "IndusInd Bank", angelToken: "5258" },
  { symbol: "SHRIRAMFIN", name: "Shriram Finance", angelToken: "4306" },
];

/** symbol -> pinned Angel symboltoken for the curated equities. */
export const EQUITY_ANGEL_TOKENS = new Map(EQUITIES.map((e) => [e.symbol, e.angelToken]));

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
