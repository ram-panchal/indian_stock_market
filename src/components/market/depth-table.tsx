"use client";

/** Five-level market depth / order book. Streams from subscribeDepth. */

import { useMarketDepth } from "@/lib/hooks/use-depth";
import { formatPrice, formatQty } from "@/lib/market/format";

export function DepthTable({ token }: { token: string }) {
  const depth = useMarketDepth(token);

  if (!depth) {
    return <p className="px-2 py-3 text-center text-xs text-ink-3">Loading depth…</p>;
  }

  const maxQty = Math.max(
    ...depth.bids.map((l) => l.qty),
    ...depth.asks.map((l) => l.qty),
    1,
  );
  const total = depth.totalBidQty + depth.totalAskQty || 1;
  const bidShare = (depth.totalBidQty / total) * 100;

  const bestBid = depth.bids[0]?.price ?? 0;
  const bestAsk = depth.asks[0]?.price ?? 0;
  const spread = bestBid > 0 && bestAsk > 0 ? bestAsk - bestBid : 0;
  const spreadPct = bestBid > 0 && spread > 0 ? (spread / bestBid) * 100 : 0;

  return (
    <div className="text-[11px]">
      {/* Best bid / ask / spread strip */}
      <div className="mb-2 grid grid-cols-3 items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1.5">
        <div>
          <p className="text-[9px] text-ink-3">Bid</p>
          <p className="tnum font-semibold text-up">{formatPrice(bestBid)}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-ink-3">Spread</p>
          <p className="tnum font-medium text-ink-2">
            {spread > 0 ? `${formatPrice(spread)} (${spreadPct.toFixed(2)}%)` : "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-ink-3">Ask</p>
          <p className="tnum font-semibold text-down">{formatPrice(bestAsk)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <table className="w-full">
          <thead>
            <tr className="text-ink-3">
              <th className="pb-1 text-left font-normal">Orders</th>
              <th className="pb-1 text-right font-normal">Qty</th>
              <th className="pb-1 text-right font-normal">Bid</th>
            </tr>
          </thead>
          <tbody>
            {depth.bids.map((l, i) => (
              <tr key={i} className="relative">
                <td className="tnum py-0.5 text-left text-ink-3">{l.orders}</td>
                <td className="tnum py-0.5 text-right text-ink-2">
                  <span
                    className="absolute inset-y-0 right-0 bg-up-muted"
                    style={{ width: `${(l.qty / maxQty) * 100}%` }}
                  />
                  <span className="relative">{formatQty(l.qty)}</span>
                </td>
                <td className="tnum relative py-0.5 text-right font-medium text-up">
                  {formatPrice(l.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="w-full">
          <thead>
            <tr className="text-ink-3">
              <th className="pb-1 text-left font-normal">Ask</th>
              <th className="pb-1 text-right font-normal">Qty</th>
              <th className="pb-1 text-right font-normal">Orders</th>
            </tr>
          </thead>
          <tbody>
            {depth.asks.map((l, i) => (
              <tr key={i} className="relative">
                <td className="tnum relative py-0.5 text-left font-medium text-down">
                  {formatPrice(l.price)}
                </td>
                <td className="tnum py-0.5 text-right text-ink-2">
                  <span
                    className="absolute inset-y-0 left-0 bg-down-muted"
                    style={{ width: `${(l.qty / maxQty) * 100}%` }}
                  />
                  <span className="relative">{formatQty(l.qty)}</span>
                </td>
                <td className="tnum py-0.5 text-right text-ink-3">{l.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2">
        <div className="flex justify-between text-ink-3">
          <span>
            Bid total <span className="tnum text-up">{formatQty(depth.totalBidQty)}</span>
          </span>
          <span className="tnum text-ink-2">{bidShare.toFixed(0)}% buy</span>
          <span>
            Ask total <span className="tnum text-down">{formatQty(depth.totalAskQty)}</span>
          </span>
        </div>
        <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-down-muted">
          <div className="bg-up" style={{ width: `${bidShare}%` }} />
        </div>
      </div>
    </div>
  );
}
