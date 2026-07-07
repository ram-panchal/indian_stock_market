"use client";

import { useEffect, useState } from "react";
import { getProviderHandle } from "@/lib/market/provider-factory";
import type { ConnectionState } from "@/lib/market/provider";

export interface ProviderInfo {
  id: string;
  displayName: string;
  isSimulated: boolean;
  connectionState: ConnectionState;
  /** Why we fell back to mock, if a real provider was requested. */
  fallbackReason: string | null;
}

/** Which data source is actually serving the app right now. */
export function useProviderInfo(): ProviderInfo | null {
  const [info, setInfo] = useState<ProviderInfo | null>(null);

  useEffect(() => {
    const handle = getProviderHandle();
    let unsub: (() => void) | null = null;
    let cancelled = false;

    const sync = () =>
      setInfo({
        id: handle.provider.id,
        displayName: handle.provider.displayName,
        isSimulated: handle.provider.isSimulated,
        connectionState: handle.provider.getConnectionState(),
        fallbackReason: handle.fallbackReason,
      });

    handle.ready.then(() => {
      if (cancelled) return;
      sync();
      unsub = handle.provider.onConnectionStateChange(sync);
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  return info;
}
