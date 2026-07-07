"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Quote } from "@/lib/market/types";
import { getPriceStore } from "@/lib/market/price-store";

const noop = () => () => {};

/**
 * Live quote for one token. Re-renders ONLY the calling component when that
 * token ticks. Returns undefined until the first tick arrives (and always on
 * the server), so callers render a skeleton/placeholder for that state.
 */
export function useQuote(token: string | null | undefined): Quote | undefined {
  const subscribe = useCallback(
    (onChange: () => void) =>
      token ? getPriceStore().subscribe(token, onChange) : noop(),
    [token],
  );
  return useSyncExternalStore(
    subscribe,
    () => (token ? getPriceStore().get(token) : undefined),
    () => undefined,
  );
}
