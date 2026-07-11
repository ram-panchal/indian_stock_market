"use client";

import { memo, useState } from "react";
import Link from "next/link";
import type { Position } from "@/lib/trading/types";
import { useQuote } from "@/lib/hooks/use-quote";
import { formatPrice } from "@/lib/market/format";
import { unrealizedPnl } from "@/lib/trading/derive";
import { getPaperTradingEngine } from "@/lib/trading/engine";
import { useToast } from "@/components/ui/toast";
import { LtpCell, PnlText } from "@/components/market/price-cells";
import { SymbolChip } from "@/components/ui/symbol-chip";

export function PositionsTable({
  positions,
  holdingsMode = false,
}: {
  positions: Position[];
  /** Holdings view: long equity only, shows current value column. */
  holdingsMode?: boolean;
}) {
  if (positions.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-xs text-ink-3">
        {holdingsMode
          ? "No equity holdings. Buy a stock to see it here."
          : "No open positions."}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[11px] text-ink-3">
            <th className="px-3 py-2 font-normal">Instrument</th>
            <th className="px-3 py-2 text-right font-normal">Qty</th>
            <th className="px-3 py-2 text-right font-normal">Avg price</th>
            <th className="px-3 py-2 text-right font-normal">LTP</th>
            {holdingsMode ? (
              <th className="px-3 py-2 text-right font-normal">Value</th>
            ) : null}
            <th className="px-3 py-2 text-right font-normal">Unrealized P&L</th>
            <th className="px-3 py-2 text-right font-normal">Realized</th>
            <th className="w-20 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <PositionRow
              key={pos.instrument.token}
              position={pos}
              holdingsMode={holdingsMode}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PositionRow = memo(function PositionRow({
  position,
  holdingsMode,
}: {
  position: Position;
  holdingsMode: boolean;
}) {
  const inst = position.instrument;
  const quote = useQuote(inst.token);
  const toast = useToast();
  const pnl = unrealizedPnl(position, quote?.ltp);
  const [closing, setClosing] = useState(false);

  const closePosition = async () => {
    if (closing) return;
    setClosing(true);
    const result = await getPaperTradingEngine().placeOrder({
      instrument: inst,
      side: position.netQty > 0 ? "SELL" : "BUY",
      type: "MARKET",
      qty: Math.abs(position.netQty),
    });
    setClosing(false);
    toast(
      result.ok
        ? {
            tone: "success",
            title: `Closed ${inst.symbol}`,
            body: "Paper trade — no real order was placed.",
          }
        : { tone: "error", title: "Close failed", body: result.reason },
    );
  };

  return (
    <tr className="border-b border-border/50 hover:bg-surface-2">
      <td className="px-3 py-2">
        <Link
          href={`/charts?token=${encodeURIComponent(inst.token)}`}
          className="flex items-center gap-2"
        >
          <SymbolChip label={inst.symbol} round />
          <span className="font-medium text-ink">{inst.symbol}</span>
          <span
            className={`rounded px-1 py-0.5 text-[9px] ${
              position.netQty >= 0 ? "bg-up-muted text-up" : "bg-down-muted text-down"
            }`}
          >
            {position.netQty >= 0 ? "LONG" : "SHORT"}
          </span>
        </Link>
      </td>
      <td className="tnum px-3 py-2 text-right text-ink-2">{position.netQty}</td>
      <td className="tnum px-3 py-2 text-right text-ink-2">
        {formatPrice(position.avgPrice)}
      </td>
      <td className="px-3 py-2 text-right">
        <LtpCell token={inst.token} className="text-ink" />
      </td>
      {holdingsMode ? (
        <td className="tnum px-3 py-2 text-right text-ink-2">
          {quote ? formatPrice(quote.ltp * position.netQty) : "—"}
        </td>
      ) : null}
      <td className="px-3 py-2 text-right">
        <PnlText value={pnl} />
      </td>
      <td className="px-3 py-2 text-right">
        <PnlText value={position.realizedPnl} className="text-[11px]" />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={closePosition}
          disabled={closing}
          className="rounded border border-border px-2 py-0.5 text-[10px] text-ink-2 hover:border-down hover:text-down disabled:opacity-50"
        >
          {closing ? "Closing…" : "Close"}
        </button>
      </td>
    </tr>
  );
});
