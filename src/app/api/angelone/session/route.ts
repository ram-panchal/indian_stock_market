/**
 * Angel One SmartAPI session endpoint — DATA ACCESS ONLY.
 *
 * Logs in server-side (secrets never reach the browser), caches the session in
 * process, and warms the instrument master. Returns only a status flag — the
 * client needs no tokens because every data call is proxied through our own
 * routes. This route must never proxy order placement; trading is paper-only.
 *
 * Responses:
 *   200 { ok: true }                          — live session ready
 *   503 { ok: false, reason, missing? }       — credentials not configured
 *   502 { ok: false, reason }                 — login/master failed
 */

import { NextResponse } from "next/server";
import { getMaster } from "@/lib/market/angelone/instrument-master";
import {
  AngelCredsError,
  AngelLoginError,
  getAngelSession,
} from "@/lib/market/angelone/session-store";

export async function POST(): Promise<NextResponse> {
  try {
    await getAngelSession();
    // Warm the instrument master so the first quote/chain call is fast.
    await getMaster();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AngelCredsError) {
      return NextResponse.json(
        { ok: false, reason: err.message, missing: err.missing },
        { status: 503 },
      );
    }
    if (err instanceof AngelLoginError) {
      return NextResponse.json({ ok: false, reason: err.message }, { status: 502 });
    }
    return NextResponse.json(
      {
        ok: false,
        reason: `Angel One session error: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 502 },
    );
  }
}
