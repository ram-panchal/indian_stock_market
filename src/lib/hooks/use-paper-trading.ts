"use client";

import { useSyncExternalStore } from "react";
import { getPaperTradingEngine } from "@/lib/trading/engine";
import type { PaperState } from "@/lib/trading/types";
import { DEFAULT_STARTING_BALANCE } from "@/lib/trading/types";

const EMPTY_STATE: PaperState = {
  version: 1,
  startingBalance: DEFAULT_STARTING_BALANCE,
  createdAt: 0,
  orders: [],
  trades: [],
};

/** Reactive view of the paper-trading state (orders + trade log). */
export function usePaperState(): PaperState {
  return useSyncExternalStore(
    (cb) => getPaperTradingEngine().subscribe(cb),
    () => getPaperTradingEngine().getSnapshot(),
    () => EMPTY_STATE,
  );
}
