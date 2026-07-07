/**
 * Technical indicator math. Pure functions: Candle[] in, plottable series
 * out. Values are aligned to candle times; warm-up periods are omitted.
 */

import type { Candle } from "@/lib/market/types";

export interface IndicatorPoint {
  time: number;
  value: number;
}

export function sma(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

export function ema(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const out: IndicatorPoint[] = [];
  let prev =
    candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  out.push({ time: candles[period - 1].time, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

export function rsi(candles: Candle[], period = 14): IndicatorPoint[] {
  if (candles.length <= period) return [];
  const out: IndicatorPoint[] = [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  const point = (i: number) => ({
    time: candles[i].time,
    value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss),
  });
  out.push(point(period));
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    out.push(point(i));
  }
  return out;
}

export interface MacdResult {
  macd: IndicatorPoint[];
  signal: IndicatorPoint[];
  histogram: IndicatorPoint[];
}

export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdResult {
  const fastEma = ema(candles, fast);
  const slowEma = ema(candles, slow);
  const bySlowTime = new Map(slowEma.map((p) => [p.time, p.value]));
  const macdLine: IndicatorPoint[] = fastEma
    .filter((p) => bySlowTime.has(p.time))
    .map((p) => ({ time: p.time, value: p.value - bySlowTime.get(p.time)! }));

  const signal: IndicatorPoint[] = [];
  if (macdLine.length >= signalPeriod) {
    const k = 2 / (signalPeriod + 1);
    let prev =
      macdLine.slice(0, signalPeriod).reduce((s, p) => s + p.value, 0) /
      signalPeriod;
    signal.push({ time: macdLine[signalPeriod - 1].time, value: prev });
    for (let i = signalPeriod; i < macdLine.length; i++) {
      prev = macdLine[i].value * k + prev * (1 - k);
      signal.push({ time: macdLine[i].time, value: prev });
    }
  }
  const bySignalTime = new Map(signal.map((p) => [p.time, p.value]));
  const histogram = macdLine
    .filter((p) => bySignalTime.has(p.time))
    .map((p) => ({ time: p.time, value: p.value - bySignalTime.get(p.time)! }));
  return { macd: macdLine, signal, histogram };
}

export interface BollingerResult {
  upper: IndicatorPoint[];
  middle: IndicatorPoint[];
  lower: IndicatorPoint[];
}

export function bollinger(
  candles: Candle[],
  period = 20,
  stdDevs = 2,
): BollingerResult {
  const upper: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const mean = window.reduce((s, c) => s + c.close, 0) / period;
    const variance =
      window.reduce((s, c) => s + (c.close - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    const time = candles[i].time;
    middle.push({ time, value: mean });
    upper.push({ time, value: mean + stdDevs * sd });
    lower.push({ time, value: mean - stdDevs * sd });
  }
  return { upper, middle, lower };
}

/** Session-anchored VWAP (resets whenever the calendar day changes). */
export function vwap(candles: Candle[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  let cumPV = 0;
  let cumV = 0;
  let currentDay = -1;
  for (const c of candles) {
    const day = Math.floor((c.time + 5.5 * 3600) / 86400);
    if (day !== currentDay) {
      currentDay = day;
      cumPV = 0;
      cumV = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumV += c.volume;
    if (cumV > 0) out.push({ time: c.time, value: cumPV / cumV });
  }
  return out;
}
