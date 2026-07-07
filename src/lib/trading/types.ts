import type { Instrument } from "@/lib/market/types";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus = "OPEN" | "FILLED" | "CANCELLED" | "REJECTED";

export interface PaperOrder {
  id: string;
  createdAt: number;
  /** Full instrument snapshot so history stays readable after expiries. */
  instrument: Instrument;
  side: OrderSide;
  type: OrderType;
  /** Always in units (shares / option units = lots × lotSize). */
  qty: number;
  limitPrice?: number;
  status: OrderStatus;
  fillPrice?: number;
  filledAt?: number;
  rejectReason?: string;
}

export interface PaperTrade {
  id: string;
  orderId: string;
  instrument: Instrument;
  side: OrderSide;
  qty: number;
  price: number;
  at: number;
}

/**
 * The ONLY persisted trading state. Cash, positions, and P&L are always
 * re-derived from `trades` (see derive.ts) — there are no running totals
 * anywhere, so nothing can drift.
 */
export interface PaperState {
  version: 1;
  startingBalance: number;
  createdAt: number;
  orders: PaperOrder[];
  trades: PaperTrade[];
}

export interface Position {
  instrument: Instrument;
  /** Signed: positive long, negative short. */
  netQty: number;
  /** Average cost of the open quantity (average-cost method). */
  avgPrice: number;
  /** Realized P&L booked on this instrument so far. */
  realizedPnl: number;
  buyQty: number;
  sellQty: number;
  buyValue: number;
  sellValue: number;
}

export const DEFAULT_STARTING_BALANCE = 1_000_000; // ₹10,00,000

/** Flat margin on short option notional. Deliberately simple stand-in for
 *  SPAN+exposure — documented simplification of the paper engine. */
export const SHORT_OPTION_MARGIN_PCT = 0.2;
