"use client";

/**
 * Canvas overlay drawing layer for the lightweight-charts engine.
 *
 * lightweight-charts has no built-in drawing tools, so this layer renders
 * trend lines, horizontal lines and Fibonacci retracements on a canvas
 * positioned over the price pane, converting between (time, price) space and
 * pixels via the chart's coordinate APIs. Drawings persist per instrument in
 * localStorage.
 *
 * Known limitation (v1): a shape is hidden while either anchor's timestamp
 * is outside the visible range — lines are not extrapolated across gaps.
 */

import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { ChartTheme, DrawingTool } from "./chart-engine";

interface Point {
  /** Chart-space time (already IST-shifted like the series data). */
  time: number;
  price: number;
}

interface Drawing {
  id: string;
  type: "trendline" | "hline" | "fib";
  points: Point[];
}

const STORAGE_KEY = "im.drawings.v1";
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

function loadAll(): Record<string, Drawing[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      Drawing[]
    >;
  } catch {
    return {};
  }
}

export class DrawingLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private drawings: Drawing[] = [];
  private pending: Point | null = null;
  private hover: Point | null = null;
  private tool: DrawingTool | null = null;
  private chartKey = "";
  private toolDoneCb: (() => void) | null = null;
  private resizeObserver: ResizeObserver;
  private rafScheduled = false;
  private raf = 0;
  private visibleRangeHandler = () => this.scheduleRender();

  constructor(
    private container: HTMLElement,
    private chart: IChartApi,
    private series: ISeriesApi<"Candlestick">,
    private theme: ChartTheme,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:absolute;inset:0;z-index:3;pointer-events:none;";
    container.style.position = "relative";
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    // Redraw only on things that can actually move the overlay: pan/zoom and
    // container resize. Avoids a permanent 60fps loop when the chart is idle.
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.visibleRangeHandler);
    this.resizeObserver = new ResizeObserver(() => this.scheduleRender());
    this.resizeObserver.observe(container);
    this.scheduleRender();
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.visibleRangeHandler);
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }

  setTheme(theme: ChartTheme): void {
    this.theme = theme;
    this.scheduleRender();
  }

  setChartKey(key: string): void {
    if (key === this.chartKey) return;
    this.chartKey = key;
    this.pending = null;
    this.drawings = loadAll()[key] ?? [];
    this.scheduleRender();
  }

  setTool(tool: DrawingTool | null): void {
    this.tool = tool;
    this.pending = null;
    // Only intercept pointer events while a tool is armed, so pan/zoom keep
    // working the rest of the time.
    this.canvas.style.pointerEvents = tool ? "auto" : "none";
    this.canvas.style.cursor = tool === "erase" ? "not-allowed" : "crosshair";
    this.scheduleRender();
  }

  /** Call after new candle/indicator data lands — a moved price scale (autoscale
   *  on a live tick) shifts every anchor's pixel position even though nothing
   *  about the drawings themselves changed. */
  notifyDataChanged(): void {
    this.scheduleRender();
  }

  /** Coalesce bursts (pointermove, rapid data updates) into one paint per frame. */
  private scheduleRender(): void {
    if (this.rafScheduled) return;
    this.rafScheduled = true;
    this.raf = requestAnimationFrame(() => {
      this.rafScheduled = false;
      this.render();
    });
  }

  onToolDone(cb: () => void): void {
    this.toolDoneCb = cb;
  }

  clear(): void {
    this.drawings = [];
    this.pending = null;
    this.persist();
  }

  private persist(): void {
    try {
      const all = loadAll();
      all[this.chartKey] = this.drawings;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Best-effort.
    }
    this.scheduleRender();
  }

  // ------------------------------------------------------------- pointers

  private eventPoint(ev: PointerEvent): Point | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const time = this.chart.timeScale().coordinateToTime(x);
    const price = this.series.coordinateToPrice(y);
    if (time === null || price === null) return null;
    return { time: time as number, price };
  }

  private onPointerDown = (ev: PointerEvent): void => {
    if (!this.tool) return;
    const pt = this.eventPoint(ev);
    if (!pt) return;

    if (this.tool === "erase") {
      const rect = this.canvas.getBoundingClientRect();
      this.eraseNear(ev.clientX - rect.left, ev.clientY - rect.top);
      return;
    }
    if (this.tool === "hline") {
      this.drawings.push({ id: `${Date.now()}`, type: "hline", points: [pt] });
      this.persist();
      this.toolDoneCb?.();
      return;
    }
    if (!this.pending) {
      this.pending = pt;
      return;
    }
    this.drawings.push({
      id: `${Date.now()}`,
      type: this.tool,
      points: [this.pending, pt],
    });
    this.pending = null;
    this.persist();
    this.toolDoneCb?.();
  };

  private onPointerMove = (ev: PointerEvent): void => {
    if (!this.tool || !this.pending) return;
    this.hover = this.eventPoint(ev);
    this.scheduleRender();
  };

  private eraseNear(x: number, y: number): void {
    const before = this.drawings.length;
    this.drawings = this.drawings.filter((d) => {
      const coords = this.toCoords(d);
      if (!coords) return true;
      if (d.type === "hline") return Math.abs(coords[0].y - y) > 6;
      const [a, b] = coords;
      return distanceToSegment(x, y, a.x, a.y, b.x, b.y) > 7;
    });
    if (this.drawings.length !== before) this.persist();
  }

  // -------------------------------------------------------------- render

  private toCoords(d: Drawing): { x: number; y: number }[] | null {
    const out: { x: number; y: number }[] = [];
    for (const p of d.points) {
      const y = this.series.priceToCoordinate(p.price);
      if (y === null) return null;
      if (d.type === "hline") {
        out.push({ x: 0, y });
        continue;
      }
      const x = this.chart.timeScale().timeToCoordinate(p.time as UTCTimestamp);
      if (x === null) return null;
      out.push({ x, y });
    }
    return out;
  }

  private render(): void {
    const { width, height } = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    for (const d of this.drawings) this.renderDrawing(ctx, d, width);

    if (this.pending && this.hover && this.tool && this.tool !== "hline") {
      this.renderDrawing(
        ctx,
        { id: "preview", type: this.tool as "trendline" | "fib", points: [this.pending, this.hover] },
        width,
        true,
      );
    }
  }

  private renderDrawing(
    ctx: CanvasRenderingContext2D,
    d: Drawing,
    width: number,
    preview = false,
  ): void {
    const coords = this.toCoords(d);
    if (!coords) return;
    ctx.lineWidth = 1.25;
    ctx.setLineDash(preview ? [4, 4] : []);
    ctx.strokeStyle = this.theme.accent;
    ctx.fillStyle = this.theme.accent;

    if (d.type === "hline") {
      const y = coords[0].y;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.font = "10px sans-serif";
      ctx.fillText(d.points[0].price.toFixed(2), 6, y - 4);
      return;
    }

    const [a, b] = coords;
    if (d.type === "trendline") {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      for (const p of [a, b]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // Fibonacci retracement between the two anchor prices.
    const [p1, p2] = d.points;
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    ctx.font = "10px sans-serif";
    for (const level of FIB_LEVELS) {
      const price = p1.price + (p2.price - p1.price) * level;
      const y = this.series.priceToCoordinate(price);
      if (y === null) continue;
      ctx.globalAlpha = level === 0 || level === 1 ? 0.9 : 0.55;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.fillText(`${(level * 100).toFixed(1)}%  ${price.toFixed(2)}`, x2 + 6, y + 3);
    }
    ctx.globalAlpha = 1;
  }
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
