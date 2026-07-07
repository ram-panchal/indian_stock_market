"use client";

/**
 * PAPER TRADING ENGINE — the only place orders are "executed" in this app.
 *
 * Nothing here (or anywhere else in the codebase) talks to a broker. Fills
 * are simulated locally against the current market-data quote and persisted
 * to localStorage. Market data flows IN through the provider abstraction;
 * no order ever flows OUT.
 *
 * Documented simplifications vs a real broker:
 *  - Zero brokerage/taxes, no slippage beyond the bid/ask spread.
 *  - No intraday vs delivery product types; equity selling is capped at the
 *    currently held quantity (no naked equity shorts).
 *  - Short options are allowed with a flat 20%-of-notional margin block
 *    (SPAN is not modelled) and there are no mark-to-market margin calls.
 */

import type { Instrument, Quote } from "@/lib/market/types";
import { getProviderHandle } from "@/lib/market/provider-factory";
import { getPriceStore } from "@/lib/market/price-store";
import {
  computeCash,
  computePositions,
  openSellQty,
  reservedForOpenBuys,
  shortOptionMargin,
} from "./derive";
import {
  DEFAULT_STARTING_BALANCE,
  SHORT_OPTION_MARGIN_PCT,
  type OrderSide,
  type OrderType,
  type PaperOrder,
  type PaperState,
  type PaperTrade,
} from "./types";

const STORAGE_KEY = "im.paper.v1";

export interface PlaceOrderInput {
  instrument: Instrument;
  side: OrderSide;
  type: OrderType;
  qty: number;
  limitPrice?: number;
}

export type PlaceOrderResult =
  | { ok: true; order: PaperOrder }
  | { ok: false; reason: string };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function freshState(startingBalance: number): PaperState {
  return {
    version: 1,
    startingBalance,
    createdAt: Date.now(),
    orders: [],
    trades: [],
  };
}

export class PaperTradingEngine {
  private state: PaperState;
  private listeners = new Set<() => void>();
  /** orderId → unsubscribe for the limit-order tick watcher. */
  private watchers = new Map<string, () => void>();

  constructor() {
    this.state = this.load();
    // Re-arm watchers for limit orders that were open before a reload.
    for (const order of this.state.orders) {
      if (order.status === "OPEN") this.watchOrder(order.id);
    }
  }

  // ------------------------------------------------------------ store API

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = (): PaperState => this.state;

  private commit(next: PaperState): void {
    this.state = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Persistence is best-effort; in-memory state remains authoritative.
    }
    for (const cb of this.listeners) cb();
  }

  private load(): PaperState {
    if (typeof window === "undefined")
      return freshState(DEFAULT_STARTING_BALANCE);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState(DEFAULT_STARTING_BALANCE);
      const parsed = JSON.parse(raw) as PaperState;
      if (parsed.version !== 1 || !Array.isArray(parsed.trades))
        return freshState(DEFAULT_STARTING_BALANCE);
      return parsed;
    } catch {
      return freshState(DEFAULT_STARTING_BALANCE);
    }
  }

  // ------------------------------------------------------------- actions

  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const { instrument, side, type, qty } = input;

    if (!Number.isInteger(qty) || qty <= 0)
      return { ok: false, reason: "Quantity must be a positive whole number." };
    if (instrument.segment === "OPTION" && qty % instrument.lotSize !== 0)
      return {
        ok: false,
        reason: `Options trade in lots of ${instrument.lotSize}.`,
      };
    if (instrument.segment === "INDEX")
      return { ok: false, reason: "Indices are not directly tradable — trade their options." };
    if (type === "LIMIT") {
      const lp = input.limitPrice;
      if (lp === undefined || !Number.isFinite(lp) || lp <= 0)
        return { ok: false, reason: "Limit orders need a valid limit price." };
    }

    let quote: Quote;
    try {
      const handle = getProviderHandle();
      await handle.ready;
      quote = await handle.provider.getQuote(instrument.token);
    } catch {
      return { ok: false, reason: "No market data available for this instrument." };
    }

    const validation = await this.validate(input, quote);
    if (validation) return { ok: false, reason: validation };

    const order: PaperOrder = {
      id: newId(),
      createdAt: Date.now(),
      instrument,
      side,
      type,
      qty,
      limitPrice: input.limitPrice,
      status: "OPEN",
    };

    if (type === "MARKET") {
      // Fill at the touch: buy at ask, sell at bid (ltp fallback).
      const price = side === "BUY" ? quote.ask || quote.ltp : quote.bid || quote.ltp;
      this.commit(this.withFill({ ...this.state }, order, price));
      return { ok: true, order: { ...order, status: "FILLED" } };
    }

    const limit = input.limitPrice!;
    const marketable =
      side === "BUY" ? quote.ask > 0 && quote.ask <= limit : quote.bid >= limit;
    if (marketable) {
      const price = side === "BUY" ? quote.ask : quote.bid;
      this.commit(this.withFill({ ...this.state }, order, price));
      return { ok: true, order: { ...order, status: "FILLED" } };
    }

    this.commit({ ...this.state, orders: [...this.state.orders, order] });
    this.watchOrder(order.id);
    return { ok: true, order };
  }

  cancelOrder(orderId: string): void {
    const order = this.state.orders.find((o) => o.id === orderId);
    if (!order || order.status !== "OPEN") return;
    this.unwatchOrder(orderId);
    this.commit({
      ...this.state,
      orders: this.state.orders.map((o) =>
        o.id === orderId ? { ...o, status: "CANCELLED" as const } : o,
      ),
    });
  }

  reset(startingBalance: number = DEFAULT_STARTING_BALANCE): void {
    for (const unsub of this.watchers.values()) unsub();
    this.watchers.clear();
    this.commit(freshState(startingBalance));
  }

  // ---------------------------------------------------------- validation

  /** Returns a rejection reason, or null if the order is acceptable. */
  private async validate(
    input: PlaceOrderInput,
    quote: Quote,
  ): Promise<string | null> {
    const { instrument, side, qty, type } = input;
    const estPrice =
      type === "LIMIT" ? input.limitPrice! : side === "BUY" ? quote.ask || quote.ltp : quote.bid || quote.ltp;

    const positions = computePositions(this.state.trades);

    if (side === "SELL") {
      const pos = positions.find((p) => p.instrument.token === instrument.token);
      const held = pos?.netQty ?? 0;
      const alreadySelling = openSellQty(this.state.orders, instrument.token);
      if (instrument.segment === "EQUITY") {
        if (held - alreadySelling < qty)
          return `You hold ${Math.max(held - alreadySelling, 0)} sellable shares — short selling equities is not supported.`;
        return null;
      }
      // Short options need margin for the quantity that opens a short.
      const shortOpening = Math.max(qty - Math.max(held - alreadySelling, 0), 0);
      if (shortOpening > 0) {
        const available = await this.availableFunds(positions);
        const underlying = instrument.underlyingToken
          ? await this.tryQuote(instrument.underlyingToken)
          : undefined;
        const notionalRef = underlying?.ltp ?? instrument.strike ?? 0;
        const marginNeeded =
          shortOpening * notionalRef * SHORT_OPTION_MARGIN_PCT;
        if (marginNeeded > available)
          return `Insufficient margin: short needs ~₹${Math.round(marginNeeded).toLocaleString("en-IN")}, available ₹${Math.round(available).toLocaleString("en-IN")}.`;
      }
      return null;
    }

    // BUY: need cash for the full value (equity) or premium (options).
    const cost = qty * estPrice;
    const available = await this.availableFunds(positions);
    if (cost > available)
      return `Insufficient funds: needs ₹${Math.round(cost).toLocaleString("en-IN")}, available ₹${Math.round(available).toLocaleString("en-IN")}.`;
    return null;
  }

  private async availableFunds(
    positions = computePositions(this.state.trades),
  ): Promise<number> {
    const cash = computeCash(this.state);
    const reserved = reservedForOpenBuys(this.state.orders);
    const underlyingTokens = [
      ...new Set(
        positions
          .filter((p) => p.instrument.segment === "OPTION" && p.netQty < 0)
          .map((p) => p.instrument.underlyingToken)
          .filter((t): t is string => !!t),
      ),
    ];
    const quotes = new Map<string, Quote>();
    for (const token of underlyingTokens) {
      const q = await this.tryQuote(token);
      if (q) quotes.set(token, q);
    }
    const margin = shortOptionMargin(
      positions,
      (token) => quotes.get(token),
      SHORT_OPTION_MARGIN_PCT,
    );
    return cash - reserved - margin;
  }

  private async tryQuote(token: string): Promise<Quote | undefined> {
    try {
      const handle = getProviderHandle();
      await handle.ready;
      return await handle.provider.getQuote(token);
    } catch {
      return undefined;
    }
  }

  // -------------------------------------------------------------- filling

  private withFill(state: PaperState, order: PaperOrder, price: number): PaperState {
    const filled: PaperOrder = {
      ...order,
      status: "FILLED",
      fillPrice: price,
      filledAt: Date.now(),
    };
    const trade: PaperTrade = {
      id: newId(),
      orderId: order.id,
      instrument: order.instrument,
      side: order.side,
      qty: order.qty,
      price,
      at: filled.filledAt!,
    };
    const existing = state.orders.some((o) => o.id === order.id);
    return {
      ...state,
      orders: existing
        ? state.orders.map((o) => (o.id === order.id ? filled : o))
        : [...state.orders, filled],
      trades: [...state.trades, trade],
    };
  }

  /** Watch live ticks and fill an open LIMIT order when price crosses it. */
  private watchOrder(orderId: string): void {
    if (this.watchers.has(orderId)) return;
    const order = this.state.orders.find((o) => o.id === orderId);
    if (!order || order.status !== "OPEN" || order.limitPrice === undefined) return;

    const store = getPriceStore();
    const unsub = store.subscribe(order.instrument.token, () => {
      const quote = store.get(order.instrument.token);
      const current = this.state.orders.find((o) => o.id === orderId);
      if (!quote || !current || current.status !== "OPEN") {
        this.unwatchOrder(orderId);
        return;
      }
      const limit = current.limitPrice!;
      const crossed =
        current.side === "BUY" ? quote.ltp <= limit : quote.ltp >= limit;
      if (!crossed) return;
      this.unwatchOrder(orderId);
      // Fill at the limit price — the resting order's price, like a real book.
      this.commit(this.withFill({ ...this.state }, current, limit));
    });
    this.watchers.set(orderId, unsub);
  }

  private unwatchOrder(orderId: string): void {
    this.watchers.get(orderId)?.();
    this.watchers.delete(orderId);
  }
}

let engine: PaperTradingEngine | null = null;

export function getPaperTradingEngine(): PaperTradingEngine {
  if (!engine) engine = new PaperTradingEngine();
  return engine;
}
