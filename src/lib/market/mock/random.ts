/**
 * Deterministic PRNG utilities for the mock data simulator.
 * Seeded generators keep per-instrument characteristics (volatility, OI
 * distribution, history) stable across reloads within a session.
 */

export type Rng = () => number;

/** mulberry32 — small, fast, good-enough 32-bit PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Standard normal via Box–Muller. */
export function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function roundToTick(price: number, tickSize: number): number {
  const ticks = Math.round(price / tickSize);
  // Guard fp noise: 0.05 ticks otherwise produce values like 123.45000000000002.
  return Math.round(ticks * tickSize * 100) / 100;
}
