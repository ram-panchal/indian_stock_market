/**
 * Excel-openable CSV export, generated fresh from current JSONL contents on
 * every request — same picksToCsv()/tradesToCsv() functions scripts/daily-scan.ts
 * also calls to refresh the on-disk exports/*.csv files, so there's no
 * duplicated logic and no staleness gap between the two.
 *
 * GET ?type=picks|trades (default picks) -> CSV file download
 */

import { NextResponse } from "next/server";
import { picksToCsv, tradesToCsv } from "@/lib/strategy/csv-export";
import { loadAllPicks, loadTrades } from "@/lib/strategy/store";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") === "trades" ? "trades" : "picks";
    const csv = type === "trades" ? tradesToCsv(loadTrades()) : picksToCsv(loadAllPicks());

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="strategy-${type}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : "Unknown error." },
      { status: 500 },
    );
  }
}
