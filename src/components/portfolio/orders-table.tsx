"use client";

import type { PaperOrder, PaperTrade } from "@/lib/trading/types";
import { formatISTDateTime, formatPrice } from "@/lib/market/format";
import { getPaperTradingEngine } from "@/lib/trading/engine";

const STATUS_STYLE: Record<PaperOrder["status"], string> = {
  OPEN: "bg-accent-muted text-accent",
  FILLED: "bg-up-muted text-up",
  CANCELLED: "bg-surface-3 text-ink-3",
  REJECTED: "bg-down-muted text-down",
};

export function OrdersTable({ orders }: { orders: PaperOrder[] }) {
  if (orders.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-xs text-ink-3">
        No orders yet. Every order here is a paper order.
      </p>
    );
  }
  const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[11px] text-ink-3">
            <th className="px-3 py-2 font-normal">Time (IST)</th>
            <th className="px-3 py-2 font-normal">Instrument</th>
            <th className="px-3 py-2 font-normal">Side</th>
            <th className="px-3 py-2 font-normal">Type</th>
            <th className="px-3 py-2 text-right font-normal">Qty</th>
            <th className="px-3 py-2 text-right font-normal">Price</th>
            <th className="px-3 py-2 font-normal">Status</th>
            <th className="w-16 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((order) => (
            <tr key={order.id} className="border-b border-border/50 hover:bg-surface-2">
              <td className="tnum px-3 py-2 text-ink-3">
                {formatISTDateTime(order.createdAt)}
              </td>
              <td className="px-3 py-2 font-medium text-ink">
                {order.instrument.symbol}
              </td>
              <td className={`px-3 py-2 font-semibold ${order.side === "BUY" ? "text-up" : "text-down"}`}>
                {order.side}
              </td>
              <td className="px-3 py-2 text-ink-2">{order.type}</td>
              <td className="tnum px-3 py-2 text-right text-ink-2">{order.qty}</td>
              <td className="tnum px-3 py-2 text-right text-ink-2">
                {order.status === "FILLED"
                  ? formatPrice(order.fillPrice ?? 0)
                  : order.limitPrice !== undefined
                    ? `${formatPrice(order.limitPrice)} (lmt)`
                    : "mkt"}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[order.status]}`}
                  title={order.rejectReason}
                >
                  {order.status}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                {order.status === "OPEN" ? (
                  <button
                    onClick={() => getPaperTradingEngine().cancelOrder(order.id)}
                    className="rounded border border-border px-2 py-0.5 text-[10px] text-ink-2 hover:border-down hover:text-down"
                  >
                    Cancel
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TradesTable({ trades }: { trades: PaperTrade[] }) {
  if (trades.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-xs text-ink-3">No trades yet.</p>
    );
  }
  const sorted = [...trades].sort((a, b) => b.at - a.at);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[11px] text-ink-3">
            <th className="px-3 py-2 font-normal">Time (IST)</th>
            <th className="px-3 py-2 font-normal">Instrument</th>
            <th className="px-3 py-2 font-normal">Side</th>
            <th className="px-3 py-2 text-right font-normal">Qty</th>
            <th className="px-3 py-2 text-right font-normal">Price</th>
            <th className="px-3 py-2 text-right font-normal">Value</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((trade) => (
            <tr key={trade.id} className="border-b border-border/50 hover:bg-surface-2">
              <td className="tnum px-3 py-2 text-ink-3">{formatISTDateTime(trade.at)}</td>
              <td className="px-3 py-2 font-medium text-ink">
                {trade.instrument.symbol}
              </td>
              <td className={`px-3 py-2 font-semibold ${trade.side === "BUY" ? "text-up" : "text-down"}`}>
                {trade.side}
              </td>
              <td className="tnum px-3 py-2 text-right text-ink-2">{trade.qty}</td>
              <td className="tnum px-3 py-2 text-right text-ink-2">
                {formatPrice(trade.price)}
              </td>
              <td className="tnum px-3 py-2 text-right text-ink-2">
                {formatPrice(trade.qty * trade.price)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
