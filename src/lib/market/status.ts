import type { MarketStatus } from "./types";

/**
 * NSE equity/derivatives session clock, computed from the real IST wall
 * clock regardless of which data provider is active:
 *   pre-open  09:00–09:15 IST (Mon–Fri)
 *   open      09:15–15:30 IST (Mon–Fri)
 *   closed    otherwise (exchange holidays are NOT modelled)
 */

interface ISTNow {
  /** 0 = Sunday. */
  day: number;
  minutesOfDay: number;
}

function istNow(epochMs: number): ISTNow {
  // IST is fixed UTC+05:30 (no DST), so offset arithmetic is safe.
  const ist = new Date(epochMs + 5.5 * 3600 * 1000);
  return {
    day: ist.getUTCDay(),
    minutesOfDay: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  };
}

const PRE_OPEN_START = 9 * 60;
const OPEN_START = 9 * 60 + 15;
const CLOSE = 15 * 60 + 30;

export function getMarketStatus(epochMs: number = Date.now()): MarketStatus {
  const { day, minutesOfDay } = istNow(epochMs);
  if (day === 0 || day === 6) return "closed";
  if (minutesOfDay >= PRE_OPEN_START && minutesOfDay < OPEN_START)
    return "pre-open";
  if (minutesOfDay >= OPEN_START && minutesOfDay < CLOSE) return "open";
  return "closed";
}

/** Epoch ms of 00:00 IST on the day containing `epochMs` — the boundary used
 *  to split "carried from a prior day" vs. "opened today" for day P&L. */
export function startOfIstDay(epochMs: number): number {
  const IST_OFFSET_MS = 5.5 * 3600 * 1000;
  const shifted = epochMs + IST_OFFSET_MS;
  const startOfShiftedDayUtc = Math.floor(shifted / 86_400_000) * 86_400_000;
  return startOfShiftedDayUtc - IST_OFFSET_MS;
}

export const MARKET_STATUS_LABEL: Record<MarketStatus, string> = {
  "pre-open": "Pre-open",
  open: "Market open",
  closed: "Market closed",
};
