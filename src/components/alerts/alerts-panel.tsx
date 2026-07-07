"use client";

import { formatISTDateTime, formatPrice } from "@/lib/market/format";
import { removeAlert, useAlerts } from "@/lib/stores/alerts-store";
import { LtpCell } from "@/components/market/price-cells";

export function AlertsPanel({ onClose }: { onClose: () => void }) {
  const alerts = useAlerts();
  const active = alerts.filter((a) => !a.triggeredAt);
  const triggered = alerts.filter((a) => a.triggeredAt);

  return (
    <>
      <div className="fixed inset-0 z-70 bg-black/40" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-80 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Price alerts</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-ink"
            aria-label="Close alerts"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto scroll-thin">
          {alerts.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-ink-3">
              No alerts yet. Create one from the watchlist, search, or any
              instrument menu.
            </p>
          ) : (
            <>
              {active.length > 0 ? (
                <Section title={`Active (${active.length})`}>
                  {active.map((a) => (
                    <AlertRow key={a.id} id={a.id}>
                      <div>
                        <p className="text-xs font-medium text-ink">
                          {a.instrument.symbol}{" "}
                          <span className="text-ink-3">
                            {a.condition} ₹{formatPrice(a.price)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-3">
                          LTP <LtpCell token={a.instrument.token} />
                        </p>
                      </div>
                    </AlertRow>
                  ))}
                </Section>
              ) : null}
              {triggered.length > 0 ? (
                <Section title={`Triggered (${triggered.length})`}>
                  {triggered.map((a) => (
                    <AlertRow key={a.id} id={a.id}>
                      <div>
                        <p className="text-xs font-medium text-ink-2">
                          {a.instrument.symbol}{" "}
                          <span className="text-ink-3">
                            {a.condition} ₹{formatPrice(a.price)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-warn">
                          Hit ₹{formatPrice(a.triggeredPrice ?? a.price)} ·{" "}
                          {formatISTDateTime(a.triggeredAt!)}
                        </p>
                      </div>
                    </AlertRow>
                  ))}
                </Section>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border">
      <p className="px-4 pt-3 pb-1 text-[10px] font-medium tracking-wide text-ink-3 uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function AlertRow({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 hover:bg-surface-2">
      {children}
      <button
        onClick={() => removeAlert(id)}
        className="rounded p-1 text-ink-3 hover:text-down"
        title="Delete alert"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M2 3.5h10M5.5 3V2h3v1M3.5 3.5l.6 8.5h5.8l.6-8.5" />
        </svg>
      </button>
    </div>
  );
}
