"use client";

/**
 * Client-side quote cache with per-token subscriptions.
 *
 * This is the render-performance backbone: components subscribe to individual
 * tokens via useSyncExternalStore, so a tick for RELIANCE re-renders only the
 * cells watching RELIANCE — not the page. Provider subscriptions are
 * ref-counted, so N components watching one token share one upstream stream.
 */

import type { Quote } from "./types";
import { getProviderHandle } from "./provider-factory";

interface Entry {
  quote: Quote | undefined;
  listeners: Set<() => void>;
  unsubscribe: (() => void) | null;
}

class PriceStore {
  private entries = new Map<string, Entry>();

  subscribe(token: string, onChange: () => void): () => void {
    let entry = this.entries.get(token);
    if (!entry) {
      entry = { quote: undefined, listeners: new Set(), unsubscribe: null };
      this.entries.set(token, entry);
    }
    entry.listeners.add(onChange);

    if (!entry.unsubscribe) {
      const e = entry;
      const handle = getProviderHandle();
      let cancelled = false;
      let providerUnsub: (() => void) | null = null;
      // Wait for connect (incl. potential mock fallback) before subscribing.
      handle.ready.then(() => {
        if (cancelled) return;
        providerUnsub = handle.provider.subscribeQuotes([token], (quote) => {
          e.quote = quote;
          for (const cb of e.listeners) cb();
        });
      });
      entry.unsubscribe = () => {
        cancelled = true;
        providerUnsub?.();
      };
    }

    return () => {
      const e = this.entries.get(token);
      if (!e) return;
      e.listeners.delete(onChange);
      if (e.listeners.size === 0) {
        e.unsubscribe?.();
        this.entries.delete(token);
      }
    };
  }

  get(token: string): Quote | undefined {
    return this.entries.get(token)?.quote;
  }
}

let store: PriceStore | null = null;

export function getPriceStore(): PriceStore {
  if (!store) store = new PriceStore();
  return store;
}
