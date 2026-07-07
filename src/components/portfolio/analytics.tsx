"use client";

/** Portfolio analytics derived entirely from the trade log + live quotes. */

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PaperState, Position } from "@/lib/trading/types";
import { computeRealizedTimeline } from "@/lib/trading/derive";
import { useQuotes } from "@/lib/hooks/use-quotes";
import { formatCompact, formatINR, formatISTDateTime } from "@/lib/market/format";

const PIE_COLORS = ["#4f8ef7", "#12a984", "#e8873d", "#a06bfa", "#22b8cf", "#f0a437"];

export function PortfolioAnalytics({
  state,
  positions,
}: {
  state: PaperState;
  positions: Position[];
}) {
  const events = useMemo(
    () => computeRealizedTimeline(state.trades),
    [state.trades],
  );

  const curve = useMemo(() => {
    const out: { at: number; label: string; value: number }[] = [];
    let cum = 0;
    for (const e of events) {
      cum += e.amount;
      out.push({ at: e.at, label: formatISTDateTime(e.at), value: cum });
    }
    return out;
  }, [events]);

  const stats = useMemo(() => {
    const wins = events.filter((e) => e.amount > 0);
    const losses = events.filter((e) => e.amount < 0);
    const grossProfit = wins.reduce((s, e) => s + e.amount, 0);
    const grossLoss = -losses.reduce((s, e) => s + e.amount, 0);
    return {
      closes: events.length,
      winRate: events.length ? (wins.length / events.length) * 100 : 0,
      grossProfit,
      grossLoss,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      largestWin: wins.length ? Math.max(...wins.map((e) => e.amount)) : 0,
      largestLoss: losses.length ? Math.min(...losses.map((e) => e.amount)) : 0,
    };
  }, [events]);

  const bySymbol = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) {
      map.set(e.symbol, (map.get(e.symbol) ?? 0) + e.amount);
    }
    return [...map.entries()]
      .map(([symbol, pnl]) => ({ symbol, pnl }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [events]);

  const openPositions = useMemo(
    () => positions.filter((p) => p.netQty !== 0),
    [positions],
  );
  const quotes = useQuotes(openPositions.map((p) => p.instrument.token));
  const allocation = openPositions
    .map((p) => ({
      name: p.instrument.symbol,
      value: Math.abs(
        (quotes.get(p.instrument.token)?.ltp ?? p.avgPrice) * p.netQty,
      ),
    }))
    .filter((a) => a.value > 0);

  if (state.trades.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-xs text-ink-3">
        Analytics appear after your first paper trades.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Closed round-trips" value={String(stats.closes)} />
        <Stat label="Win rate" value={`${stats.winRate.toFixed(0)}%`} />
        <Stat
          label="Profit factor"
          value={
            stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)
          }
        />
        <Stat label="Gross profit" value={formatINR(stats.grossProfit, 0)} tone="up" />
        <Stat label="Gross loss" value={formatINR(-stats.grossLoss, 0)} tone="down" />
        <Stat
          label="Largest win / loss"
          value={`${formatCompact(stats.largestWin)} / ${formatCompact(stats.largestLoss)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Cumulative realized P&L">
          {curve.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={curve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "var(--ink-3)" }}
                  tickLine={false}
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--ink-3)" }}
                  tickFormatter={(v: number) => formatCompact(v)}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  formatter={(v) => formatINR(Number(v))}
                  contentStyle={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                />
                <Line
                  type="stepAfter"
                  dataKey="value"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="No closed trades yet — unrealized P&L lives in Positions." />
          )}
        </ChartCard>

        <ChartCard title="Open position allocation (live value)">
          {allocation.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={allocation}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  stroke="var(--surface)"
                >
                  {allocation.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => formatINR(Number(v), 0)}
                  contentStyle={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="No open positions." />
          )}
        </ChartCard>

        <ChartCard title="Realized P&L by instrument" full>
          {bySymbol.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bySymbol} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="symbol"
                  tick={{ fontSize: 10, fill: "var(--ink-3)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--ink-3)" }}
                  tickFormatter={(v: number) => formatCompact(v)}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  formatter={(v) => formatINR(Number(v))}
                  contentStyle={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                />
                <Bar dataKey="pnl">
                  {bySymbol.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? "var(--up)" : "var(--down)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="No realized P&L yet." />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5">
      <p className="text-[10px] text-ink-3">{label}</p>
      <p
        className={`tnum mt-0.5 text-sm font-semibold ${
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  children,
  full = false,
}: {
  title: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface p-3 ${full ? "lg:col-span-2" : ""}`}
    >
      <h4 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-2 uppercase">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-xs text-ink-3">
      {text}
    </div>
  );
}
