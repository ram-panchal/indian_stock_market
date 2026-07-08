"use client";

/**
 * Charting workspace: symbol picker, timeframes, indicators, drawing tools,
 * live OHLC legend. Rendering is delegated to the ChartEngine seam —
 * currently LightweightChartEngine (open-source lightweight-charts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Candle, Instrument, Timeframe } from "@/lib/market/types";
import { TIMEFRAME_SECONDS } from "@/lib/market/types";
import { getProviderHandle } from "@/lib/market/provider-factory";
import { getPriceStore } from "@/lib/market/price-store";
import { formatCompact, formatPrice } from "@/lib/market/format";
import {
  INDICATOR_LABELS,
  type ChartEngine,
  type ChartTheme,
  type DrawingTool,
  type IndicatorId,
} from "@/lib/chart/chart-engine";
import { LightweightChartEngine } from "@/lib/chart/lightweight-engine";
import { useTheme } from "@/components/theme/theme-provider";
import { useTradeTicket } from "@/components/trading/trade-ticket";
import { ChangeCell, LtpCell } from "@/components/market/price-cells";
import { SymbolChip } from "@/components/ui/symbol-chip";
import { DepthTable } from "@/components/market/depth-table";

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "1d", label: "1D" },
];

const TOOLS: { value: DrawingTool; label: string; title: string }[] = [
  { value: "trendline", label: "╱", title: "Trend line (two clicks)" },
  { value: "hline", label: "─", title: "Horizontal line (one click)" },
  { value: "fib", label: "𝓕", title: "Fibonacci retracement (two clicks)" },
  { value: "erase", label: "⌫", title: "Erase drawing (click near it)" },
];

function readChartTheme(): ChartTheme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    background: v("--surface", "#10151d"),
    text: v("--ink-2", "#9aa7b8"),
    grid: v("--border", "#1f2733"),
    border: v("--border-strong", "#2c3646"),
    up: v("--up", "#12a984"),
    down: v("--down", "#f23645"),
    accent: v("--accent", "#4f8ef7"),
  };
}

export function ChartWorkspace({ initialToken }: { initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [indicators, setIndicators] = useState<IndicatorId[]>([]);
  const [tool, setTool] = useState<DrawingTool | null>(null);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [hovered, setHovered] = useState<Candle | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Loading" is derived: the chart has finished loading once the token+timeframe
  // it last rendered matches the current selection (no setState-in-effect).
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== `${token}|${timeframe}`;

  const { theme } = useTheme();
  const ticket = useTradeTicket();
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const lastBarRef = useRef<Candle | null>(null);

  // Resolve instrument metadata whenever the token changes.
  useEffect(() => {
    let cancelled = false;
    const handle = getProviderHandle();
    handle.ready
      .then(() => handle.provider.getInstrument(token))
      .then((inst) => {
        if (cancelled) return;
        if (!inst) setError(`Unknown instrument: ${token}`);
        else {
          setInstrument(inst);
          setError(null);
        }
      });
    // Keep the URL shareable without triggering a navigation.
    window.history.replaceState(null, "", `/charts?token=${encodeURIComponent(token)}`);
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Engine lifecycle.
  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new LightweightChartEngine(readChartTheme());
    engine.mount(containerRef.current);
    engine.onCrosshair(({ candle }) => setHovered(candle));
    engine.onToolDone(() => setTool(null));
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Re-theme in place (theme value change re-runs after the DOM attr flips).
  useEffect(() => {
    engineRef.current?.setTheme(readChartTheme());
  }, [theme]);

  // Load history + reconcile periodically (mock candle cache is cheap; a
  // real feed would replace the reconcile with proper bar streams).
  useEffect(() => {
    let cancelled = false;
    const load = async (fit: boolean) => {
      const handle = getProviderHandle();
      await handle.ready;
      try {
        const candles = await handle.provider.getCandles(token, timeframe, 500);
        if (cancelled || !engineRef.current) return;
        engineRef.current.setCandles(candles, timeframe, token, fit);
        lastBarRef.current = candles[candles.length - 1] ?? null;
        setError(candles.length === 0 ? "No candles returned for this symbol/timeframe." : null);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load candles");
      } finally {
        if (!cancelled) setLoadedKey(`${token}|${timeframe}`);
      }
    };
    load(true);
    const timer = setInterval(() => load(false), 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, timeframe]);

  // Live ticks → update the forming bar.
  useEffect(() => {
    const store = getPriceStore();
    const unsub = store.subscribe(token, () => {
      const quote = store.get(token);
      const engine = engineRef.current;
      if (!quote || !engine) return;
      const bucketSec = TIMEFRAME_SECONDS[timeframe];
      const bucket =
        Math.floor(quote.updatedAt / 1000 / bucketSec) * bucketSec;
      const last = lastBarRef.current;
      let bar: Candle;
      if (last && last.time === bucket) {
        bar = {
          ...last,
          close: quote.ltp,
          high: Math.max(last.high, quote.ltp),
          low: Math.min(last.low, quote.ltp),
        };
      } else if (last && bucket > last.time) {
        bar = {
          time: bucket,
          open: last.close,
          high: Math.max(last.close, quote.ltp),
          low: Math.min(last.close, quote.ltp),
          close: quote.ltp,
          volume: 0,
        };
      } else {
        return;
      }
      lastBarRef.current = bar;
      engine.updateLast(bar);
    });
    return unsub;
  }, [token, timeframe]);

  const applyIndicators = useCallback((ids: IndicatorId[]) => {
    setIndicators(ids);
    engineRef.current?.setIndicators(ids);
  }, []);

  const applyTool = useCallback((next: DrawingTool | null) => {
    setTool(next);
    engineRef.current?.setActiveTool(next);
  }, []);

  const legend = hovered;

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[420px] flex-col md:h-[calc(100dvh-5rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <SymbolPicker current={instrument} onSelect={(inst) => setToken(inst.token)} />
        {instrument ? (
          <span className="flex items-baseline gap-2 text-xs">
            <LtpCell token={token} className="font-semibold text-ink" />
            <ChangeCell token={token} showAbs />
          </span>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="flex rounded-md border border-border bg-surface-2 p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`rounded px-2 py-1 text-[11px] font-medium ${
                  timeframe === tf.value
                    ? "bg-surface-3 text-ink"
                    : "text-ink-3 hover:text-ink-2"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              onClick={() => setIndicatorsOpen((o) => !o)}
              className={`rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium ${
                indicators.length > 0 ? "text-accent" : "text-ink-2"
              } hover:bg-surface-3`}
            >
              Indicators{indicators.length > 0 ? ` (${indicators.length})` : ""}
            </button>
            {indicatorsOpen ? (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIndicatorsOpen(false)}
                />
                <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border border-border bg-surface-2 py-1 shadow-xl">
                  {(Object.keys(INDICATOR_LABELS) as IndicatorId[]).map((id) => {
                    const active = indicators.includes(id);
                    return (
                      <button
                        key={id}
                        onClick={() =>
                          applyIndicators(
                            active
                              ? indicators.filter((x) => x !== id)
                              : [...indicators, id],
                          )
                        }
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] text-ink-2 hover:bg-surface-3"
                      >
                        {INDICATOR_LABELS[id]}
                        {active ? <span className="text-accent">✓</span> : null}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>

          <div className="flex rounded-md border border-border bg-surface-2 p-0.5">
            {TOOLS.map((t) => (
              <button
                key={t.value}
                title={t.title}
                onClick={() => applyTool(tool === t.value ? null : t.value)}
                className={`rounded px-2 py-1 text-[11px] ${
                  tool === t.value
                    ? "bg-accent text-white"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              title="Clear all drawings"
              onClick={() => engineRef.current?.clearDrawings()}
              className="rounded px-2 py-1 text-[11px] text-ink-3 hover:text-down"
            >
              🗑
            </button>
          </div>

          {instrument && instrument.segment !== "INDEX" ? (
            <>
              <button
                onClick={() => ticket.open(instrument, "BUY")}
                className="rounded-md bg-up px-3 py-1.5 text-[11px] font-semibold text-white"
              >
                Buy
              </button>
              <button
                onClick={() => ticket.open(instrument, "SELL")}
                className="rounded-md bg-down px-3 py-1.5 text-[11px] font-semibold text-white"
              >
                Sell
              </button>
            </>
          ) : null}
        </div>
      </div>

      {legend ? (
        <div className="tnum flex gap-3 border-b border-border bg-surface px-3 py-1 text-[10px] text-ink-2">
          <span>O {formatPrice(legend.open)}</span>
          <span>H {formatPrice(legend.high)}</span>
          <span>L {formatPrice(legend.low)}</span>
          <span
            className={legend.close >= legend.open ? "text-up" : "text-down"}
          >
            C {formatPrice(legend.close)}
          </span>
          {legend.volume > 0 ? <span>Vol {formatCompact(legend.volume)}</span> : null}
        </div>
      ) : null}

      {error ? (
        <p className="border-b border-down bg-down-muted px-3 py-1.5 text-[11px] text-down">
          {error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <div ref={containerRef} className="absolute inset-0" />
          {loading ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-ink-3">
              Loading chart…
            </div>
          ) : null}
        </div>
        {instrument && instrument.segment !== "INDEX" ? (
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-border bg-surface p-3 lg:block">
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-2 uppercase">
              Order book
            </h3>
            <DepthTable token={token} />
          </aside>
        ) : null}
      </div>

      <p className="border-t border-border bg-surface px-3 py-1 text-[9px] text-ink-3">
        Rendered with TradingView&nbsp;lightweight-charts (open source). Times
        shown in IST.
      </p>
    </div>
  );
}

function SymbolPicker({
  current,
  onSelect,
}: {
  current: Instrument | null;
  onSelect: (inst: Instrument) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [prevOpen, setPrevOpen] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset while rendering on the closed→open transition (no effect setState).
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setResults([]);
    }
  }

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const handle = getProviderHandle();
      await handle.ready;
      const found = await handle.provider.searchInstruments(query);
      if (!cancelled) setResults(found);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-ink hover:bg-surface-3"
      >
        {current ? <SymbolChip label={current.symbol} round /> : null}
        {current?.symbol ?? "Select"}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M1 3l3 3 3-3" />
        </svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-50 mt-1 w-64 rounded-md border border-border bg-surface-2 shadow-xl">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                const value = e.target.value;
                setQuery(value);
                if (!value.trim()) setResults([]);
              }}
              placeholder="Search symbol…"
              className="w-full border-b border-border bg-transparent px-3 py-2 text-xs text-ink outline-none"
            />
            <div className="max-h-64 overflow-y-auto scroll-thin">
              {results.map((inst) => (
                <button
                  key={inst.token}
                  onClick={() => {
                    onSelect(inst);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-2 hover:bg-surface-3"
                >
                  <SymbolChip label={inst.symbol} round />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-ink">{inst.symbol}</span>
                    <span className="ml-1 truncate text-[10px] text-ink-3">{inst.name}</span>
                  </span>
                  <span className="text-[10px] text-ink-3">{inst.segment}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
