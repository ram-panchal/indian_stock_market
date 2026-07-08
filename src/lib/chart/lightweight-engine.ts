"use client";

/**
 * ChartEngine implementation on TradingView's OPEN-SOURCE `lightweight-charts`
 * v5 (Apache-2.0) — this is the library actually running in the app. See
 * chart-engine.ts for why licensed "Advanced Charts" is not used.
 */

import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Timeframe } from "@/lib/market/types";
import { bollinger, ema, macd, rsi, sma, vwap } from "@/lib/indicators";
import type {
  ChartEngine,
  ChartTheme,
  CrosshairInfo,
  DrawingTool,
  IndicatorId,
} from "./chart-engine";
import { DrawingLayer } from "./drawings";

/** Display-only shift so intraday bars label in IST for every viewer
 *  (lightweight-charts renders timestamps as UTC). */
const IST_SHIFT_SEC = 5.5 * 3600;

type AnySeries = ISeriesApi<"Line"> | ISeriesApi<"Histogram">;

export class LightweightChartEngine implements ChartEngine {
  private chart: IChartApi | null = null;
  private candleSeries: ISeriesApi<"Candlestick"> | null = null;
  private volumeSeries: ISeriesApi<"Histogram"> | null = null;
  private indicatorSeries = new Map<string, AnySeries>();
  private drawingLayer: DrawingLayer | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private candles: Candle[] = [];
  private timeframe: Timeframe = "5m";
  private activeIndicators: IndicatorId[] = [];
  private theme: ChartTheme;
  private crosshairCb: ((info: CrosshairInfo) => void) | null = null;
  private toolDoneCb: (() => void) | null = null;

  constructor(theme: ChartTheme) {
    this.theme = theme;
  }

  mount(container: HTMLElement): void {
    const t = this.theme;
    // Explicit sizing instead of `autoSize`: inside a flex/absolute layout the
    // library's internal ResizeObserver can latch onto a 0-height box at mount
    // and never recover (chart collapses to just its time axis). We seed the
    // real size immediately and keep it in sync ourselves.
    const initialWidth = container.clientWidth || 600;
    const initialHeight = container.clientHeight || 400;
    this.chart = createChart(container, {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { color: "transparent" },
        textColor: t.text,
        panes: { separatorColor: t.border, enableResize: true },
        attributionLogo: true, // required by lightweight-charts license terms
      },
      grid: {
        vertLines: { color: t.grid },
        horzLines: { color: t.grid },
      },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: t.border },
      timeScale: {
        borderColor: t.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
    });

    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: t.up,
      downColor: t.down,
      borderUpColor: t.up,
      borderDownColor: t.down,
      wickUpColor: t.up,
      wickDownColor: t.down,
    });

    this.volumeSeries = this.chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    this.chart
      .priceScale("volume")
      .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    this.chart.subscribeCrosshairMove((param) => {
      if (!this.crosshairCb || !this.candleSeries) return;
      const bar = param.seriesData.get(this.candleSeries) as
        | { open: number; high: number; low: number; close: number; time: number }
        | undefined;
      if (!bar) {
        this.crosshairCb({ candle: null });
        return;
      }
      this.crosshairCb({
        candle: {
          time: (bar.time as number) - IST_SHIFT_SEC,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: 0,
        },
      });
    });

    this.drawingLayer = new DrawingLayer(
      container,
      this.chart,
      this.candleSeries,
      this.theme,
    );
    this.drawingLayer.onToolDone(() => this.toolDoneCb?.());

    // Keep the chart sized to its container. observe() fires immediately with
    // the current box, so a 0-height mount self-corrects as soon as flex layout
    // resolves.
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !this.chart) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) this.chart.resize(width, height);
    });
    this.resizeObserver.observe(container);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.drawingLayer?.destroy();
    this.drawingLayer = null;
    this.chart?.remove();
    this.chart = null;
    this.candleSeries = null;
    this.volumeSeries = null;
    this.indicatorSeries.clear();
  }

  setTheme(theme: ChartTheme): void {
    this.theme = theme;
    this.drawingLayer?.setTheme(theme);
    if (!this.chart || !this.candleSeries) return;
    this.chart.applyOptions({
      layout: {
        textColor: theme.text,
        panes: { separatorColor: theme.border },
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border },
    });
    this.candleSeries.applyOptions({
      upColor: theme.up,
      downColor: theme.down,
      borderUpColor: theme.up,
      borderDownColor: theme.down,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    });
    this.refreshVolume();
  }

  setCandles(
    candles: Candle[],
    timeframe: Timeframe,
    chartKey: string,
    fit = true,
  ): void {
    if (!this.candleSeries || !this.chart) return;
    this.candles = [...candles];
    this.timeframe = timeframe;
    this.candleSeries.setData(
      candles.map((c) => ({
        time: (c.time + IST_SHIFT_SEC) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    this.refreshVolume();
    this.refreshIndicators();
    this.drawingLayer?.setChartKey(`${chartKey}`);
    if (fit) this.chart.timeScale().fitContent();
  }

  updateLast(candle: Candle): void {
    if (!this.candleSeries || this.candles.length === 0) return;
    const last = this.candles[this.candles.length - 1];
    if (candle.time < last.time) return;
    if (candle.time === last.time) this.candles[this.candles.length - 1] = candle;
    else this.candles.push(candle);

    this.candleSeries.update({
      time: (candle.time + IST_SHIFT_SEC) as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });
    this.volumeSeries?.update({
      time: (candle.time + IST_SHIFT_SEC) as UTCTimestamp,
      value: candle.volume,
      color: this.volumeColor(candle),
    });
    this.refreshIndicators();
  }

  fitContent(): void {
    this.chart?.timeScale().fitContent();
  }

  onCrosshair(cb: (info: CrosshairInfo) => void): void {
    this.crosshairCb = cb;
  }

  setActiveTool(tool: DrawingTool | null): void {
    this.drawingLayer?.setTool(tool);
  }

  onToolDone(cb: () => void): void {
    this.toolDoneCb = cb;
  }

  clearDrawings(): void {
    this.drawingLayer?.clear();
  }

  // ----------------------------------------------------------- indicators

  setIndicators(ids: IndicatorId[]): void {
    this.activeIndicators = [...ids];
    this.refreshIndicators(true);
  }

  private volumeColor(c: Candle): string {
    const base = c.close >= c.open ? this.theme.up : this.theme.down;
    return `${base}55`; // hex alpha ≈ 33%
  }

  private refreshVolume(): void {
    this.volumeSeries?.setData(
      this.candles.map((c) => ({
        time: (c.time + IST_SHIFT_SEC) as UTCTimestamp,
        value: c.volume,
        color: this.volumeColor(c),
      })),
    );
  }

  private line(points: { time: number; value: number }[]) {
    return points.map((p) => ({
      time: (p.time + IST_SHIFT_SEC) as UTCTimestamp,
      value: p.value,
    }));
  }

  /** (Re)build indicator series. Cheap enough to run per live bar update. */
  private refreshIndicators(structureChanged = false): void {
    if (!this.chart) return;

    if (structureChanged) {
      for (const series of this.indicatorSeries.values()) {
        this.chart.removeSeries(series);
      }
      this.indicatorSeries.clear();
    }

    // Sub-pane layout: RSI takes the first extra pane, MACD the next.
    let paneIndex = 0;
    const rsiPane = this.activeIndicators.includes("rsi14") ? ++paneIndex : -1;
    const macdPane = this.activeIndicators.includes("macd") ? ++paneIndex : -1;

    const ensureLine = (
      key: string,
      color: string,
      pane: number,
      width: 1 | 2 = 1,
    ): ISeriesApi<"Line"> => {
      let s = this.indicatorSeries.get(key) as ISeriesApi<"Line"> | undefined;
      if (!s) {
        s = this.chart!.addSeries(
          LineSeries,
          {
            color,
            lineWidth: width,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          },
          pane,
        );
        this.indicatorSeries.set(key, s);
      }
      return s;
    };

    for (const id of this.activeIndicators) {
      switch (id) {
        case "sma20":
          ensureLine("sma20", "#f0a437", 0, 2).setData(
            this.line(sma(this.candles, 20)),
          );
          break;
        case "ema50":
          ensureLine("ema50", "#a06bfa", 0, 2).setData(
            this.line(ema(this.candles, 50)),
          );
          break;
        case "vwap":
          ensureLine("vwap", "#22b8cf", 0, 2).setData(this.line(vwap(this.candles)));
          break;
        case "bb20": {
          const bands = bollinger(this.candles, 20, 2);
          ensureLine("bb-upper", "#6b8afa", 0).setData(this.line(bands.upper));
          ensureLine("bb-mid", "#6b8afa88", 0).setData(this.line(bands.middle));
          ensureLine("bb-lower", "#6b8afa", 0).setData(this.line(bands.lower));
          break;
        }
        case "rsi14":
          ensureLine("rsi", "#e8873d", rsiPane, 2).setData(
            this.line(rsi(this.candles, 14)),
          );
          break;
        case "macd": {
          const result = macd(this.candles);
          let hist = this.indicatorSeries.get("macd-hist") as
            | ISeriesApi<"Histogram">
            | undefined;
          if (!hist) {
            hist = this.chart.addSeries(
              HistogramSeries,
              { priceLineVisible: false, lastValueVisible: false },
              macdPane,
            );
            this.indicatorSeries.set("macd-hist", hist);
          }
          hist.setData(
            result.histogram.map((p) => ({
              time: (p.time + IST_SHIFT_SEC) as UTCTimestamp,
              value: p.value,
              color: p.value >= 0 ? `${this.theme.up}99` : `${this.theme.down}99`,
            })),
          );
          ensureLine("macd-line", "#4f8ef7", macdPane, 2).setData(
            this.line(result.macd),
          );
          ensureLine("macd-signal", "#e8873d", macdPane).setData(
            this.line(result.signal),
          );
          break;
        }
      }
    }
  }
}
