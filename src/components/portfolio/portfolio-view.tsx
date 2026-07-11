"use client";

import { useEffect, useMemo, useState } from "react";
import { usePaperState } from "@/lib/hooks/use-paper-trading";
import { useQuotes } from "@/lib/hooks/use-quotes";
import {
  computeCash,
  computePositions,
  dayPnl,
  istDayStartMs,
  unrealizedPnl,
} from "@/lib/trading/derive";
import { formatINR } from "@/lib/market/format";
import { FundsCard } from "./funds-card";
import { PositionsTable } from "./positions-table";
import { OrdersTable, TradesTable } from "./orders-table";
import { PortfolioAnalytics } from "./analytics";
import { PnlText } from "@/components/market/price-cells";

type Tab = "positions" | "holdings" | "orders" | "trades" | "analytics";

const TABS: { value: Tab; label: string }[] = [
  { value: "positions", label: "Positions" },
  { value: "holdings", label: "Holdings" },
  { value: "orders", label: "Orders" },
  { value: "trades", label: "Trades" },
  { value: "analytics", label: "Analytics" },
];

export function PortfolioView() {
  const state = usePaperState();
  const [tab, setTab] = useState<Tab>("positions");

  // Wall-clock read lives in an effect, not render, per this project's
  // purity rules (see useMarketStatus for the same pattern). The day
  // boundary only moves once every 24h, so a coarse refresh is plenty.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  const positions = useMemo(() => computePositions(state.trades), [state.trades]);
  const openPositions = useMemo(
    () => positions.filter((p) => p.netQty !== 0),
    [positions],
  );
  const holdings = useMemo(
    () =>
      openPositions.filter(
        (p) => p.instrument.segment === "EQUITY" && p.netQty > 0,
      ),
    [openPositions],
  );

  // Tokens we need live quotes for: open positions plus anything traded today
  // (a position opened *and closed* today still contributes to day's P&L).
  // Derived from the effect-driven nowMs (not Date.now() directly) to keep
  // the wall-clock read out of render, per this project's purity rules.
  const dayStart = istDayStartMs(nowMs ?? 0);
  const quoteTokens = useMemo(() => {
    const set = new Set(openPositions.map((p) => p.instrument.token));
    for (const t of state.trades) {
      if (t.at >= dayStart) set.add(t.instrument.token);
    }
    return [...set];
  }, [openPositions, state.trades, dayStart]);

  // Live totals — recomputed from trades + current quotes on every render.
  const quotes = useQuotes(quoteTokens);
  const totalUnrealized = openPositions.reduce(
    (sum, p) => sum + unrealizedPnl(p, quotes.get(p.instrument.token)?.ltp),
    0,
  );
  const totalRealized = positions.reduce((sum, p) => sum + p.realizedPnl, 0);
  const openOrderCount = state.orders.filter((o) => o.status === "OPEN").length;

  // Cost basis of open positions, current market value, and day's P&L.
  const invested = openPositions.reduce(
    (sum, p) => sum + p.avgPrice * Math.abs(p.netQty),
    0,
  );
  const dayPnlValue = dayPnl(
    state.trades,
    (token) => quotes.get(token),
    dayStart,
  );
  const cash = computeCash(state);
  const marketValue = openPositions.reduce((sum, p) => {
    const q = quotes.get(p.instrument.token);
    return sum + (q ? q.ltp * p.netQty : p.avgPrice * p.netQty);
  }, 0);
  const portfolioValue = cash + marketValue;
  const totalPnl = totalRealized + totalUnrealized;
  const returnPct =
    state.startingBalance > 0 ? (totalPnl / state.startingBalance) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <FundsCard />
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          <StatTile title="Portfolio value" hint="cash + holdings">
            <span className="tnum text-xl font-semibold text-ink">
              {formatINR(portfolioValue)}
            </span>
          </StatTile>
          <StatTile title="Total P&L" hint={`${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}% return`}>
            <PnlText value={totalPnl} className="text-xl font-semibold" />
          </StatTile>
          <StatTile title="Day's P&L" hint="mark-to-market today">
            <PnlText value={dayPnlValue} className="text-xl font-semibold" />
          </StatTile>
          <StatTile title="Invested" hint={`${openPositions.length} open`}>
            <span className="tnum text-base font-semibold text-ink">
              {formatINR(invested)}
            </span>
          </StatTile>
          <StatTile
            title="Unrealized"
            hint={`${openPositions.length} position${openPositions.length === 1 ? "" : "s"}`}
          >
            <PnlText value={totalUnrealized} className="text-base font-semibold" />
          </StatTile>
          <StatTile
            title="Realized"
            hint={`${state.trades.length} trades · ${openOrderCount} open`}
          >
            <PnlText value={totalRealized} className="text-base font-semibold" />
          </StatTile>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                tab === t.value ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "positions" ? <PositionsTable positions={openPositions} /> : null}
        {tab === "holdings" ? (
          <PositionsTable positions={holdings} holdingsMode />
        ) : null}
        {tab === "orders" ? <OrdersTable orders={state.orders} /> : null}
        {tab === "trades" ? <TradesTable trades={state.trades} /> : null}
        {tab === "analytics" ? (
          <PortfolioAnalytics state={state} positions={positions} />
        ) : null}
      </section>

      <p className="text-center text-[10px] text-ink-3">
        All figures are paper-trading results with zero brokerage/taxes
        modelled. Values are derived from the full trade log and live quotes on
        every render — nothing is accumulated.
      </p>
    </div>
  );
}

function StatTile({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface p-3">
      <h3 className="text-[10px] font-semibold tracking-wide text-ink-3 uppercase">
        {title}
      </h3>
      <p className="mt-1.5">{children}</p>
      <p className="mt-0.5 text-[10px] text-ink-3">{hint}</p>
    </div>
  );
}
