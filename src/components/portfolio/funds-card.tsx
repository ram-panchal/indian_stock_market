"use client";

import { useMemo, useState } from "react";
import { usePaperState } from "@/lib/hooks/use-paper-trading";
import { useQuotes } from "@/lib/hooks/use-quotes";
import { formatINR } from "@/lib/market/format";
import {
  computeCash,
  computePositions,
  reservedForOpenBuys,
  shortOptionMargin,
} from "@/lib/trading/derive";
import { getPaperTradingEngine } from "@/lib/trading/engine";
import {
  DEFAULT_STARTING_BALANCE,
  SHORT_OPTION_MARGIN_PCT,
} from "@/lib/trading/types";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export function FundsCard() {
  const state = usePaperState();
  const toast = useToast();
  const [resetOpen, setResetOpen] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(DEFAULT_STARTING_BALANCE));

  const positions = useMemo(() => computePositions(state.trades), [state.trades]);
  const shortUnderlyings = useMemo(
    () => [
      ...new Set(
        positions
          .filter((p) => p.instrument.segment === "OPTION" && p.netQty < 0)
          .map((p) => p.instrument.underlyingToken)
          .filter((t): t is string => !!t),
      ),
    ],
    [positions],
  );
  const underlyingQuotes = useQuotes(shortUnderlyings);

  const cash = computeCash(state);
  const reserved = reservedForOpenBuys(state.orders);
  const margin = shortOptionMargin(
    positions,
    (t) => underlyingQuotes.get(t),
    SHORT_OPTION_MARGIN_PCT,
  );
  const available = cash - reserved - margin;

  const doReset = () => {
    const balance = Number.parseFloat(balanceInput);
    if (!Number.isFinite(balance) || balance <= 0) return;
    getPaperTradingEngine().reset(balance);
    setResetOpen(false);
    toast({
      tone: "info",
      title: "Paper account reset",
      body: `Starting balance ${formatINR(balance, 0)}. All orders and trades cleared.`,
    });
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-ink-2 uppercase">
          Virtual funds
        </h3>
        <button
          onClick={() => setResetOpen(true)}
          className="rounded border border-border px-2 py-0.5 text-[10px] text-ink-3 hover:text-down"
        >
          Reset
        </button>
      </div>
      <p className="tnum mt-2 text-xl font-semibold text-ink">
        {formatINR(available)}
      </p>
      <p className="text-[10px] text-ink-3">available to trade</p>
      <dl className="mt-3 space-y-1.5 border-t border-border pt-2.5 text-[11px]">
        <Row label="Cash" value={formatINR(cash)} />
        <Row label="Blocked (open buy orders)" value={formatINR(reserved)} />
        <Row
          label={`Short option margin (${SHORT_OPTION_MARGIN_PCT * 100}%)`}
          value={formatINR(margin)}
        />
        <Row label="Starting balance" value={formatINR(state.startingBalance, 0)} muted />
      </dl>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset paper account">
        <div className="space-y-3 px-4 py-4">
          <p className="text-xs text-ink-2">
            This clears all paper orders, trades and positions, and restores
            the balance below. It cannot be undone.
          </p>
          <label className="block text-xs text-ink-3">
            New starting balance (₹)
            <input
              type="number"
              min={1000}
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              className="tnum mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <button
            onClick={doReset}
            className="w-full rounded-md bg-down py-2 text-sm font-semibold text-white"
          >
            Reset account
          </button>
        </div>
      </Modal>
    </section>
  );
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-3">{label}</dt>
      <dd className={`tnum ${muted ? "text-ink-3" : "text-ink-2"}`}>{value}</dd>
    </div>
  );
}
