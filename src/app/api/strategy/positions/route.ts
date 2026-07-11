/**
 * Open strategy positions with live mark-to-market P&L. The only strategy
 * route that calls Angel One — DATA ACCESS ONLY, same as every other
 * angelone/* route; nothing here places an order.
 *
 * GET -> { positions: (StrategyPosition & { currentPrice?, unrealizedPnl?, unrealizedPnlPct? })[] }
 */

import { NextResponse } from "next/server";
import { fetchQuotesThrottled } from "@/lib/strategy/throttle";
import { loadPositions } from "@/lib/strategy/store";
import { angelErrorResponse } from "../../angelone/_error";

export async function GET(): Promise<NextResponse> {
  try {
    const positions = loadPositions();
    const open = positions.filter((p) => p.status === "OPEN");
    const quotes = open.length > 0 ? await fetchQuotesThrottled(open.map((p) => p.token)) : new Map();

    const enriched = positions.map((pos) => {
      if (pos.status !== "OPEN") return pos;
      const ltp = quotes.get(pos.token)?.quote.ltp;
      if (ltp === undefined) return pos;
      const unrealizedPnl = (ltp - pos.entryPrice) * pos.qty;
      const unrealizedPnlPct = (ltp / pos.entryPrice - 1) * 100;
      return { ...pos, currentPrice: ltp, unrealizedPnl, unrealizedPnlPct };
    });

    return NextResponse.json({ positions: enriched });
  } catch (err) {
    return angelErrorResponse(err);
  }
}
