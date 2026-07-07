"use client";

/**
 * Provider selection.
 *
 * With NEXT_PUBLIC_DATA_PROVIDER=angelone (the intended default for live data)
 * the app runs on the real Angel One feed and NEVER falls back to simulated
 * data: if credentials are missing or login fails, the provider stays in an
 * error state and the UI shows why (no invented prices). Set the env var to
 * anything else — or leave it unset — to use the in-browser simulator, which
 * is always clearly flagged as SIMULATED.
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

  if (!wantAngelOne) {
    const mock = new MockMarketDataProvider();
    handle = { provider: mock, fallbackReason: null, ready: mock.connect() };
    return handle;
  }

  const angel = new AngelOneMarketDataProvider();
  const h: ProviderHandle = { provider: angel, fallbackReason: null, ready: Promise.resolve() };
  // On failure we deliberately do NOT swap in the simulator — the user asked
  // for live data only. `ready` still resolves so consumers proceed and show
  // an honest error/empty state; `fallbackReason` explains what to fix.
  h.ready = angel.connect().catch((err: unknown) => {
    h.fallbackReason =
      err instanceof ProviderUnavailableError
        ? err.message
        : "Angel One connection failed unexpectedly.";
  });
  handle = h;
  return handle;
}

export function getMarketDataProvider(): MarketDataProvider {
  return getProviderHandle().provider;
}
