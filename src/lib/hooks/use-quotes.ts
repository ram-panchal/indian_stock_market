"use client";

import { useEffect, useMemo, useState } from "react";
import type { Quote } from "@/lib/market/types";
import { getPriceStore } from "@/lib/market/price-store";

interface QuotesState {
  key: string;
  quotes: Map<string, Quote>;
}

/**
 * Live quotes for a small set of tokens (portfolio summaries, alert
 * watching). Re-renders the caller on any tick of any watched token — use
 * per-cell useQuote for dense tables instead.
 */
export function useQuotes(tokens: string[]): Map<string, Quote> {
  const key = tokens.join(",");
  const stableTokens = useMemo(() => key.split(",").filter(Boolean), [key]);
  const [state, setState] = useState<QuotesState>({ key, quotes: new Map() });

  // Drop quotes for a stale token set during render, not in the effect.
  if (state.key !== key) {
    setState({ key, quotes: new Map() });
  }

  useEffect(() => {
    if (stableTokens.length === 0) return;
    const store = getPriceStore();
    const unsubs = stableTokens.map((token) =>
      store.subscribe(token, () => {
        const q = store.get(token);
        if (!q) return;
        setState((prev) => {
          const quotes = new Map(prev.key === key ? prev.quotes : undefined);
          quotes.set(token, q);
          return { key, quotes };
        });
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [stableTokens, key]);

  return state.key === key ? state.quotes : new Map();
}
