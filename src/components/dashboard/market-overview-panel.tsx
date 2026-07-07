"use client";

import Link from "next/link";
import { memo, useState } from "react";
import type { ListedQuote } from "@/lib/market/types";
import { usePolled } from "@/lib/hooks/use-polled";
import { useQuote } from "@/lib/hooks/use-quote";
import { formatCompact, formatISTTime, formatPrice } from "@/lib/market/format";
import {
  get52WLists,
  getAllListedQuotes,
} from "@/lib/market/dashboard-extras";
import {
  addToWatchlist,
  isWatched,
  removeFromWatchlist,
  useWatchlist,
} from "@/lib/stores/watchlist-store";
import { useTradeTicket } from "@/components/trading/trade-ticket";
import { ChangeCell, LtpCell } from "@/components/market/price-cells";
import { SymbolChip } from "@/components/ui/symbol-chip";
import { Panel, PanelFooterButton, PanelHeader } from "./panel";

type Tab = "gainers" | "losers" | "active" | "high52" | "low52";

const TABS: readonly [Tab, string][] = [
  ["gainers", "Top Gainers"],
  ["losers", "Top Losers"],
  ["active", "Most Active"],
  ["high52", "52W High"],
  ["low52", "52W Low"],
];

function sortAll(all: ListedQuote[], tab: Tab): ListedQuote[] {
  const rows = [...all];
  if (tab === "losers")
    return rows.sort((a, b) => a.quote.changePercent - b.quote.changePercent);
  if (tab === "active")
    return rows.sort(
      (a, b) => b.quote.ltp * b.quote.volume - a.quote.ltp * a.quote.volume,
    );
  return rows.sort((a, b) => b.quote.changePercent - a.quote.changePercent);
}

export function MarketOverviewPanel() {
  const [tab, setTab] = useState<Tab>("gainers");
  const [expanded, setExpanded] = useState(false);

  const is52W = tab === "high52" || tab === "low52";
  const { data: rows, updatedAt } = usePolled<ListedQuote[]>(
    async (p) => {
      if (is52W) {
        const lists = await get52WLists(p);
        const arr = tab === "high52" ? lists.high : lists.low;
        return expanded ? arr : arr.slice(0, 8);
      }
      if (expanded) return sortAll(await getAllListedQuotes(p), tab);
      const movers = await p.getMovers();
      return tab === "gainers"
        ? movers.gainers
        : tab === "losers"
          ? movers.losers
          : movers.mostActive;
    },
    is52W || expanded ? 5000 : 3000,
    [tab, expanded],
  );

  return (
    <Panel>
      <PanelHeader
        icon="📊"
        title="Market Overview"
        right={
          updatedAt ? (
            <span className="hidden text-[10px] text-ink-3 sm:block">
              Updated {formatISTTime(updatedAt)} IST
            </span>
          ) : null
        }
      />
      <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === value
                ? "bg-accent-muted text-accent"
                : "text-ink-3 hover:text-ink-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-ink-3">
              <th className="w-8 px-3 py-2 font-normal">#</th>
              <th className="px-3 py-2 font-normal">Stock</th>
              <th className="px-3 py-2 text-right font-normal">LTP</th>
              <th className="px-3 py-2 text-right font-normal">Change</th>
              <th className="px-3 py-2 text-right font-normal">Change %</th>
              <th className="px-3 py-2 text-right font-normal">Volume</th>
              <th className="px-3 py-2 text-right font-normal">Value</th>
              <th className="w-24 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {!rows || rows.length === 0
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td colSpan={8} className="px-3 py-2.5">
                      <div className="h-3.5 animate-pulse rounded bg-surface-2" />
                    </td>
                  </tr>
                ))
              : rows.map((entry, i) => (
                  <OverviewRow
                    key={entry.instrument.token}
                    entry={entry}
                    rank={i + 1}
                  />
                ))}
          </tbody>
        </table>
      </div>
      <PanelFooterButton
        label={expanded ? "Show Top 8" : "View All Stocks"}
        onClick={() => setExpanded((e) => !e)}
      />
    </Panel>
  );
}

const AbsChangeCell = memo(function AbsChangeCell({ token }: { token: string }) {
  const quote = useQuote(token);
  if (!quote) return <span className="tnum text-ink-3">—</span>;
  const up = quote.change >= 0;
  return (
    <span className={`tnum ${up ? "text-up" : "text-down"}`}>
      {up ? "+" : ""}
      {formatPrice(quote.change)}
    </span>
  );
});

const OverviewRow = memo(
  function OverviewRow({ entry, rank }: { entry: ListedQuote; rank: number }) {
    const ticket = useTradeTicket();
    const watchlist = useWatchlist();
    const inst = entry.instrument;
    const watched = isWatched(watchlist, inst.token);

    return (
      <tr className="group border-b border-border/50 hover:bg-surface-2">
        <td className="tnum px-3 py-2 text-ink-3">{rank}</td>
        <td className="px-3 py-2">
          <Link
            href={`/charts?token=${encodeURIComponent(inst.token)}`}
            className="flex items-center gap-2"
          >
            <SymbolChip label={inst.symbol} />
            <span className="font-medium text-ink">{inst.symbol}</span>
            <span className="hidden text-[10px] text-ink-3 lg:inline">
              {inst.name}
            </span>
          </Link>
        </td>
        <td className="px-3 py-2 text-right">
          <LtpCell token={inst.token} className="text-ink" />
        </td>
        <td className="px-3 py-2 text-right">
          <AbsChangeCell token={inst.token} />
        </td>
        <td className="px-3 py-2 text-right">
          <ChangeCell token={inst.token} />
        </td>
        {/* Volume/value come from the snapshot poll, not per-tick */}
        <td className="tnum px-3 py-2 text-right text-ink-2">
          {formatCompact(entry.quote.volume)}
        </td>
        <td className="tnum px-3 py-2 text-right text-ink-2">
          ₹{formatCompact(entry.quote.volume * entry.quote.ltp)}
        </td>
        <td className="px-3 py-2">
          <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => ticket.open(inst, "BUY")}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-up hover:bg-up-muted"
            >
              B
            </button>
            <button
              onClick={() => ticket.open(inst, "SELL")}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-down hover:bg-down-muted"
            >
              S
            </button>
            <button
              onClick={() =>
                watched ? removeFromWatchlist(inst.token) : addToWatchlist(inst)
              }
              className={`rounded border border-border px-1.5 py-0.5 text-[10px] ${watched ? "text-warn" : "text-ink-3 hover:text-warn"}`}
              title="Watchlist"
            >
              {watched ? "★" : "☆"}
            </button>
          </div>
        </td>
      </tr>
    );
  },
  (prev, next) =>
    prev.entry.instrument.token === next.entry.instrument.token &&
    prev.entry.quote.volume === next.entry.quote.volume &&
    prev.entry.quote.ltp === next.entry.quote.ltp &&
    prev.rank === next.rank,
);
