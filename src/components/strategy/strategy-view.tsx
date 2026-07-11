"use client";

import { usePolled } from "@/lib/hooks/use-polled";
import type { PickLogEntry, ShortlistSnapshot, TrackRecordSummary } from "@/lib/strategy/types";
import { PickCard } from "./pick-card";
import { HistoryTable, type HistoryPick, type LivePosition } from "./history-table";

interface LatestResponse {
  todayIso: string;
  shortlist: ShortlistSnapshot | null;
  latestPick: PickLogEntry | null;
}

interface PositionsResponse {
  positions: LivePosition[];
}

interface HistoryResponse {
  trackRecord: TrackRecordSummary;
  picks: HistoryPick[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  return (await res.json()) as T;
}

export function StrategyView() {
  // Strategy data is server-file-backed, not tied to the live market-data
  // provider — usePolled is reused anyway for consistency with the rest of
  // the app (see its own docs for the one coupling this brings: the first
  // load waits on the market-data provider's own connect(), not just these
  // fetches). Refreshed at a relaxed interval since this changes at most
  // once a day.
  const latest = usePolled<LatestResponse>(() => getJson("/api/strategy/latest"), 5 * 60_000, []);
  const positions = usePolled<PositionsResponse>(
    () => getJson("/api/strategy/positions"),
    60_000,
    [],
  );
  const history = usePolled<HistoryResponse>(() => getJson("/api/strategy/history"), 5 * 60_000, []);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-4">
      <PickCard shortlist={latest.data?.shortlist ?? null} latestPick={latest.data?.latestPick ?? null} />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">
            Track record
          </h2>
          <div className="flex gap-3 text-[11px]">
            <a href="/api/strategy/export?type=picks" className="text-ink-2 hover:text-ink hover:underline">
              Export picks (CSV)
            </a>
            <a href="/api/strategy/export?type=trades" className="text-ink-2 hover:text-ink hover:underline">
              Export trades (CSV)
            </a>
          </div>
        </div>
        <HistoryTable
          trackRecord={
            history.data?.trackRecord ?? {
              totalPicks: 0,
              entered: 0,
              skipped: 0,
              wins: 0,
              losses: 0,
              openCount: 0,
              winRatePct: 0,
            }
          }
          picks={history.data?.picks ?? []}
          livePositions={positions.data?.positions ?? []}
        />
      </section>

      <p className="text-center text-[10px] text-ink-3">
        Every pick here is filed as a paper trade against a dedicated strategy ledger — separate
        from your own manual paper trading in Portfolio — so this track record reflects the
        screener and research process alone.
      </p>
    </div>
  );
}
