/**
 * Full pick history + track-record summary. Pure file read.
 *
 * GET ?limit=<n> -> { trackRecord: TrackRecordSummary, picks: (PickLogEntry & { position?: StrategyPosition })[] }
 * Newest first. `limit` caps how many picks come back (default: all).
 */

import { NextResponse } from "next/server";
import { computeTrackRecord } from "@/lib/strategy/positions";
import { loadAllPicks, loadPositions } from "@/lib/strategy/store";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.max(0, Number(limitParam)) : undefined;

    const picks = loadAllPicks();
    const positions = loadPositions();
    const positionsById = new Map(positions.map((p) => [p.id, p]));

    const newestFirst = [...picks].reverse();
    const withPositions = newestFirst.map((pick) => ({
      ...pick,
      position: pick.positionId ? positionsById.get(pick.positionId) : undefined,
    }));

    return NextResponse.json({
      trackRecord: computeTrackRecord(picks, positions),
      picks: limit !== undefined ? withPositions.slice(0, limit) : withPositions,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : "Unknown error." },
      { status: 500 },
    );
  }
}
