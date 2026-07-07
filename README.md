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
| Market data (quotes, movers, chain, candles, depth) | **Live** via Angel One SmartAPI when `NEXT_PUBLIC_DATA_PROVIDER=angelone` and credentials are set (`src/lib/market/angelone/`); polls the batch quote endpoint ~1×/s while the market is open, holding at last trade when closed. Falls back to the **simulated** in-browser engine (`src/lib/market/mock/`) only when the provider is left unset. |
| Market session clock (open/pre-open/closed) | **Real** IST logic (holidays not modelled). |
| Paper trading (orders, fills, positions, P&L, funds) | **Real engine, simulated fills** at the live bid/ask of whichever feed is active. Zero brokerage/taxes; short-option margin is a flat 20% of notional. |
| Charting | **Real** — TradingView **lightweight-charts** v5 (open source, Apache-2.0). The licensed "Advanced Charts" library is *not* used; the `ChartEngine` interface (`src/lib/chart/chart-engine.ts`) is the swap seam if a license is obtained. |
| Angel One SmartAPI | **Live, market-data only.** Server-side login (TOTP) + instrument-master mapping + REST proxies for quotes/depth/candles/option-chain/greeks, driven by a consolidated ~1s poller. No order surface anywhere. Requires your own SmartAPI credentials. |

## Wiring up Angel One (data only)

You need a (free) Angel One demat account and a SmartAPI app. The four values
below go into `.env.local` (copy it from `.env.example`); they are **server-side
only** — never prefix them with `NEXT_PUBLIC_`.

### Prerequisite: an Angel One account

If you don't have one, open a demat/trading account at
https://www.angelone.in. You'll get a **Client ID** (a.k.a. client code, e.g.
`A123456`) and you'll set a 4-digit **MPIN** during onboarding. Market-data API
access is free — you do not need to fund the account (this app never trades
real money regardless).

### Step 1 — `ANGELONE_API_KEY` (create a SmartAPI app)

1. Go to https://smartapi.angelone.in and sign in with your Angel One account.
2. Open **"My Profile" → "Create an App"** (or the "Create App" button on the
   dashboard).
3. Choose app type **Market Feeds / Publisher** (any type exposes the API key;
   this project uses market-data endpoints only).
4. Fill in a name and, when asked, a **Redirect URL** — `http://localhost:3007`
   is fine for local use; it isn't used by this app's login flow.
5. Submit. The app now shows an **API Key** — copy it into `ANGELONE_API_KEY`.

### Step 2 — `ANGELONE_CLIENT_CODE`

Your Angel One login / Client ID (e.g. `A123456`). It's on your Angel One
profile and in the SmartAPI dashboard.

### Step 3 — `ANGELONE_PIN`

Your Angel One **MPIN** (the numeric PIN you use to log in). If you only ever
used a password + OTP, set/reset an MPIN from the Angel One app or web login.

### Step 4 — `ANGELONE_TOTP_SECRET` (the base32 secret, not the 6-digit code)

SmartAPI login requires a TOTP. You need the **secret** used to generate codes,
which this app turns into a fresh 6-digit code on every login.

1. Go to https://smartapi.angelone.in/enable-totp (or "Enable TOTP" in the
   SmartAPI dashboard) and authenticate.
2. It shows a QR code **and** a text secret — a ~16–32 char base32 string like
   `JBSWY3DPEHPK3PXP`. Copy that **secret string** into `ANGELONE_TOTP_SECRET`.
   - Optionally also scan the QR into an authenticator app so you can log in to
     the Angel One website; the app itself only needs the secret text.
   - ⚠️ The secret is shown **once** — save it now. If you lose it, re-enable
     TOTP to get a new one.

### Step 5 — run it

```bash
cp .env.example .env.local   # if you haven't already
# edit .env.local, paste the four values
npm run dev                  # http://localhost:3000
```

`.env.local` should look like:

```dotenv
NEXT_PUBLIC_DATA_PROVIDER=angelone
ANGELONE_API_KEY=your_api_key_here
ANGELONE_CLIENT_CODE=A123456
ANGELONE_PIN=1234
ANGELONE_TOTP_SECRET=JBSWY3DPEHPK3PXP
```

The header badge reads **LIVE** once connected. The integration is complete
(login, instrument-master mapping, and REST proxies for
quotes/depth/candles/option-chain/greeks are all wired). In this mode the app
**never** shows simulated data: if credentials are missing or login fails, the
badge reads **LIVE UNAVAILABLE** with the reason, and cells simply stop updating
rather than inventing prices. To use the simulator instead, unset
`NEXT_PUBLIC_DATA_PROVIDER` (or set it to anything but `angelone`).

> **Troubleshooting:** a login error mentioning *"Invalid totp"* almost always
> means the server clock is skewed (TOTP is time-based) or the wrong secret was
> pasted. *"Invalid credentials"* → check the client code / MPIN.

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
