import type { Candle, Timeframe } from "@/lib/market/types";

/**
 * Charting seam.
 *
 * The working implementation is LightweightChartEngine (TradingView's
 * open-source `lightweight-charts` package — free, Apache-2.0). TradingView's
 * "Advanced Charts" widget library requires a signed license agreement, so it
 * is NOT bundled; if a license is obtained later, implement this interface
 * with it and swap the constructor in ChartContainer — nothing else changes.
 */

export type IndicatorId =
  | "sma20"
  | "ema50"
  | "bb20"
  | "vwap"
  | "rsi14"
  | "macd";

export const INDICATOR_LABELS: Record<IndicatorId, string> = {
  sma20: "SMA 20",
  ema50: "EMA 50",
  bb20: "Bollinger (20, 2)",
  vwap: "VWAP",
  rsi14: "RSI 14",
  macd: "MACD (12, 26, 9)",
};

export type DrawingTool = "trendline" | "hline" | "fib" | "erase";

export interface ChartTheme {
  background: string;
  text: string;
  grid: string;
  border: string;
  up: string;
  down: string;
  accent: string;
}

export interface CrosshairInfo {
  candle: Candle | null;
}

export interface ChartEngine {
  mount(container: HTMLElement): void;
  destroy(): void;
  setTheme(theme: ChartTheme): void;
  /** Replace all data. `chartKey` scopes drawing persistence (e.g. token).
   *  Pass fit=false for background reconciles that must not reset the view. */
  setCandles(
    candles: Candle[],
    timeframe: Timeframe,
    chartKey: string,
    fit?: boolean,
  ): void;
  /** Merge/append the live forming bar. */
  updateLast(candle: Candle): void;
  setIndicators(ids: IndicatorId[]): void;
  onCrosshair(cb: (info: CrosshairInfo) => void): void;
  fitContent(): void;
  setActiveTool(tool: DrawingTool | null): void;
  /** Fires when a one-shot tool finishes so the toolbar can deselect. */
  onToolDone(cb: () => void): void;
  clearDrawings(): void;
}
