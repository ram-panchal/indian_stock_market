/**
 * Live historical candles via Angel One getCandleData. DATA ACCESS ONLY.
 *
 * POST { token, timeframe, maxBars? } -> { candles: Candle[] }
 */

import { NextResponse } from "next/server";
import { fetchCandles } from "@/lib/market/angelone/angel-data";
import { TIMEFRAME_SECONDS, type Timeframe } from "@/lib/market/types";
import { angelErrorResponse } from "../_error";

export async function POST(req: Request): Promise<NextResponse> {
  let token: string;
  let timeframe: Timeframe;
  let maxBars = 500;
  try {
    const body = (await req.json()) as {
      token?: unknown;
      timeframe?: unknown;
      maxBars?: unknown;
    };
    if (typeof body.token !== "string" || !body.token)
      return NextResponse.json({ ok: false, reason: "Missing token." }, { status: 400 });
    if (typeof body.timeframe !== "string" || !(body.timeframe in TIMEFRAME_SECONDS))
      return NextResponse.json({ ok: false, reason: "Invalid timeframe." }, { status: 400 });
    token = body.token;
    timeframe = body.timeframe as Timeframe;
    if (typeof body.maxBars === "number" && body.maxBars > 0) maxBars = Math.floor(body.maxBars);
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid request body." }, { status: 400 });
  }

  try {
    const candles = await fetchCandles(token, timeframe, maxBars);
    return NextResponse.json({ candles });
  } catch (err) {
    return angelErrorResponse(err);
  }
}
