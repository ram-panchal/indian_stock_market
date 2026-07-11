/**
 * Position-size calculation. Pure math only — assembling totalEquity /
 * availableCash (which needs live quotes for any open positions) is the
 * caller's job (scripts/commit-decision.ts).
 */

const POSITION_SIZE_PCT_OF_EQUITY = 0.1;

export interface SizingResult {
  qty: number;
  positionValue: number;
}

/**
 * 10% of total mark-to-market equity per pick (cash + current value of open
 * positions — not just free cash), capped by actually-available cash. Sizing
 * off total equity rather than free cash alone keeps risk-per-trade
 * consistent regardless of how many positions happen to already be open.
 * Rounds down to whole shares; returns null when even 1 share is unaffordable
 * (e.g. an MRF-like ₹1L+/share stock) so the caller can fall through to the
 * next ranked candidate instead of forcing a degenerate trade.
 */
export function computePositionSize(
  totalEquity: number,
  availableCash: number,
  entryPrice: number,
): SizingResult | null {
  if (entryPrice <= 0) return null;
  const budget = Math.min(POSITION_SIZE_PCT_OF_EQUITY * totalEquity, availableCash);
  const qty = Math.floor(budget / entryPrice);
  if (qty < 1) return null;
  return { qty, positionValue: qty * entryPrice };
}
