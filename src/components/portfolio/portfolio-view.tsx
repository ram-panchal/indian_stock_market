"use client";

import { useMemo, useState } from "react";
import { usePaperState } from "@/lib/hooks/use-paper-trading";
import { useQuotes } from "@/lib/hooks/use-quotes";
import { computePositions, unrealizedPnl } from "@/lib/trading/derive";
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

  // Live totals — recomputed from trades + current quotes on every render.
  const quotes = useQuotes(openPositions.map((p) => p.instrument.token));
  const totalUnrealized = openPositions.reduce(
    (sum, p) => sum + unrealizedPnl(p, quotes.get(p.instrument.token)?.ltp),
    0,
  );
  const totalRealized = positions.reduce((sum, p) => sum + p.realizedPnl, 0);
  const openOrderCount = state.orders.filter((o) => o.status === "OPEN").length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <FundsCard />
        <SummaryCard
          title="Unrealized P&L"
          hint={`${openPositions.length} open position${openPositions.length === 1 ? "" : "s"}`}
        >
          <PnlText value={totalUnrealized} className="text-xl font-semibold" />
        </SummaryCard>
        <SummaryCard
          title="Realized P&L"
          hint={`${state.trades.length} trades · ${openOrderCount} open order${openOrderCount === 1 ? "" : "s"}`}
        >
          <PnlText value={totalRealized} className="text-xl font-semibold" />
        </SummaryCard>
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

function SummaryCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-3">
      <h3 className="text-xs font-semibold tracking-wide text-ink-2 uppercase">
        {title}
      </h3>
      <p className="mt-2">{children}</p>
      <p className="mt-1 text-[10px] text-ink-3">{hint}</p>
    </section>
  );
}
