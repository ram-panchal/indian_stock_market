"use client";

import { useEffect, useState } from "react";
import type { MarketStatus } from "@/lib/market/types";
import { getMarketStatus } from "@/lib/market/status";

/** Real IST exchange-session status; null until mounted (SSR-safe). */
export function useMarketStatus(): MarketStatus | null {
  const [status, setStatus] = useState<MarketStatus | null>(null);
  useEffect(() => {
    const update = () => setStatus(getMarketStatus());
    update();
    const timer = setInterval(update, 15_000);
    return () => clearInterval(timer);
  }, []);
  return status;
}
