/**
 * Black–Scholes pricing + Greeks for the MOCK option-chain simulator.
 * Real providers deliver these fields from the exchange feed; this module
 * exists only so simulated option prices move coherently with the underlying.
 */

import type { OptionType } from "../types";

function normCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 approximation — plenty for simulation.
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const poly =
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - d * poly;
  return x >= 0 ? p : 1 - p;
}

function normPdf(x: number): number {
  return 0.3989422804014327 * Math.exp((-x * x) / 2);
}

export interface OptionGreeks {
  price: number;
  delta: number;
  gamma: number;
  /** Per calendar day. */
  theta: number;
  /** Per 1% change in IV. */
  vega: number;
}

/**
 * @param spot   underlying price
 * @param strike strike price
 * @param tYears time to expiry in years (floored to ~15 minutes)
 * @param iv     annualised implied volatility, e.g. 0.14
 * @param rate   risk-free rate, e.g. 0.065
 */
export function blackScholes(
  type: OptionType,
  spot: number,
  strike: number,
  tYears: number,
  iv: number,
  rate = 0.065,
): OptionGreeks {
  const t = Math.max(tYears, 15 / (60 * 24 * 365));
  const sqrtT = Math.sqrt(t);
  const d1 =
    (Math.log(spot / strike) + (rate + (iv * iv) / 2) * t) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const discount = Math.exp(-rate * t);

  const callPrice = spot * normCdf(d1) - strike * discount * normCdf(d2);
  const putPrice = strike * discount * normCdf(-d2) - spot * normCdf(-d1);

  const gamma = normPdf(d1) / (spot * iv * sqrtT);
  const vega = (spot * normPdf(d1) * sqrtT) / 100;

  if (type === "CE") {
    const theta =
      (-(spot * normPdf(d1) * iv) / (2 * sqrtT) -
        rate * strike * discount * normCdf(d2)) /
      365;
    return { price: Math.max(callPrice, 0.05), delta: normCdf(d1), gamma, theta, vega };
  }
  const theta =
    (-(spot * normPdf(d1) * iv) / (2 * sqrtT) +
      rate * strike * discount * normCdf(-d2)) /
    365;
  return { price: Math.max(putPrice, 0.05), delta: normCdf(d1) - 1, gamma, theta, vega };
}
