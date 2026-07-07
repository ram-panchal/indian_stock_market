/**
 * Formatting helpers. All locale-sensitive output pins `en-IN` so server and
 * client render identically (avoids hydration mismatches).
 */

const inr2 = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inr0 = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

export function formatPrice(value: number, decimals: 0 | 2 = 2): string {
  if (!Number.isFinite(value)) return "—";
  return decimals === 0 ? inr0.format(value) : inr2.format(value);
}

export function formatINR(value: number, decimals: 0 | 2 = 2): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}₹${formatPrice(Math.abs(value), decimals)}`;
}

/** Indian compact notation: 1.24Cr, 45.60L, 12.3K. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${inr0.format(abs)}`;
}

export function formatChange(change: number, changePercent: number): string {
  if (!Number.isFinite(change)) return "—";
  const sign = change > 0 ? "+" : "";
  return `${sign}${formatPrice(change)} (${sign}${changePercent.toFixed(2)}%)`;
}

export function formatPercent(value: number, signed = true): string {
  if (!Number.isFinite(value)) return "—";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return inr0.format(value);
}

const istTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const istDateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const istDate = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatISTTime(epochMs: number): string {
  return istTime.format(new Date(epochMs));
}

export function formatISTDateTime(epochMs: number): string {
  return istDateTime.format(new Date(epochMs));
}

export function formatExpiry(isoDate: string): string {
  // isoDate is "YYYY-MM-DD"; render as "30 Jul 2026" without TZ ambiguity.
  return istDate.format(new Date(`${isoDate}T12:00:00+05:30`));
}
