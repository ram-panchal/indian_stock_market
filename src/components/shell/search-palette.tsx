"use client";

/** Global instrument search (Ctrl/Cmd+K). */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Instrument } from "@/lib/market/types";
import { getProviderHandle } from "@/lib/market/provider-factory";
import {
  addToWatchlist,
  isWatched,
  removeFromWatchlist,
  useWatchlist,
} from "@/lib/stores/watchlist-store";
import { useTradeTicket } from "@/components/trading/trade-ticket";
import { ChangeCell, LtpCell } from "@/components/market/price-cells";
import { SymbolChip } from "@/components/ui/symbol-chip";
import { INDEX_INSTRUMENTS, EQUITY_INSTRUMENTS } from "@/lib/market/angelone/universe";

const POPULAR: Instrument[] = [
  INDEX_INSTRUMENTS[0],
  INDEX_INSTRUMENTS[1],
  ...EQUITY_INSTRUMENTS.slice(0, 6),
].filter(Boolean);

export function SearchPalette({
  open,
  onClose,
  onCreateAlert,
}: {
  open: boolean;
  onClose: () => void;
  onCreateAlert: (instrument: Instrument) => void;
}) {
  const router = useRouter();
  const ticket = useTradeTicket();
  const watchlist = useWatchlist();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset while rendering on the closed→open transition (no effect setState).
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setResults([]);
      setHighlight(0);
    }
  }

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!open || !q) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const handle = getProviderHandle();
      await handle.ready;
      try {
        const found = await handle.provider.searchInstruments(q);
        if (!cancelled) {
          setResults(found);
          setHighlight(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  if (!open) return null;

  const openChart = (inst: Instrument) => {
    router.push(`/charts?token=${encodeURIComponent(inst.token)}`);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && results[highlight]) {
      openChart(results[highlight]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-90 flex items-start justify-center bg-black/55 p-4 pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--ink-3)" strokeWidth="1.5">
            <circle cx="6" cy="6" r="4.5" />
            <path d="M9.5 9.5L13 13" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              const value = e.target.value;
              setQuery(value);
              if (!value.trim()) {
                setResults([]);
                setHighlight(0);
              }
            }}
            onKeyDown={onKeyDown}
            placeholder="Search stocks & indices…"
            className="w-full bg-transparent py-3 text-sm text-ink outline-none placeholder:text-ink-3"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-ink-3">esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto scroll-thin">
          {query && results.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-ink-3">
              No instruments match “{query}”.
            </p>
          ) : null}
          {!query ? (
            <div className="py-1">
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-ink-3 uppercase">
                Popular
              </p>
              {POPULAR.map((inst) => (
                <button
                  key={inst.token}
                  onClick={() => openChart(inst)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2"
                >
                  <SymbolChip label={inst.symbol} size="md" round />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{inst.symbol}</p>
                    <p className="truncate text-[11px] text-ink-3">{inst.name}</p>
                  </div>
                  <div className="text-right text-xs">
                    <LtpCell token={inst.token} className="block text-ink" />
                    <ChangeCell token={inst.token} className="text-[11px]" />
                  </div>
                </button>
              ))}
              <p className="px-4 pt-2 pb-2 text-center text-[10px] text-ink-3">
                Search any NSE stock or index — Enter opens the chart.
              </p>
            </div>
          ) : null}
          {results.map((inst, i) => {
            const watched = isWatched(watchlist, inst.token);
            return (
              <div
                key={inst.token}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === highlight ? "bg-surface-2" : ""}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => openChart(inst)}
              >
                <SymbolChip label={inst.symbol} size="md" round />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {inst.symbol}
                    <span className="ml-2 rounded bg-surface-3 px-1 py-0.5 text-[9px] text-ink-3">
                      {inst.segment}
                    </span>
                  </p>
                  <p className="truncate text-[11px] text-ink-3">{inst.name}</p>
                </div>
                <div className="text-right text-xs">
                  <LtpCell token={inst.token} className="block text-ink" />
                  <ChangeCell token={inst.token} className="text-[11px]" />
                </div>
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {inst.segment !== "INDEX" ? (
                    <>
                      <ActionButton
                        label="B"
                        className="text-up hover:bg-up-muted"
                        title="Buy (paper)"
                        onClick={() => {
                          ticket.open(inst, "BUY");
                          onClose();
                        }}
                      />
                      <ActionButton
                        label="S"
                        className="text-down hover:bg-down-muted"
                        title="Sell (paper)"
                        onClick={() => {
                          ticket.open(inst, "SELL");
                          onClose();
                        }}
                      />
                    </>
                  ) : null}
                  <ActionButton
                    label={watched ? "★" : "☆"}
                    className={watched ? "text-warn" : "text-ink-3 hover:text-warn"}
                    title={watched ? "Remove from watchlist" : "Add to watchlist"}
                    onClick={() =>
                      watched ? removeFromWatchlist(inst.token) : addToWatchlist(inst)
                    }
                  />
                  <ActionButton
                    label="⏰"
                    className="text-ink-3 hover:text-accent"
                    title="Create alert"
                    onClick={() => {
                      onCreateAlert(inst);
                      onClose();
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  title,
  className,
  onClick,
}: {
  label: string;
  title: string;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded border border-border px-1.5 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {label}
    </button>
  );
}
