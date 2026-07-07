/**
 * Pure derivations over the trade log. Every rupee shown in the UI comes
 * from these functions applied to the full history at read time — the engine
 * never stores a computed balance or P&L.
 */

import type { Quote } from "@/lib/market/types";
import type { PaperOrder, PaperState, PaperTrade, Position } from "./types";

export interface RealizedEvent {
  at: number;
  token: string;
  symbol: string;
  amount: number;
}

/** Average-cost position building (matches how Indian brokers display it). */
export function computePositions(
  trades: PaperTrade[],
  onRealized?: (event: RealizedEvent) => void,
): Position[] {
  const byToken = new Map<string, Position>();
  const sorted = [...trades].sort((a, b) => a.at - b.at);

  for (const trade of sorted) {
    let pos = byToken.get(trade.instrument.token);
    if (!pos) {
      pos = {
        instrument: trade.instrument,
        netQty: 0,
        avgPrice: 0,
        realizedPnl: 0,
        buyQty: 0,
        sellQty: 0,
        buyValue: 0,
        sellValue: 0,
      };
      byToken.set(trade.instrument.token, pos);
    }
    const signedQty = trade.side === "BUY" ? trade.qty : -trade.qty;
    if (trade.side === "BUY") {
      pos.buyQty += trade.qty;
      pos.buyValue += trade.qty * trade.price;
    } else {
      pos.sellQty += trade.qty;
      pos.sellValue += trade.qty * trade.price;
    }

    if (pos.netQty === 0 || Math.sign(pos.netQty) === Math.sign(signedQty)) {
      // Opening / adding: weighted-average entry price.
      const totalQty = Math.abs(pos.netQty) + trade.qty;
      pos.avgPrice =
        (pos.avgPrice * Math.abs(pos.netQty) + trade.price * trade.qty) / totalQty;
      pos.netQty += signedQty;
    } else {
      // Reducing / flipping: book realized P&L on the closed quantity.
      const closingQty = Math.min(Math.abs(pos.netQty), trade.qty);
      const direction = Math.sign(pos.netQty); // +1 closing a long, -1 a short
      const realized = (trade.price - pos.avgPrice) * closingQty * direction;
      pos.realizedPnl += realized;
      onRealized?.({
        at: trade.at,
        token: trade.instrument.token,
        symbol: trade.instrument.symbol,
        amount: realized,
      });
      pos.netQty += signedQty;
      if (pos.netQty === 0) {
        pos.avgPrice = 0;
      } else if (Math.sign(pos.netQty) !== direction) {
        // Flipped through zero: remainder opens at the trade price.
        pos.avgPrice = trade.price;
      }
    }
  }
  return [...byToken.values()];
}

/** Chronological realized-P&L bookings — feeds portfolio analytics. */
export function computeRealizedTimeline(trades: PaperTrade[]): RealizedEvent[] {
  const events: RealizedEvent[] = [];
  computePositions(trades, (e) => events.push(e));
  return events;
}

/** Cash = starting balance − all buys + all sells. Derived, never stored. */
export function computeCash(state: PaperState): number {
  let cash = state.startingBalance;
  for (const t of state.trades) {
    cash += (t.side === "SELL" ? 1 : -1) * t.qty * t.price;
  }
  return cash;
}

export function unrealizedPnl(pos: Position, ltp: number | undefined): number {
  if (pos.netQty === 0 || ltp === undefined) return 0;
  return (ltp - pos.avgPrice) * pos.netQty;
}

export function openOrders(orders: PaperOrder[]): PaperOrder[] {
  return orders.filter((o) => o.status === "OPEN");
}

/** Funds reserved by open BUY limit orders. */
export function reservedForOpenBuys(orders: PaperOrder[]): number {
  return openOrders(orders)
    .filter((o) => o.side === "BUY")
    .reduce((sum, o) => sum + o.qty * (o.limitPrice ?? 0), 0);
}

/** Open SELL-order quantity per token (blocks re-selling the same shares). */
export function openSellQty(orders: PaperOrder[], token: string): number {
  return openOrders(orders)
    .filter((o) => o.side === "SELL" && o.instrument.token === token)
    .reduce((sum, o) => sum + o.qty, 0);
}

/**
 * Margin blocked by short option positions:
 *   SHORT_OPTION_MARGIN_PCT × underlying notional per short unit.
 * Requires live underlying quotes; callers pass a token→Quote lookup.
 */
export function shortOptionMargin(
  positions: Position[],
  getUnderlyingQuote: (underlyingToken: string) => Quote | undefined,
  marginPct: number,
): number {
  let margin = 0;
  for (const pos of positions) {
    if (pos.instrument.segment !== "OPTION" || pos.netQty >= 0) continue;
    const underlying = pos.instrument.underlyingToken
      ? getUnderlyingQuote(pos.instrument.underlyingToken)
      : undefined;
    // Strike is a reasonable notional proxy when the spot isn't loaded yet.
    const ref = underlying?.ltp ?? pos.instrument.strike ?? 0;
    margin += Math.abs(pos.netQty) * ref * marginPct;
  }
  return margin;
}
