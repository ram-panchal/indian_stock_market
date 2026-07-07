"use client";

import Link from "next/link";
import { useMarketStatus } from "@/lib/hooks/use-market-status";

const IST_MS = 5.5 * 3600 * 1000;

function nextOpenLabel(): string {
  const ist = new Date(Date.now() + IST_MS);
  const day = ist.getUTCDay();
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const beforeOpen = minutes < 9 * 60 + 15;
  if (day >= 1 && day <= 5 && beforeOpen) return "today 09:15 AM";
  if (day === 5 || day === 6) return "Monday 09:15 AM";
  return "tomorrow 09:15 AM";
}

export function SessionFooter() {
  const status = useMarketStatus();

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
            status === "open" ? "bg-up-muted" : "bg-surface-2"
          }`}
        >
          {status === "open" ? "🟢" : "✓"}
        </span>
        <div className="text-xs">
          <p className="font-semibold text-ink">You&apos;re all set!</p>
          <p className="text-ink-3">
            {status === "open"
              ? "Market open · Closes 15:30 IST"
              : status === "pre-open"
                ? "Pre-open session · Trading starts 09:15 IST"
                : `Markets closed · Opens ${nextOpenLabel()}`}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border border-accent/25 bg-accent-muted px-3 py-2 sm:justify-end">
        <div className="flex items-center gap-2 text-xs">
          <span aria-hidden>👑</span>
          <div>
            <p className="font-semibold text-accent">Paper Trading Mode</p>
            <p className="hidden text-[10px] text-ink-3 md:block">
              Practice with virtual funds — no real orders are ever placed
            </p>
          </div>
        </div>
        <Link
          href="/portfolio"
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          View Portfolio
        </Link>
      </div>
    </div>
  );
}
