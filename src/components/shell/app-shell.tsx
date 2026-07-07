"use client";

/**
 * Client application shell: top navigation, index ticker, right watchlist
 * rail, mobile tab bar, and all global overlays (search, alerts, trade
 * ticket, toasts).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Instrument } from "@/lib/market/types";
import { formatCompact } from "@/lib/market/format";
import { getProviderHandle } from "@/lib/market/provider-factory";
import { seedDefaultWatchlist } from "@/lib/stores/watchlist-store";
import { useAlerts } from "@/lib/stores/alerts-store";
import { usePaperState } from "@/lib/hooks/use-paper-trading";
import { useProviderInfo } from "@/lib/hooks/use-provider-info";
import { computeCash } from "@/lib/trading/derive";
import { ThemeProvider, useTheme } from "@/components/theme/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { TradeTicketProvider } from "@/components/trading/trade-ticket";
import { SearchPalette } from "@/components/shell/search-palette";
import { MarketStatusBadge } from "@/components/shell/market-status-badge";
import { DataSourceBadge } from "@/components/shell/data-source-badge";
import { IndexTicker } from "@/components/shell/index-ticker";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import { AlertsWatcher } from "@/components/alerts/alerts-watcher";
import { AlertDialog } from "@/components/alerts/alert-dialog";
import { WatchlistPanel } from "@/components/watchlist/watchlist-panel";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/options", label: "Option chain" },
  { href: "/charts", label: "Charts" },
  { href: "/portfolio", label: "Portfolio" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <TradeTicketProvider>
          <ShellInner>{children}</ShellInner>
        </TradeTicketProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [alertTarget, setAlertTarget] = useState<Instrument | null>(null);
  const info = useProviderInfo();

  useEffect(() => {
    const handle = getProviderHandle();
    handle.ready.then(() =>
      seedDefaultWatchlist((token) => handle.provider.getInstrument(token)),
    );
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav
        onSearch={() => setSearchOpen(true)}
        onAlerts={() => setAlertsOpen(true)}
        onWatchlist={() => setWatchlistOpen((o) => !o)}
      />
      <IndexTicker />
      {info?.fallbackReason ? (
        <div className="border-b border-warn/30 bg-warn-muted px-4 py-1.5 text-center text-[11px] text-warn">
          Live feed unavailable — {info.fallbackReason} Running on simulated
          data.
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 pb-16 md:pb-0">{children}</main>
        <aside className="hidden w-72 shrink-0 border-l border-border bg-surface xl:block">
          <WatchlistPanel
            onSearch={() => setSearchOpen(true)}
            onCreateAlert={setAlertTarget}
          />
        </aside>
      </div>

      <MobileNav />

      {/* Slide-over watchlist below xl */}
      {watchlistOpen ? (
        <>
          <div
            className="fixed inset-0 z-70 bg-black/40 xl:hidden"
            onClick={() => setWatchlistOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-80 w-full max-w-sm border-l border-border bg-surface shadow-2xl xl:hidden">
            <WatchlistPanel
              onSearch={() => {
                setWatchlistOpen(false);
                setSearchOpen(true);
              }}
              onCreateAlert={(inst) => {
                setWatchlistOpen(false);
                setAlertTarget(inst);
              }}
            />
          </aside>
        </>
      ) : null}

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onCreateAlert={setAlertTarget}
      />
      {alertsOpen ? <AlertsPanel onClose={() => setAlertsOpen(false)} /> : null}
      <AlertDialog instrument={alertTarget} onClose={() => setAlertTarget(null)} />
      <AlertsWatcher />
    </div>
  );
}

function TopNav({
  onSearch,
  onAlerts,
  onWatchlist,
}: {
  onSearch: () => void;
  onAlerts: () => void;
  onWatchlist: () => void;
}) {
  const pathname = usePathname();
  const alerts = useAlerts();
  const activeAlerts = alerts.filter((a) => !a.triggeredAt).length;

  return (
    <header className="flex h-12 items-center gap-3 border-b border-border bg-surface px-3 sm:px-4">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-accent text-[11px] font-bold text-white">
          IM
        </span>
        <span className="hidden text-sm font-semibold text-ink md:block">
          Indian Market
        </span>
      </Link>

      <nav className="hidden items-center gap-1 md:flex">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-surface-3 text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onSearch}
          className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-ink-3 hover:text-ink-2"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6" cy="6" r="4.5" />
            <path d="M9.5 9.5L13 13" />
          </svg>
          <span className="hidden lg:inline">Search</span>
          <kbd className="hidden rounded border border-border px-1 text-[9px] lg:inline">
            ⌘K
          </kbd>
        </button>

        <FundsChip />
        <MarketStatusBadge />
        <DataSourceBadge />

        <button
          onClick={onAlerts}
          className="relative rounded-md border border-border p-1.5 text-ink-2 hover:text-ink"
          title="Price alerts"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M8 2a4 4 0 0 0-4 4c0 3-1 4-1.5 4.7h11C13 10 12 9 12 6a4 4 0 0 0-4-4zM6.5 12.5a1.5 1.5 0 0 0 3 0" />
          </svg>
          {activeAlerts > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-semibold text-white">
              {activeAlerts}
            </span>
          ) : null}
        </button>

        <button
          onClick={onWatchlist}
          className="rounded-md border border-border p-1.5 text-ink-2 hover:text-ink xl:hidden"
          title="Watchlist"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M2 4h12M2 8h12M2 12h8" />
          </svg>
        </button>

        <ThemeToggle />
      </div>
    </header>
  );
}

function FundsChip() {
  const state = usePaperState();
  const cash = computeCash(state);
  return (
    <Link
      href="/portfolio"
      className="hidden items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] sm:flex"
      title="Paper trading funds (virtual)"
    >
      <span className="text-ink-3">Funds</span>
      <span className="tnum font-medium text-ink">₹{formatCompact(cash)}</span>
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="rounded-md border border-border p-1.5 text-ink-2 hover:text-ink"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="8" cy="8" r="3.2" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7z" />
        </svg>
      )}
    </button>
  );
}

function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-60 grid grid-cols-4 border-t border-border bg-surface md:hidden">
      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className={`py-2.5 text-[10px] font-medium ${active ? "text-accent" : "text-ink-3"}`}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
