"use client";

import { useEffect, useRef, useState } from "react";
import { getProviderHandle } from "@/lib/market/provider-factory";
import type { MarketDataProvider } from "@/lib/market/provider";

interface PolledResult<T> {
  data: T | undefined;
  error: string | null;
  isLoading: boolean;
  /** Epoch ms of the last successful refresh. */
  updatedAt: number | null;
}

/**
 * Poll a provider REST-style method on an interval.
 *
 * On the mock provider this doubles as the "simulated auto-refresh" for
 * snapshot data (option chain, movers). When a real WebSocket feed is wired
 * in, streaming consumers use useQuote instead — this stays for genuinely
 * snapshot-shaped data.
 */
export function usePolled<T>(
  fetcher: (provider: MarketDataProvider) => Promise<T>,
  intervalMs: number,
  deps: readonly unknown[],
): PolledResult<T> {
  const [state, setState] = useState<PolledResult<T>>({
    data: undefined,
    error: null,
    isLoading: true,
    updatedAt: null,
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    setState((s) => ({ ...s, isLoading: true }));

    const run = async () => {
      // Skip this tick rather than overlap a still-in-flight fetch — on a
      // slow network two overlapping requests can resolve out of order, and
      // whichever lands last would silently win over whichever was requested
      // last.
      if (inFlight) return;
      inFlight = true;
      const handle = getProviderHandle();
      await handle.ready;
      try {
        const data = await fetcherRef.current(handle.provider);
        if (!cancelled)
          setState({ data, error: null, isLoading: false, updatedAt: Date.now() });
      } catch (err) {
        if (!cancelled)
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to load data",
            isLoading: false,
          }));
      } finally {
        inFlight = false;
      }
    };

    run();
    timer = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
