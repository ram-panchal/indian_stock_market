/**
 * Live batch quotes (+ market depth) via Angel One getMarketData (FULL).
 * DATA ACCESS ONLY.
 *
 * POST { tokens: string[] } -> { quotes: Quote[], depth: Record<token, MarketDepth> }
 */

import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/market/angelone/angel-data";
import type { MarketDepth, Quote } from "@/lib/market/types";
import { angelErrorResponse } from "../_error";

export async function POST(req: Request): Promise<NextResponse> {
  let tokens: string[];
  try {
    const body = (await req.json()) as { tokens?: unknown };
    tokens = Array.isArray(body.tokens) ? body.tokens.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid request body." }, { status: 400 });
  }
  if (tokens.length === 0) return NextResponse.json({ quotes: [], depth: {} });

  try {
    const map = await fetchQuotes(tokens);
    const quotes: Quote[] = [];
    const depth: Record<string, MarketDepth> = {};
    for (const [token, qd] of map) {
      quotes.push(qd.quote);
      depth[token] = qd.depth;
    }
    return NextResponse.json({ quotes, depth });
  } catch (err) {
    return angelErrorResponse(err);
  }
}
