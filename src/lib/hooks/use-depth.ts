"use client";

import { useEffect, useState } from "react";
import type { MarketDepth } from "@/lib/market/types";
import { getProviderHandle } from "@/lib/market/provider-factory";

interface DepthState {
  token: string | null;
  depth: MarketDepth | null;
}

export function useMarketDepth(token: string | null): MarketDepth | null {
  const [state, setState] = useState<DepthState>({ token, depth: null });

  // Reset stale depth during render when the token changes (React's
  // "adjusting state while rendering" pattern — avoids an effect setState).
  if (state.token !== token) {
    setState({ token, depth: null });
  }

  useEffect(() => {
    if (!token) return;
    const handle = getProviderHandle();
    let unsub: (() => void) | null = null;
    let cancelled = false;
    handle.ready.then(() => {
      if (cancelled) return;
      unsub = handle.provider.subscribeDepth(token, (depth) =>
        setState({ token, depth }),
      );
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [token]);

  return state.token === token ? state.depth : null;
}
