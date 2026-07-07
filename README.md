# Indian Market — Paper Trading Terminal

A professional-grade Indian stock market terminal built with Next.js 16,
TypeScript and Tailwind CSS v4: live dashboard, option chain, candlestick
charting, watchlists, alerts, market depth and a full **paper-trading**
engine.

> **Safety guarantee: this platform never places real orders.** There is no
> broker order API anywhere in the codebase. Market data flows in through a
> provider abstraction; every buy/sell is executed by the local paper engine
> (`src/lib/trading/`) against live quotes and stored in `localStorage`.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

No credentials are needed — the app boots on the built-in market **simulator**
and shows a `SIMULATED` badge in the header.

## Real vs. mocked — current status

| Area | Status |
| --- | --- |
| Market data (quotes, movers, chain, candles, depth) | **Simulated** in-browser engine (`src/lib/market/mock/`). Coherent random walk + Black–Scholes option pricing; ticks 24×7. |
| Market session clock (open/pre-open/closed) | **Real** IST logic (holidays not modelled). |
| Paper trading (orders, fills, positions, P&L, funds) | **Real engine, simulated fills** at the live bid/ask of whichever feed is active. Zero brokerage/taxes; short-option margin is a flat 20% of notional. |
| Charting | **Real** — TradingView **lightweight-charts** v5 (open source, Apache-2.0). The licensed "Advanced Charts" library is *not* used; the `ChartEngine` interface (`src/lib/chart/chart-engine.ts`) is the swap seam if a license is obtained. |
| Angel One SmartAPI | **Untested scaffold**, market-data only. Server-side login route + client provider skeleton; WebSocket tick parsing is TODO and requires live credentials. |

## Wiring up Angel One (data only)

1. Copy `.env.example` to `.env.local` and fill the `ANGELONE_*` variables
   (server-side only — never `NEXT_PUBLIC_`).
2. Set `NEXT_PUBLIC_DATA_PROVIDER=angelone`.
3. Complete the scaffold in `src/lib/market/angelone/angelone-provider.ts`
   (instrument master mapping + SmartStream binary frame parsing).

If credentials are missing or login fails, the app **falls back to the
simulator** and shows a banner explaining why — it never crashes and never
silently pretends to be live.

## Architecture

```
src/lib/market/          provider seam
  types.ts               domain types (Instrument, Quote, OptionChain, …)
  provider.ts            MarketDataProvider interface (REST + streaming)
  mock/                  simulator: seed universe, tick engine, Black–Scholes
  angelone/              Angel One scaffold (data only)
  price-store.ts         per-token quote cache → useSyncExternalStore
src/lib/trading/         paper engine: orders/fills; positions, cash and P&L
                         are ALWAYS re-derived from the trade log (no drift)
src/lib/chart/           ChartEngine seam + lightweight-charts impl + drawings
src/lib/indicators/      SMA/EMA/RSI/MACD/Bollinger/VWAP (pure functions)
src/lib/stores/          watchlist + alerts (localStorage)
src/components/          shell, dashboard, options, charts, portfolio, ui
```

**Render performance:** every live price cell subscribes to its own token
(`useQuote` → `useSyncExternalStore`), so a tick re-renders only the cells
showing that instrument — never the page. Provider subscriptions are
ref-counted in `price-store.ts`.

## Scripts

```bash
npm run dev      # dev server (Turbopack)
npm run build    # production build
npm start        # serve production build
npm run lint     # eslint
```
