"use client";

import Link from "next/link";
import { usePolled } from "@/lib/hooks/use-polled";
import { AreaChart } from "@/components/ui/area-chart";
import { SymbolChip } from "@/components/ui/symbol-chip";
import { formatINR, formatISTDateTime } from "@/lib/market/format";
import type { PickLogEntry, ShortlistCandidate, ShortlistSnapshot } from "@/lib/strategy/types";
import { Panel, PanelHeader } from "@/components/dashboard/panel";

const CONVICTION_STYLE: Record<string, string> = {
  High: "bg-up-muted text-up",
  Medium: "bg-warn-muted text-warn",
  Low: "bg-surface-2 text-ink-3",
};

function ConvictionBadge({ conviction }: { conviction?: string }) {
  if (!conviction) return null;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CONVICTION_STYLE[conviction] ?? "bg-surface-2 text-ink-3"}`}
    >
      {conviction} conviction
    </span>
  );
}

function RiskFlagChip({ flag }: { flag: string }) {
  return (
    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3">
      {flag.replace(/_/g, " ")}
    </span>
  );
}

function Sparkline({ token }: { token: string }) {
  const { data: candles } = usePolled((p) => p.getCandles(token, "1d", 60), 5 * 60_000, [token]);
  const closes = (candles ?? []).map((c) => c.close);
  if (closes.length < 2) return <div className="h-[60px] animate-pulse rounded bg-surface-2" />;
  const up = closes[closes.length - 1] >= closes[0];
  return (
    <AreaChart height={60} series={[{ values: closes, color: up ? "var(--up)" : "var(--down)" }]} />
  );
}

function CandidateSummary({ candidate }: { candidate: ShortlistCandidate }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border p-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <SymbolChip label={candidate.symbol} round />
          <Link
            href={`/charts?token=${encodeURIComponent(candidate.token)}`}
            className="font-semibold text-ink hover:underline"
          >
            {candidate.symbol}
          </Link>
          <span className="tnum text-[11px] text-ink-3">{formatINR(candidate.ltp)}</span>
        </div>
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-ink-2">
          {candidate.reasons.slice(0, 3).map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      </div>
      <span className="tnum shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3">
        score {candidate.stageBScore ?? "—"}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-2 py-1.5">
      <p className="text-[9px] text-ink-3 uppercase">{label}</p>
      <p className="tnum font-medium text-ink">{value}</p>
    </div>
  );
}

export function PickCard({
  shortlist,
  latestPick,
}: {
  shortlist: ShortlistSnapshot | null;
  latestPick: PickLogEntry | null;
}) {
  if (!shortlist && !latestPick) {
    return (
      <Panel>
        <PanelHeader icon="🎯" title="Daily Pick" />
        <p className="px-4 py-10 text-center text-xs text-ink-3">
          No scan has run yet. Run{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5">/daily-pick</code> to generate
          today&apos;s pick.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        icon="🎯"
        title="Daily Pick"
        right={
          shortlist ? (
            <span className="text-[10px] text-ink-3">
              {shortlist.dateIso} · scanned {formatISTDateTime(shortlist.runAt)}
            </span>
          ) : null
        }
      />
      <div className="space-y-3 p-3">
        {shortlist?.likelyNoTradingToday ? (
          <p className="rounded-md border border-warn/30 bg-warn-muted px-2.5 py-1.5 text-[11px] text-warn">
            Very few symbols cleared the liquidity floor today — this looks like a non-trading
            session (weekend/holiday) rather than a normal day.
          </p>
        ) : null}

        {!latestPick ? (
          <p className="text-xs text-ink-3">
            Scan complete — no pick decided yet for {shortlist?.dateIso}.
          </p>
        ) : latestPick.action === "no_pick" ? (
          <div>
            <p className="text-sm font-medium text-ink">
              No strong pick on {latestPick.dateIso}
            </p>
            <p className="mt-1 text-xs text-ink-2">{latestPick.reasoning}</p>
          </div>
        ) : latestPick.action === "entered" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SymbolChip label={latestPick.symbol ?? "?"} size="md" round />
              <Link
                href={`/charts?token=${encodeURIComponent(latestPick.token ?? "")}`}
                className="text-base font-semibold text-ink hover:underline"
              >
                {latestPick.symbol}
              </Link>
              <ConvictionBadge conviction={latestPick.conviction} />
              {(latestPick.riskFlags ?? []).map((f) => (
                <RiskFlagChip key={f} flag={f} />
              ))}
            </div>

            {latestPick.token ? <Sparkline token={latestPick.token} /> : null}

            <p className="text-xs text-ink-2">{latestPick.reasoning}</p>

            {latestPick.entry ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <Stat label="Entry" value={formatINR(latestPick.entry.price)} />
                  <Stat label="Qty" value={String(latestPick.entry.qty)} />
                  <Stat label="Target" value={formatINR(latestPick.entry.targetPrice)} />
                  <Stat label="Stop-loss" value={formatINR(latestPick.entry.stopLossPrice)} />
                </div>
                <p className="text-[10px] text-ink-3">
                  Position value {formatINR(latestPick.entry.positionValue)} · time-stop{" "}
                  {latestPick.entry.maxHoldUntilDate}
                </p>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-ink-3">
            {latestPick.symbol} was not entered ({latestPick.action.replace(/_/g, " ")}).
          </p>
        )}

        {shortlist && shortlist.runnerUps.length > 0 ? (
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
              Runner-ups
            </h4>
            <div className="space-y-1.5">
              {shortlist.runnerUps.slice(0, 3).map((c) => (
                <CandidateSummary key={c.token} candidate={c} />
              ))}
            </div>
          </div>
        ) : null}

        <p className="border-t border-border pt-2 text-[10px] text-ink-3">
          Paper trading only — tracked for accuracy, not a guarantee of any return.
        </p>
      </div>
    </Panel>
  );
}
