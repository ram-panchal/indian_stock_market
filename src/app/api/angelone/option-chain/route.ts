/**
 * Live option chain assembled from Angel One data. DATA ACCESS ONLY.
 *
 * POST { underlyingToken, expiry } -> { chain: OptionChain }
 *
 * Pipeline: spot quote -> listed strikes near ATM (from master) -> batch FULL
 * quotes for those CE/PE legs -> merge live greeks. No values are fabricated;
 * missing greeks are returned as 0.
 */

import { NextResponse } from "next/server";
import { fetchGreeks, fetchQuotes } from "@/lib/market/angelone/angel-data";
import { getChainStrikes } from "@/lib/market/angelone/instrument-master";
import { INDICES, indexInstrument } from "@/lib/market/angelone/universe";
import type {
  Instrument,
  OptionChain,
  OptionChainRow,
  OptionQuote,
  Quote,
} from "@/lib/market/types";
import type { Greeks } from "@/lib/market/angelone/angel-data";
import { angelErrorResponse } from "../_error";

function toOptionQuote(inst: Instrument, q: Quote, g: Greeks | undefined): OptionQuote {
  return {
    ...q,
    token: inst.token,
    instrument: inst,
    oi: q.oi ?? 0,
    oiChange: 0,
    iv: g?.iv ?? 0,
    delta: g?.delta ?? 0,
    gamma: g?.gamma ?? 0,
    theta: g?.theta ?? 0,
    vega: g?.vega ?? 0,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  let underlyingToken: string;
  let expiry: string;
  try {
    const body = (await req.json()) as { underlyingToken?: unknown; expiry?: unknown };
    if (typeof body.underlyingToken !== "string" || typeof body.expiry !== "string")
      return NextResponse.json({ ok: false, reason: "Missing underlyingToken/expiry." }, { status: 400 });
    underlyingToken = body.underlyingToken;
    expiry = body.expiry;
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid request body." }, { status: 400 });
  }

  const underlyingSymbol = underlyingToken.startsWith("IDX:")
    ? underlyingToken.slice(4)
    : underlyingToken;
  const idxDef = INDICES.find((i) => i.symbol === underlyingSymbol);
  if (!idxDef)
    return NextResponse.json({ ok: false, reason: "Unknown underlying." }, { status: 400 });

  try {
    // 1) Spot from the live index quote.
    const spotMap = await fetchQuotes([underlyingToken]);
    const spot = spotMap.get(underlyingToken)?.quote.ltp;
    if (!spot)
      return NextResponse.json({ ok: false, reason: "No live spot for underlying." }, { status: 502 });

    // 2) Real listed strikes around ATM, with Instruments already built.
    const legs = await getChainStrikes(underlyingSymbol, expiry, spot, 20);
    if (legs.length === 0)
      return NextResponse.json({ ok: false, reason: "No strikes listed for this expiry." }, { status: 502 });

    // 3) Batch-quote every CE/PE leg.
    const legTokens: string[] = [];
    for (const l of legs) {
      if (l.ce) legTokens.push(l.ce.token);
      if (l.pe) legTokens.push(l.pe.token);
    }
    const quoteMap = await fetchQuotes(legTokens);

    // 4) Live greeks (best-effort).
    const greeks = await fetchGreeks(underlyingSymbol, expiry);

    const rows: OptionChainRow[] = legs.map((l) => {
      const row: OptionChainRow = { strike: l.strike };
      if (l.ce) {
        const q = quoteMap.get(l.ce.token)?.quote;
        if (q) row.ce = toOptionQuote(l.ce, q, greeks.get(`${l.strike}|CE`));
      }
      if (l.pe) {
        const q = quoteMap.get(l.pe.token)?.quote;
        if (q) row.pe = toOptionQuote(l.pe, q, greeks.get(`${l.strike}|PE`));
      }
      return row;
    });

    const chain: OptionChain = {
      underlying: indexInstrument(idxDef),
      spot,
      expiry,
      rows,
      updatedAt: Date.now(),
    };
    return NextResponse.json({ chain });
  } catch (err) {
    return angelErrorResponse(err);
  }
}
