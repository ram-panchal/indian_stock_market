"use client";

/**
 * Order ticket for the PAPER trading engine. Openable from anywhere via
 * useTradeTicket(). No path from this UI reaches a real broker — orders go
 * to src/lib/trading/engine.ts only.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Instrument } from "@/lib/market/types";
import { formatINR, formatPrice } from "@/lib/market/format";
import { useQuote } from "@/lib/hooks/use-quote";
import { usePaperState } from "@/lib/hooks/use-paper-trading";
import { getPaperTradingEngine } from "@/lib/trading/engine";
import { computeCash, reservedForOpenBuys } from "@/lib/trading/derive";
import { SHORT_OPTION_MARGIN_PCT, type OrderSide, type OrderType } from "@/lib/trading/types";
import { useToast } from "@/components/ui/toast";
import { Segmented } from "@/components/ui/segmented";
import { ChangeCell, LtpCell } from "@/components/market/price-cells";

interface TicketRequest {
  instrument: Instrument;
  side: OrderSide;
}

const TradeTicketContext = createContext<{
  open: (instrument: Instrument, side?: OrderSide) => void;
}>({ open: () => {} });

export function useTradeTicket() {
  return useContext(TradeTicketContext);
}

export function TradeTicketProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<TicketRequest | null>(null);

  const open = useCallback((instrument: Instrument, side: OrderSide = "BUY") => {
    setRequest({ instrument, side });
  }, []);

  return (
    <TradeTicketContext.Provider value={{ open }}>
      {children}
      {request ? (
        <TicketPanel
          key={`${request.instrument.token}|${request.side}`}
          request={request}
          onClose={() => setRequest(null)}
        />
      ) : null}
    </TradeTicketContext.Provider>
  );
}

function TicketPanel({
  request,
  onClose,
}: {
  request: TicketRequest;
  onClose: () => void;
}) {
  const { instrument } = request;
  const isOption = instrument.segment === "OPTION";
  const quote = useQuote(instrument.token);
  const underlyingQuote = useQuote(isOption ? instrument.underlyingToken : null);
  const paperState = usePaperState();
  const toast = useToast();

  const [side, setSide] = useState<OrderSide>(request.side);
  const [type, setType] = useState<OrderType>("MARKET");
  const [lots, setLots] = useState(1);
  const [limitInput, setLimitInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const qty = isOption ? lots * instrument.lotSize : lots;
  const limitPrice = Number.parseFloat(limitInput);
  const estPrice =
    type === "LIMIT" && Number.isFinite(limitPrice) && limitPrice > 0
      ? limitPrice
      : side === "BUY"
        ? (quote?.ask ?? quote?.ltp ?? 0)
        : (quote?.bid ?? quote?.ltp ?? 0);
  const estValue = qty * estPrice;
  const shortMarginEst =
    isOption && side === "SELL" && underlyingQuote
      ? qty * underlyingQuote.ltp * SHORT_OPTION_MARGIN_PCT
      : 0;

  // Approximate — excludes live short-option margin, which the engine
  // recomputes precisely at order time.
  const fundsAvailable = useMemo(
    () => computeCash(paperState) - reservedForOpenBuys(paperState.orders),
    [paperState],
  );

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const result = await getPaperTradingEngine().placeOrder({
      instrument,
      side,
      type,
      qty,
      limitPrice: type === "LIMIT" ? limitPrice : undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    const filled = result.order.status === "FILLED";
    toast({
      tone: "success",
      title: filled
        ? `${side === "BUY" ? "Bought" : "Sold"} ${qty} × ${instrument.symbol} @ ₹${formatPrice(result.order.fillPrice ?? estPrice)}`
        : `Limit order placed: ${side} ${qty} × ${instrument.symbol} @ ₹${formatPrice(limitPrice)}`,
      body: "Paper trade — no real order was placed.",
    });
    onClose();
  };

  const sideColor = side === "BUY" ? "bg-up" : "bg-down";

  return (
    <>
      <div className="fixed inset-0 z-70 bg-black/40" onClick={onClose} />
      <aside className="fixed inset-x-0 bottom-0 z-80 flex max-h-[92vh] flex-col rounded-t-xl border border-border bg-surface shadow-2xl sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-[380px] sm:rounded-none sm:border-y-0 sm:border-r-0">
        <header className="flex items-start justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-ink">
                {instrument.symbol}
              </h2>
              <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-2">
                {instrument.exchange}
              </span>
            </div>
            <p className="mt-0.5 flex items-baseline gap-2 text-sm">
              <LtpCell token={instrument.token} className="text-ink" />
              <ChangeCell token={instrument.token} className="text-xs" />
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-ink"
            aria-label="Close ticket"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 scroll-thin">
          <div className="grid grid-cols-2 gap-2">
            {(["BUY", "SELL"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`rounded-md border py-2 text-sm font-semibold transition-colors ${
                  side === s
                    ? s === "BUY"
                      ? "border-up bg-up-muted text-up"
                      : "border-down bg-down-muted text-down"
                    : "border-border text-ink-3 hover:text-ink-2"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs text-ink-2">
              {isOption ? `Lots (1 lot = ${instrument.lotSize})` : "Quantity"}
            </label>
            <div className="flex items-stretch gap-1">
              <button
                className="w-9 rounded-md border border-border text-ink-2 hover:bg-surface-3"
                onClick={() => setLots((l) => Math.max(1, l - 1))}
              >
                −
              </button>
              <input
                type="number"
                min={1}
                value={lots}
                onChange={(e) =>
                  setLots(Math.max(1, Math.floor(Number(e.target.value) || 1)))
                }
                className="tnum w-full rounded-md border border-border bg-surface-2 px-3 py-1.5 text-center text-sm text-ink outline-none focus:border-accent"
              />
              <button
                className="w-9 rounded-md border border-border text-ink-2 hover:bg-surface-3"
                onClick={() => setLots((l) => l + 1)}
              >
                +
              </button>
            </div>
            {isOption ? (
              <p className="tnum mt-1 text-right text-[11px] text-ink-3">
                = {qty} units
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs text-ink-2">Order type</label>
            <Segmented
              options={[
                { value: "MARKET", label: "Market" },
                { value: "LIMIT", label: "Limit" },
              ]}
              value={type}
              onChange={(v) => {
                setType(v);
                if (v === "LIMIT" && !limitInput && quote)
                  setLimitInput(String(quote.ltp));
              }}
            />
          </div>

          {type === "LIMIT" ? (
            <div>
              <label className="mb-1 block text-xs text-ink-2">Limit price</label>
              <input
                type="number"
                step={instrument.tickSize}
                min={0}
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                className="tnum w-full rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
                placeholder="0.00"
              />
            </div>
          ) : null}

          <dl className="space-y-1.5 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-ink-3">
                Est. {side === "BUY" ? "cost" : "proceeds"}
              </dt>
              <dd className="tnum text-ink">{formatINR(estValue)}</dd>
            </div>
            {shortMarginEst > 0 ? (
              <div className="flex justify-between">
                <dt className="text-ink-3">
                  Est. short margin ({SHORT_OPTION_MARGIN_PCT * 100}% notional)
                </dt>
                <dd className="tnum text-warn">{formatINR(shortMarginEst)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-1.5">
              <dt className="text-ink-3">Funds available</dt>
              <dd className="tnum text-ink-2">{formatINR(fundsAvailable)}</dd>
            </div>
          </dl>

          {error ? (
            <p className="rounded-md border border-down bg-down-muted px-3 py-2 text-xs text-down">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="border-t border-border px-4 py-3">
          <button
            onClick={submit}
            disabled={submitting || !quote}
            className={`w-full rounded-md py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50 ${sideColor}`}
          >
            {submitting
              ? "Placing…"
              : `${side} ${isOption ? `${lots} lot${lots > 1 ? "s" : ""}` : `${qty}`} · Paper`}
          </button>
          <p className="mt-2 text-center text-[10px] text-ink-3">
            Paper trading only — no real orders are ever placed.
          </p>
        </footer>
      </aside>
    </>
  );
}
