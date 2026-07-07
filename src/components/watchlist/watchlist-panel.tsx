"use client";

import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Instrument } from "@/lib/market/types";
import {
  removeFromWatchlist,
  useWatchlist,
  type WatchlistItem,
} from "@/lib/stores/watchlist-store";
import { useTradeTicket } from "@/components/trading/trade-ticket";
import { ChangeCell, LtpCell } from "@/components/market/price-cells";
import { DepthTable } from "@/components/market/depth-table";

export function WatchlistPanel({
  onSearch,
  onCreateAlert,
}: {
  onSearch: () => void;
  onCreateAlert: (instrument: Instrument) => void;
}) {
  const items = useWatchlist();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <h2 className="text-xs font-semibold tracking-wide text-ink-2 uppercase">
          Watchlist
        </h2>
        <button
          onClick={onSearch}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-ink-2 hover:bg-surface-3"
        >
          + Add
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-ink-3">
            Empty watchlist — search (Ctrl+K) and star instruments to track
            them here.
          </p>
        ) : (
          items.map((item) => (
            <WatchlistRow
              key={item.token}
              item={item}
              expanded={expanded === item.token}
              onToggle={() =>
                setExpanded((e) => (e === item.token ? null : item.token))
              }
              onCreateAlert={onCreateAlert}
            />
          ))
        )}
      </div>
    </div>
  );
}

const WatchlistRow = memo(function WatchlistRow({
  item,
  expanded,
  onToggle,
  onCreateAlert,
}: {
  item: WatchlistItem;
  expanded: boolean;
  onToggle: () => void;
  onCreateAlert: (instrument: Instrument) => void;
}) {
  const router = useRouter();
  const ticket = useTradeTicket();
  const inst = item.instrument;
  const tradable = inst.segment !== "INDEX";

  return (
    <div className="group border-b border-border/60">
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-surface-2"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink">{inst.symbol}</p>
          <p className="truncate text-[10px] text-ink-3">{inst.name}</p>
        </div>
        <div className="text-right">
          <LtpCell token={inst.token} className="block text-xs text-ink" />
          <ChangeCell token={inst.token} className="text-[10px]" />
        </div>
      </div>
      {expanded ? (
        <div className="border-t border-border/60 bg-surface-2 px-3 py-2.5">
          <div className="mb-2 flex items-center gap-1.5">
            {tradable ? (
              <>
                <button
                  onClick={() => ticket.open(inst, "BUY")}
                  className="rounded bg-up px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  Buy
                </button>
                <button
                  onClick={() => ticket.open(inst, "SELL")}
                  className="rounded bg-down px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  Sell
                </button>
              </>
            ) : null}
            <button
              onClick={() =>
                router.push(`/charts?token=${encodeURIComponent(inst.token)}`)
              }
              className="rounded border border-border px-2.5 py-1 text-[11px] text-ink-2 hover:bg-surface-3"
            >
              Chart
            </button>
            <button
              onClick={() => onCreateAlert(inst)}
              className="rounded border border-border px-2.5 py-1 text-[11px] text-ink-2 hover:bg-surface-3"
            >
              Alert
            </button>
            <button
              onClick={() => removeFromWatchlist(inst.token)}
              className="ml-auto rounded border border-border px-2 py-1 text-[11px] text-ink-3 hover:text-down"
              title="Remove"
            >
              ✕
            </button>
          </div>
          <DepthTable token={inst.token} />
        </div>
      ) : null}
    </div>
  );
});
