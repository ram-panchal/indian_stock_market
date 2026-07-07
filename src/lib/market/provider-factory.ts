"use client";

/**
 * Provider selection.
 *
 * Default is the mock simulator. Opt into the Angel One scaffold with
 * NEXT_PUBLIC_DATA_PROVIDER=angelone — if its (server-side) credentials are
 * missing or login fails, we fall back to the simulator and record why, so
 * the UI can show an explicit "running on simulated data" notice instead of
 * crashing or silently pretending.
 */

import { MockMarketDataProvider } from "./mock/mock-provider";
import { AngelOneMarketDataProvider } from "./angelone/angelone-provider";
import type { MarketDataProvider } from "./provider";
import { ProviderUnavailableError } from "./provider";

export interface ProviderHandle {
  provider: MarketDataProvider;
  /** Set when a real provider was requested but we fell back to mock. */
  fallbackReason: string | null;
  ready: Promise<void>;
}

let handle: ProviderHandle | null = null;

export function getProviderHandle(): ProviderHandle {
  if (typeof window === "undefined") {
    throw new Error(
      "Market data providers are browser-only; call from client components.",
    );
  }
  if (handle) return handle;

  const wantAngelOne = process.env.NEXT_PUBLIC_DATA_PROVIDER === "angelone";
  const mock = new MockMarketDataProvider();

  if (!wantAngelOne) {
    handle = { provider: mock, fallbackReason: null, ready: mock.connect() };
    return handle;
  }

  const angel = new AngelOneMarketDataProvider();
  const h: ProviderHandle = { provider: angel, fallbackReason: null, ready: Promise.resolve() };
  h.ready = angel.connect().catch((err: unknown) => {
    const reason =
      err instanceof ProviderUnavailableError
        ? err.message
        : "Angel One connection failed unexpectedly.";
    h.provider = mock;
    h.fallbackReason = reason;
    return mock.connect();
  });
  handle = h;
  return handle;
}

export function getMarketDataProvider(): MarketDataProvider {
  return getProviderHandle().provider;
}
