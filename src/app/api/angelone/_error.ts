/** Shared error mapping for Angel One data routes. */

import { NextResponse } from "next/server";
import {
  AngelCredsError,
  AngelLoginError,
} from "@/lib/market/angelone/session-store";

export function angelErrorResponse(err: unknown): NextResponse {
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
      reason: `Angel One data error: ${err instanceof Error ? err.message : "unknown"}`,
    },
    { status: 502 },
  );
}
