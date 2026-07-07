"use client";

import { useSyncExternalStore } from "react";
import type { Instrument } from "@/lib/market/types";
import { EQ, IDX } from "@/lib/market/mock/seed";
import { LocalStore } from "./local-store";

export interface WatchlistItem {
  token: string;
  /** Snapshot for instant render; live data comes from useQuote. */
  instrument: Instrument;
}

const DEFAULT_TOKENS = [
  IDX("NIFTY"),
  IDX("BANKNIFTY"),
  EQ("RELIANCE"),
  EQ("HDFCBANK"),
  EQ("INFY"),
  EQ("TATAMOTORS"),
];

let store: LocalStore<WatchlistItem[]> | null = null;

function getStore(): LocalStore<WatchlistItem[]> {
  if (!store) {
    store = new LocalStore<WatchlistItem[]>("im.watchlist.v1", [], (v): v is WatchlistItem[] =>
      Array.isArray(v) && v.every((i) => typeof i?.token === "string" && i?.instrument),
    );
  }
  return store;
}

export function useWatchlist(): WatchlistItem[] {
  const s = getStore();
  return useSyncExternalStore(s.subscribe, s.get, s.getServer);
}

export function addToWatchlist(instrument: Instrument): void {
  getStore().update((items) =>
    items.some((i) => i.token === instrument.token)
      ? items
      : [...items, { token: instrument.token, instrument }],
  );
}

export function removeFromWatchlist(token: string): void {
  getStore().update((items) => items.filter((i) => i.token !== token));
}

export function isWatched(items: WatchlistItem[], token: string): boolean {
  return items.some((i) => i.token === token);
}

/** Seed a first-run watchlist from the given instrument resolver. */
export async function seedDefaultWatchlist(
  resolve: (token: string) => Promise<Instrument | undefined>,
): Promise<void> {
  const s = getStore();
  if (s.get().length > 0 || localStorage.getItem("im.watchlist.seeded")) return;
  localStorage.setItem("im.watchlist.seeded", "1");
  const items: WatchlistItem[] = [];
  for (const token of DEFAULT_TOKENS) {
    const inst = await resolve(token);
    if (inst) items.push({ token, instrument: inst });
  }
  if (items.length) s.set(items);
}
