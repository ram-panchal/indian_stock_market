/**
 * MOCK DATA — seed universe for the simulator.
 *
 * Base prices are plausible ballpark figures for major NSE names; they are
 * NOT real quotes. When the Angel One provider is active this file is unused.
 */

import type { Instrument } from "../types";

export interface SeedInstrument {
  instrument: Instrument;
  /** Previous-close anchor for the random walk. */
  basePrice: number;
  /** Annualised volatility used by the simulator. */
  sigma: number;
  /** Typical full-day traded volume (shares). */
  dayVolume: number;
}

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

function index(
  symbol: string,
  name: string,
  basePrice: number,
  sigma: number,
): SeedInstrument {
  return {
    instrument: {
      token: IDX(symbol),
      symbol,
      name,
      exchange: "NSE",
      segment: "INDEX",
      lotSize: 1,
      tickSize: 0.05,
    },
    basePrice,
    sigma,
    dayVolume: 0,
  };
}

function equity(
  symbol: string,
  name: string,
  basePrice: number,
  sigma: number,
  dayVolumeLakh: number,
): SeedInstrument {
  return {
    instrument: {
      token: EQ(symbol),
      symbol,
      name,
      exchange: "NSE",
      segment: "EQUITY",
      lotSize: 1,
      tickSize: 0.05,
    },
    basePrice,
    sigma,
    dayVolume: dayVolumeLakh * 100_000,
  };
}

export const INDICES: SeedInstrument[] = [
  index("NIFTY", "NIFTY 50", 25400, 0.11),
  index("BANKNIFTY", "NIFTY BANK", 57200, 0.13),
  index("FINNIFTY", "NIFTY FIN SERVICE", 26900, 0.12),
  index("MIDCPNIFTY", "NIFTY MIDCAP SELECT", 13150, 0.15),
  index("NIFTYIT", "NIFTY IT", 41800, 0.16),
];

export const EQUITIES: SeedInstrument[] = [
  equity("RELIANCE", "Reliance Industries", 2985, 0.18, 62),
  equity("HDFCBANK", "HDFC Bank", 1725, 0.16, 105),
  equity("ICICIBANK", "ICICI Bank", 1252, 0.17, 130),
  equity("INFY", "Infosys", 1618, 0.2, 68),
  equity("TCS", "Tata Consultancy Services", 3945, 0.17, 24),
  equity("SBIN", "State Bank of India", 832, 0.21, 155),
  equity("BHARTIARTL", "Bharti Airtel", 1562, 0.18, 47),
  equity("ITC", "ITC", 446, 0.15, 120),
  equity("LT", "Larsen & Toubro", 3652, 0.18, 21),
  equity("KOTAKBANK", "Kotak Mahindra Bank", 1788, 0.17, 42),
  equity("AXISBANK", "Axis Bank", 1142, 0.19, 78),
  equity("HINDUNILVR", "Hindustan Unilever", 2382, 0.14, 16),
  equity("BAJFINANCE", "Bajaj Finance", 7160, 0.22, 12),
  equity("MARUTI", "Maruti Suzuki India", 12420, 0.17, 6),
  equity("M&M", "Mahindra & Mahindra", 2948, 0.2, 28),
  equity("SUNPHARMA", "Sun Pharmaceutical", 1722, 0.16, 24),
  equity("TITAN", "Titan Company", 3418, 0.18, 10),
  equity("ULTRACEMCO", "UltraTech Cement", 11280, 0.17, 4),
  equity("ASIANPAINT", "Asian Paints", 2408, 0.16, 14),
  equity("NTPC", "NTPC", 362, 0.18, 140),
  equity("POWERGRID", "Power Grid Corporation", 321, 0.16, 110),
  equity("TMPV", "Tata Motors Passenger Vehicles", 988, 0.24, 125),
  equity("TATASTEEL", "Tata Steel", 166, 0.23, 380),
  equity("JSWSTEEL", "JSW Steel", 942, 0.21, 45),
  equity("WIPRO", "Wipro", 492, 0.19, 90),
  equity("HCLTECH", "HCL Technologies", 1558, 0.18, 32),
  equity("TECHM", "Tech Mahindra", 1452, 0.2, 30),
  equity("ADANIENT", "Adani Enterprises", 3055, 0.28, 22),
  equity("ADANIPORTS", "Adani Ports & SEZ", 1424, 0.25, 38),
  equity("COALINDIA", "Coal India", 482, 0.18, 95),
  equity("ONGC", "Oil & Natural Gas Corp", 262, 0.19, 130),
  equity("GRASIM", "Grasim Industries", 2678, 0.17, 8),
  equity("BAJAJFINSV", "Bajaj Finserv", 1642, 0.2, 20),
  equity("NESTLEIND", "Nestle India", 2478, 0.14, 7),
  equity("DRREDDY", "Dr. Reddy's Laboratories", 6420, 0.16, 5),
  equity("CIPLA", "Cipla", 1518, 0.17, 22),
  equity("EICHERMOT", "Eicher Motors", 4890, 0.19, 6),
  equity("HEROMOTOCO", "Hero MotoCorp", 5320, 0.18, 5),
  equity("INDUSINDBK", "IndusInd Bank", 1018, 0.25, 55),
  equity("SHRIRAMFIN", "Shriram Finance", 2952, 0.22, 14),
];

export const UNIVERSE: SeedInstrument[] = [...INDICES, ...EQUITIES];

export interface OptionUnderlyingConfig {
  token: string;
  strikeStep: number;
  lotSize: number;
  /** ATM implied volatility anchor. */
  baseIV: number;
  /** Peak open interest per strike (contracts × lot). */
  maxOI: number;
}

/** Index options only in the simulator; lot sizes follow current NSE specs. */
export const OPTION_UNDERLYINGS: OptionUnderlyingConfig[] = [
  { token: IDX("NIFTY"), strikeStep: 50, lotSize: 75, baseIV: 0.12, maxOI: 9_000_000 },
  { token: IDX("BANKNIFTY"), strikeStep: 100, lotSize: 35, baseIV: 0.145, maxOI: 4_200_000 },
  { token: IDX("FINNIFTY"), strikeStep: 50, lotSize: 65, baseIV: 0.13, maxOI: 1_600_000 },
];

export const OPTION_UNDERLYING_TOKENS = OPTION_UNDERLYINGS.map((u) => u.token);
