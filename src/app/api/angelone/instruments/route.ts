/**
 * Instrument lookups backed by the Angel One master. DATA ACCESS ONLY.
 *
 * GET ?q=<query>                -> { instruments }   (search indices + equities)
 * GET ?expiries=<UNDERLYING>    -> { expiries }       (ISO, soonest first)
 * GET ?optionToken=<OPT:...>    -> { instrument }      (resolve one option leg)
 */

import { NextResponse } from "next/server";
import {
  getEquityInstrument,
  getExpiries,
  getOptionInstrument,
  searchUniverse,
} from "@/lib/market/angelone/instrument-master";
import { angelErrorResponse } from "../_error";

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  try {
    const q = searchParams.get("q");
    if (q !== null) return NextResponse.json({ instruments: await searchUniverse(q) });

    const expiriesFor = searchParams.get("expiries");
    if (expiriesFor) return NextResponse.json({ expiries: await getExpiries(expiriesFor) });

    const optionToken = searchParams.get("optionToken");
    if (optionToken)
      return NextResponse.json({ instrument: (await getOptionInstrument(optionToken)) ?? null });

    const equityToken = searchParams.get("equityToken");
    if (equityToken)
      return NextResponse.json({ instrument: (await getEquityInstrument(equityToken)) ?? null });

    return NextResponse.json({ ok: false, reason: "Unknown query." }, { status: 400 });
  } catch (err) {
    return angelErrorResponse(err);
  }
}
