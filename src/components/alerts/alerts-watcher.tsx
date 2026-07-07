"use client";

/**
 * Headless component: watches live ticks for active alerts and fires them
 * (toast + browser notification). Mounted once in the app shell.
 */

import { useEffect, useMemo } from "react";
import { getPriceStore } from "@/lib/market/price-store";
import { formatPrice } from "@/lib/market/format";
import { markTriggered, useAlerts } from "@/lib/stores/alerts-store";
import { useToast } from "@/components/ui/toast";

export function AlertsWatcher() {
  const alerts = useAlerts();
  const toast = useToast();

  const active = useMemo(() => alerts.filter((a) => !a.triggeredAt), [alerts]);
  const activeKey = active.map((a) => a.id).join(",");

  useEffect(() => {
    if (active.length === 0) return;
    const store = getPriceStore();
    const fired = new Set<string>();

    const unsubs = active.map((alert) =>
      store.subscribe(alert.instrument.token, () => {
        if (fired.has(alert.id)) return;
        const quote = store.get(alert.instrument.token);
        if (!quote) return;
        const hit =
          alert.condition === "above"
            ? quote.ltp >= alert.price
            : quote.ltp <= alert.price;
        if (!hit) return;
        fired.add(alert.id);
        markTriggered(alert.id, quote.ltp);
        const title = `${alert.instrument.symbol} ${alert.condition === "above" ? "↑ above" : "↓ below"} ₹${formatPrice(alert.price)}`;
        toast({ tone: "info", title, body: `LTP ₹${formatPrice(quote.ltp)}` });
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification(`Indian Market — ${title}`, {
              body: `Last traded price ₹${formatPrice(quote.ltp)}`,
            });
          } catch {
            // Notifications unavailable (e.g. insecure context) — toast shown anyway.
          }
        }
      }),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  return null;
}
