"use client";

/**
 * Full option chain: CE | strike | PE with OI, OI change, volume, IV,
 * bid/ask, LTP and Greeks. Data refreshes every 2s — on the mock provider
 * this is a clearly-badged SIMULATED refresh; a real WebSocket feed replaces
 * the polling via the same provider seam.
 */

import { memo, useEffect, useMemo, useState } from "react";
import type {
  Instrument,
  OptionChain,
  OptionChainRow,
  OptionQuote,
} from "@/lib/market/types";
import { usePolled } from "@/lib/hooks/use-polled";
import { getProviderHandle } from "@/lib/market/provider-factory";
import {
  formatCompact,
  formatExpiry,
  formatISTTime,
  formatPrice,
} from "@/lib/market/format";
import { Segmented } from "@/components/ui/segmented";
import { useTradeTicket } from "@/components/trading/trade-ticket";

type StrikeWindow = 5 | 10 | 20;
type SideMode = "compact" | "prices" | "greeks";

/** Columns per side for each mode (drives header colSpan + placeholder cells). */
const MODE_COLS: Record<SideMode, number> = { compact: 3, prices: 7, greeks: 5 };

export function OptionChainView() {
  const [underlyings, setUnderlyings] = useState<Instrument[]>([]);
  const [underlying, setUnderlying] = useState<string | null>(null);
  const [expiries, setExpiries] = useState<string[]>([]);
  const [expiry, setExpiry] = useState<string | null>(null);
  const [window_, setWindow] = useState<StrikeWindow>(10);
  const [mode, setMode] = useState<SideMode>("compact");

  useEffect(() => {
    let cancelled = false;
    const handle = getProviderHandle();
    handle.ready
      .then(() => handle.provider.getOptionUnderlyings())
      .then((list) => {
        if (cancelled) return;
        setUnderlyings(list);
        setUnderlying((u) => u ?? list[0]?.token ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!underlying) return;
    let cancelled = false;
    const handle = getProviderHandle();
    handle.ready
      .then(() => handle.provider.getOptionExpiries(underlying))
      .then((list) => {
        if (cancelled) return;
        setExpiries(list);
        setExpiry((e) => (e && list.includes(e) ? e : (list[0] ?? null)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [underlying]);

  const { data: chain, updatedAt, error } = usePolled(
    (p) =>
      underlying && expiry
        ? p.getOptionChain(underlying, expiry)
        : Promise.resolve(undefined as unknown as OptionChain),
    2000,
    [underlying, expiry],
  );

  const visibleRows = useMemo(() => {
    if (!chain) return [];
    const atmIdx = nearestStrikeIndex(chain.rows, chain.spot);
    return chain.rows.slice(
      Math.max(0, atmIdx - window_),
      Math.min(chain.rows.length, atmIdx + window_ + 1),
    );
  }, [chain, window_]);

  const stats = useMemo(() => (chain ? chainStats(chain) : null), [chain]);
  const maxOI = useMemo(
    () =>
      Math.max(
        1,
        ...visibleRows.flatMap((r) => [r.ce?.oi ?? 0, r.pe?.oi ?? 0]),
      ),
    [visibleRows],
  );
  const atmStrike = useMemo(() => {
    if (!chain || visibleRows.length === 0) return null;
    return visibleRows[nearestStrikeIndex(visibleRows, chain.spot)]?.strike ?? null;
  }, [chain, visibleRows]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          options={underlyings.map((u) => ({ value: u.token, label: u.symbol }))}
          value={underlying ?? ""}
          onChange={setUnderlying}
        />
        <select
          value={expiry ?? ""}
          onChange={(e) => setExpiry(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none"
        >
          {expiries.map((e) => (
            <option key={e} value={e}>
              {formatExpiry(e)}
            </option>
          ))}
        </select>
        <Segmented
          options={[
            { value: 5, label: "±5" },
            { value: 10, label: "±10" },
            { value: 20, label: "±20" },
          ].map((o) => ({ value: String(o.value), label: o.label }))}
          value={String(window_)}
          onChange={(v) => setWindow(Number(v) as StrikeWindow)}
        />
        <Segmented
          options={[
            { value: "compact", label: "Compact" },
            { value: "prices", label: "Detailed" },
            { value: "greeks", label: "Greeks" },
          ]}
          value={mode}
          onChange={setMode}
        />
        {updatedAt ? (
          <span className="ml-auto text-[10px] text-ink-3">
            Auto-refresh 2s · updated {formatISTTime(updatedAt)} IST
          </span>
        ) : null}
      </div>

      {stats && chain ? (
        <div className="flex flex-wrap gap-2 text-[11px]">
          <StatChip label="Spot" value={formatPrice(chain.spot)} />
          <StatChip label="ATM IV" value={`${stats.atmIv.toFixed(1)}%`} />
          <StatChip label="PCR (OI)" value={stats.pcr.toFixed(2)} />
          <StatChip label="Max pain" value={formatPrice(stats.maxPain, 0)} />
          <StatChip label="CE OI" value={formatCompact(stats.ceOi)} />
          <StatChip label="PE OI" value={formatCompact(stats.peOi)} />
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-down bg-down-muted px-3 py-2 text-xs text-down">
          {error}
        </p>
      ) : null}

      {/* Desktop: dense two-sided table */}
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
        <table className="w-full min-w-[980px] text-[11px]">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr className="text-ink-3">
              <th colSpan={MODE_COLS[mode]} className="border-b border-border py-1.5 text-center font-medium text-up">
                CALLS
              </th>
              <th className="border-b border-border py-1.5 text-center font-semibold text-ink-2">
                Strike
              </th>
              <th colSpan={MODE_COLS[mode]} className="border-b border-border py-1.5 text-center font-medium text-down">
                PUTS
              </th>
            </tr>
            <tr className="border-b border-border text-[10px] text-ink-3">
              {mode === "compact" ? (
                <>
                  <Th right>OI</Th>
                  <Th right>IV</Th>
                  <Th right>LTP</Th>
                </>
              ) : mode === "prices" ? (
                <>
                  <Th right>OI</Th>
                  <Th right>OI Chg</Th>
                  <Th right>Volume</Th>
                  <Th right>IV</Th>
                  <Th right>Bid</Th>
                  <Th right>Ask</Th>
                  <Th right>LTP</Th>
                </>
              ) : (
                <>
                  <Th right>Delta</Th>
                  <Th right>Gamma</Th>
                  <Th right>Theta</Th>
                  <Th right>Vega</Th>
                  <Th right>LTP</Th>
                </>
              )}
              <Th center>—</Th>
              {mode === "compact" ? (
                <>
                  <Th right>LTP</Th>
                  <Th right>IV</Th>
                  <Th right>OI</Th>
                </>
              ) : mode === "prices" ? (
                <>
                  <Th right>LTP</Th>
                  <Th right>Bid</Th>
                  <Th right>Ask</Th>
                  <Th right>IV</Th>
                  <Th right>Volume</Th>
                  <Th right>OI Chg</Th>
                  <Th right>OI</Th>
                </>
              ) : (
                <>
                  <Th right>LTP</Th>
                  <Th right>Delta</Th>
                  <Th right>Gamma</Th>
                  <Th right>Theta</Th>
                  <Th right>Vega</Th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <ChainRow
                key={row.strike}
                row={row}
                spot={chain?.spot ?? 0}
                mode={mode}
                maxOI={maxOI}
                isAtm={row.strike === atmStrike}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: strike-centric cards (rethought layout, not a squeezed grid) */}
      <div className="space-y-1.5 md:hidden">
        {visibleRows.map((row) => (
          <MobileChainRow
            key={row.strike}
            row={row}
            spot={chain?.spot ?? 0}
            isAtm={row.strike === atmStrike}
          />
        ))}
      </div>
    </div>
  );
}

function nearestStrikeIndex(rows: OptionChainRow[], spot: number): number {
  let best = 0;
  let bestDist = Infinity;
  rows.forEach((r, i) => {
    const d = Math.abs(r.strike - spot);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

function chainStats(chain: OptionChain) {
  let ceOi = 0;
  let peOi = 0;
  for (const r of chain.rows) {
    ceOi += r.ce?.oi ?? 0;
    peOi += r.pe?.oi ?? 0;
  }
  const atmIdx = nearestStrikeIndex(chain.rows, chain.spot);
  const atmIv = chain.rows[atmIdx]?.ce?.iv ?? 0;

  // Max pain: settlement strike minimising total option-buyer payoff.
  let maxPain = chain.rows[atmIdx]?.strike ?? 0;
  let minPain = Infinity;
  for (const k of chain.rows) {
    let pain = 0;
    for (const s of chain.rows) {
      pain += (s.ce?.oi ?? 0) * Math.max(k.strike - s.strike, 0);
      pain += (s.pe?.oi ?? 0) * Math.max(s.strike - k.strike, 0);
    }
    if (pain < minPain) {
      minPain = pain;
      maxPain = k.strike;
    }
  }
  return { ceOi, peOi, pcr: ceOi > 0 ? peOi / ceOi : 0, atmIv, maxPain };
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md border border-border bg-surface px-2 py-1">
      <span className="text-ink-3">{label} </span>
      <span className="tnum font-medium text-ink">{value}</span>
    </span>
  );
}

function Th({
  children,
  right,
  center,
}: {
  children: React.ReactNode;
  right?: boolean;
  center?: boolean;
}) {
  return (
    <th
      className={`px-2 py-1.5 font-normal ${right ? "text-right" : center ? "text-center" : "text-left"}`}
    >
      {children}
    </th>
  );
}

const ChainRow = memo(
  function ChainRow({
    row,
    spot,
    mode,
    maxOI,
    isAtm,
  }: {
    row: OptionChainRow;
    spot: number;
    mode: SideMode;
    maxOI: number;
    isAtm: boolean;
  }) {
    return (
      <tr
        className={`border-b border-border/50 hover:bg-surface-2 ${isAtm ? "bg-accent-muted" : ""}`}
      >
        <SideCells option={row.ce} itm={row.strike < spot} mode={mode} maxOI={maxOI} side="ce" />
        <td
          className={`tnum px-2 py-1 text-center font-semibold text-ink ${isAtm ? "bg-accent/20" : "bg-surface-2/60"}`}
        >
          {formatPrice(row.strike, 0)}
          {isAtm ? (
            <span className="ml-1 rounded bg-accent px-1 py-0.5 text-[8px] font-bold text-white align-middle">
              ATM
            </span>
          ) : null}
        </td>
        <SideCells option={row.pe} itm={row.strike > spot} mode={mode} maxOI={maxOI} side="pe" />
      </tr>
    );
  },
  (prev, next) =>
    prev.mode === next.mode &&
    prev.isAtm === next.isAtm &&
    prev.maxOI === next.maxOI &&
    prev.row.ce?.updatedAt === next.row.ce?.updatedAt &&
    prev.row.pe?.updatedAt === next.row.pe?.updatedAt &&
    prev.row.ce?.ltp === next.row.ce?.ltp &&
    prev.row.pe?.ltp === next.row.pe?.ltp,
);

function SideCells({
  option,
  itm,
  mode,
  maxOI,
  side,
}: {
  option?: OptionQuote;
  itm: boolean;
  mode: SideMode;
  maxOI: number;
  side: "ce" | "pe";
}) {
  const ticket = useTradeTicket();
  const cols = MODE_COLS[mode];
  if (!option) {
    return (
      <>
        {Array.from({ length: cols }).map((_, i) => (
          <td key={i} className="px-2 py-1 text-right text-ink-3">
            —
          </td>
        ))}
      </>
    );
  }
  const tint = itm ? (side === "ce" ? "bg-up-muted/40" : "bg-down-muted/40") : "";
  const up = option.change >= 0;
  const oiPct = Math.min(100, ((option.oi ?? 0) / maxOI) * 100);

  const ltpCell = (
    <td key="ltp" className={`relative px-1 py-1 text-right ${tint}`}>
      <button
        onClick={() => ticket.open(option.instrument, "BUY")}
        className="tnum w-full cursor-pointer rounded px-1 text-right font-medium text-ink hover:bg-surface-3"
        title={`Trade ${option.instrument.symbol} (paper)`}
      >
        {formatPrice(option.ltp)}
        <span className={`ml-1 text-[9px] ${up ? "text-up" : "text-down"}`}>
          {up ? "+" : ""}
          {option.changePercent.toFixed(1)}%
        </span>
      </button>
    </td>
  );

  const oiCell = (
    <td key="oi" className={`relative px-2 py-1 text-right ${tint}`}>
      <span
        className={`absolute inset-y-0.5 ${side === "ce" ? "right-0 bg-up-muted" : "right-0 bg-down-muted"}`}
        style={{ width: `${oiPct}%` }}
      />
      <span className="tnum relative text-ink-2">{formatCompact(option.oi)}</span>
    </td>
  );
  const ivCell = (
    <td key="iv" className={`tnum px-2 py-1 text-right text-ink-2 ${tint}`}>
      {option.iv.toFixed(1)}
    </td>
  );

  const cells =
    mode === "compact"
      ? [oiCell, ivCell, ltpCell]
      : mode === "prices"
      ? [
          <td key="oi" className={`relative px-2 py-1 text-right ${tint}`}>
            <span
              className={`absolute inset-y-0.5 ${side === "ce" ? "right-0 bg-up-muted" : "right-0 bg-down-muted"}`}
              style={{ width: `${oiPct}%` }}
            />
            <span className="tnum relative text-ink-2">{formatCompact(option.oi)}</span>
          </td>,
          <td
            key="oic"
            className={`tnum px-2 py-1 text-right ${option.oiChange >= 0 ? "text-up" : "text-down"} ${tint}`}
          >
            {option.oiChange >= 0 ? "+" : ""}
            {formatCompact(option.oiChange)}
          </td>,
          <td key="vol" className={`tnum px-2 py-1 text-right text-ink-2 ${tint}`}>
            {formatCompact(option.volume)}
          </td>,
          <td key="iv" className={`tnum px-2 py-1 text-right text-ink-2 ${tint}`}>
            {option.iv.toFixed(1)}
          </td>,
          <td key="bid" className={`tnum px-2 py-1 text-right text-up ${tint}`}>
            {formatPrice(option.bid)}
          </td>,
          <td key="ask" className={`tnum px-2 py-1 text-right text-down ${tint}`}>
            {formatPrice(option.ask)}
          </td>,
          ltpCell,
        ]
      : [
          <td key="d" className={`tnum px-2 py-1 text-right text-ink-2 ${tint}`}>
            {option.delta.toFixed(2)}
          </td>,
          <td key="g" className={`tnum px-2 py-1 text-right text-ink-2 ${tint}`}>
            {option.gamma.toFixed(4)}
          </td>,
          <td key="t" className={`tnum px-2 py-1 text-right text-ink-2 ${tint}`}>
            {option.theta.toFixed(2)}
          </td>,
          <td key="v" className={`tnum px-2 py-1 text-right text-ink-2 ${tint}`}>
            {option.vega.toFixed(2)}
          </td>,
          ltpCell,
        ];

  // Puts mirror the calls: LTP nearest to the strike column.
  return <>{side === "ce" ? cells : [...cells].reverse()}</>;
}

const MobileChainRow = memo(
  function MobileChainRow({
    row,
    spot,
    isAtm,
  }: {
    row: OptionChainRow;
    spot: number;
    isAtm: boolean;
  }) {
    const ticket = useTradeTicket();
    return (
      <div
        className={`rounded-lg border px-3 py-2 ${isAtm ? "border-accent bg-accent-muted" : "border-border bg-surface"}`}
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="tnum text-xs font-semibold text-ink">
            {formatPrice(row.strike, 0)}
          </span>
          {isAtm ? (
            <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-white">
              ATM
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["CE", row.ce, row.strike < spot],
            ["PE", row.pe, row.strike > spot],
          ] as const).map(([label, opt, itm]) => (
            <button
              key={label}
              disabled={!opt}
              onClick={() => opt && ticket.open(opt.instrument, "BUY")}
              className={`rounded-md border border-border p-2 text-left ${itm ? "bg-surface-3" : "bg-surface-2"}`}
            >
              <div className="flex items-baseline justify-between">
                <span className={`text-[10px] font-semibold ${label === "CE" ? "text-up" : "text-down"}`}>
                  {label}
                </span>
                {opt ? (
                  <span
                    className={`tnum text-[10px] ${opt.change >= 0 ? "text-up" : "text-down"}`}
                  >
                    {opt.change >= 0 ? "+" : ""}
                    {opt.changePercent.toFixed(1)}%
                  </span>
                ) : null}
              </div>
              <p className="tnum mt-0.5 text-sm font-medium text-ink">
                {opt ? formatPrice(opt.ltp) : "—"}
              </p>
              {opt ? (
                <p className="tnum mt-0.5 text-[9px] text-ink-3">
                  OI {formatCompact(opt.oi)} · IV {opt.iv.toFixed(1)} · B{" "}
                  {formatPrice(opt.bid)} / A {formatPrice(opt.ask)}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.isAtm === next.isAtm &&
    prev.row.ce?.ltp === next.row.ce?.ltp &&
    prev.row.pe?.ltp === next.row.pe?.ltp,
);
