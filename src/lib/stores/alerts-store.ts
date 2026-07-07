"use client";

import { useSyncExternalStore } from "react";
import type { Instrument } from "@/lib/market/types";
import { LocalStore } from "./local-store";

export type AlertCondition = "above" | "below";

export interface PriceAlert {
  id: string;
  instrument: Instrument;
  condition: AlertCondition;
  price: number;
  createdAt: number;
  /** Set when the alert fires; fired alerts stay for review until dismissed. */
  triggeredAt?: number;
  triggeredPrice?: number;
}

let store: LocalStore<PriceAlert[]> | null = null;

function getStore(): LocalStore<PriceAlert[]> {
  if (!store) {
    store = new LocalStore<PriceAlert[]>("im.alerts.v1", [], (v): v is PriceAlert[] =>
      Array.isArray(v),
    );
  }
  return store;
}

export function useAlerts(): PriceAlert[] {
  const s = getStore();
  return useSyncExternalStore(s.subscribe, s.get, s.getServer);
}

export function addAlert(
  instrument: Instrument,
  condition: AlertCondition,
  price: number,
): void {
  getStore().update((alerts) => [
    ...alerts,
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      instrument,
      condition,
      price,
      createdAt: Date.now(),
    },
  ]);
}

export function removeAlert(id: string): void {
  getStore().update((alerts) => alerts.filter((a) => a.id !== id));
}

export function markTriggered(id: string, price: number): void {
  getStore().update((alerts) =>
    alerts.map((a) =>
      a.id === id && !a.triggeredAt
        ? { ...a, triggeredAt: Date.now(), triggeredPrice: price }
        : a,
    ),
  );
}

export function getActiveAlerts(): PriceAlert[] {
  return getStore()
    .get()
    .filter((a) => !a.triggeredAt);
}
