/**
 * Today's (or the most recent) daily-pick state. Pure file read — no Angel
 * One dependency at all, so the tab still renders (with a "no scan has run
 * yet" state) even if live credentials are currently broken.
 *
 * GET -> { todayIso, shortlist: ShortlistSnapshot | null, latestPick: PickLogEntry | null }
 */

import { NextResponse } from "next/server";
import { istTodayIso } from "@/lib/strategy/dates";
import { loadAllPicks, loadLatestShortlist } from "@/lib/strategy/store";

export async function GET(): Promise<NextResponse> {
  try {
    const shortlist = loadLatestShortlist();
    const picks = loadAllPicks();
    const latestPick = picks.length > 0 ? picks[picks.length - 1] : null;
    return NextResponse.json({
      todayIso: istTodayIso(),
      shortlist,
      latestPick,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : "Unknown error." },
      { status: 500 },
    );
  }
}
