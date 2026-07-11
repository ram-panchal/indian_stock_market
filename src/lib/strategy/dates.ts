/**
 * IST calendar-date helpers for the strategy feature. Same IST-offset trick
 * as src/lib/market/status.ts (IST is fixed UTC+05:30, no DST, so plain
 * offset arithmetic is safe). No holiday calendar is modelled here either —
 * matches that file's existing, documented limitation.
 */

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function istParts(epochMs: number): { y: number; m: number; d: number; weekday: number } {
  const ist = new Date(epochMs + IST_OFFSET_MS);
  return {
    y: ist.getUTCFullYear(),
    m: ist.getUTCMonth() + 1,
    d: ist.getUTCDate(),
    weekday: ist.getUTCDay(), // 0 = Sunday
  };
}

function toIso(p: { y: number; m: number; d: number }): string {
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Epoch ms for IST noon on the given "YYYY-MM-DD" calendar date — a stable
 *  anchor for date arithmetic that avoids any midnight-boundary edge cases. */
function isoToIstNoonMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12, 0, 0) - IST_OFFSET_MS;
}

/** "YYYY-MM-DD" for the IST calendar date containing epochMs. */
export function istTodayIso(nowMs: number = Date.now()): string {
  return toIso(istParts(nowMs));
}

export function isWeekdayIso(iso: string): boolean {
  const { weekday } = istParts(isoToIstNoonMs(iso));
  return weekday !== 0 && weekday !== 6;
}

/** Add n trading days (Mon-Fri only). No holiday calendar is modelled. */
export function addTradingDays(fromIso: string, n: number): string {
  let ms = isoToIstNoonMs(fromIso);
  let remaining = n;
  while (remaining > 0) {
    ms += DAY_MS;
    if (istParts(ms).weekday !== 0 && istParts(ms).weekday !== 6) remaining--;
  }
  return toIso(istParts(ms));
}

/** Count of trading (Mon-Fri) days strictly between two ISO dates. */
export function tradingDaysBetween(aIso: string, bIso: string): number {
  let ms = isoToIstNoonMs(aIso);
  const bMs = isoToIstNoonMs(bIso);
  let count = 0;
  while (ms < bMs) {
    ms += DAY_MS;
    const { weekday } = istParts(ms);
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}
