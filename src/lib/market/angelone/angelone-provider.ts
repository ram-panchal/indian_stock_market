/**
 * ANGEL ONE (SmartAPI) — market-DATA-only provider scaffold.
 *
 * ── Safety boundary ────────────────────────────────────────────────────────
 * This class implements the MarketDataProvider interface ONLY. There is no
 * order-placement code anywhere in this module (or this repository) — all
 * trading on this platform is paper trading executed by the local engine in
 * src/lib/trading. Do not add order APIs here.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Status: UNTESTED SCAFFOLD. It compiles and fails gracefully, but has never
 * run against real credentials. Wiring it live requires:
 *   1. Server env vars (see .env.example) — the login flow runs in the route
 *      handler at /api/angelone/session so the API key, PIN and TOTP secret
 *      never reach the browser.
 *   2. Instrument-master mapping (Angel One symboltoken ↔ our Instrument),
 *      via their published OpenAPIScripMaster JSON.
 *   3. SmartAPI WebSocket 2.0 (wss://smartapisocket.angelone.in/smart-stream)
 *      binary frame parsing for live ticks.
 * Until then the provider factory falls back to the mock provider and the UI
 * shows a "SIMULATED" badge.
 */

import type {
  Candle,
  Instrument,
  ListedQuote,
  Movers,
  OptionChain,
  Quote,
} from "../types";
import {
  ProviderUnavailableError,
  type ConnectionState,
  type MarketDataProvider,
  type Unsubscribe,
} from "../provider";

interface SessionResponse {
  ok: boolean;
  reason?: string;
  feedToken?: string;
  jwtToken?: string;
  apiKey?: string;
  clientCode?: string;
}

export class AngelOneMarketDataProvider implements MarketDataProvider {
  readonly id = "angelone";
  readonly displayName = "Angel One (live)";
  readonly isSimulated = false;

  private state: ConnectionState = "disconnected";
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private session: SessionResponse | null = null;
  private ws: WebSocket | null = null;

  async connect(): Promise<void> {
    this.setState("connecting");
    let res: Response;
    try {
      res = await fetch("/api/angelone/session", { method: "POST" });
    } catch {
      this.setState("error");
      throw new ProviderUnavailableError(
        this.id,
        "Could not reach the Angel One session endpoint.",
      );
    }
    const body = (await res.json()) as SessionResponse;
    if (!res.ok || !body.ok || !body.feedToken) {
      this.setState("error");
      throw new ProviderUnavailableError(
        this.id,
        body.reason ?? "Angel One session unavailable.",
      );
    }
    this.session = body;
    this.openWebSocket();
  }

  private openWebSocket(): void {
    if (!this.session?.feedToken) return;
    // SmartAPI WebSocket 2.0. Auth headers are passed via query params for
    // browser clients per Angel One's smartapi-javascript reference client.
    const url =
      "wss://smartapisocket.angelone.in/smart-stream" +
      `?clientCode=${encodeURIComponent(this.session.clientCode ?? "")}` +
      `&feedToken=${encodeURIComponent(this.session.feedToken)}` +
      `&apiKey=${encodeURIComponent(this.session.apiKey ?? "")}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";
    this.ws.onopen = () => this.setState("connected");
    this.ws.onerror = () => this.setState("error");
    this.ws.onclose = () => this.setState("disconnected");
    this.ws.onmessage = () => {
      // TODO(angelone): parse SmartStream binary tick frames into Quote
      // objects and fan out to subscribeQuotes listeners. Requires live
      // credentials to develop against — intentionally left unimplemented.
    };
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.setState("disconnected");
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  onConnectionStateChange(cb: (s: ConnectionState) => void): Unsubscribe {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    for (const cb of this.stateListeners) cb(state);
  }

  private unavailable(): never {
    throw new ProviderUnavailableError(
      this.id,
      "Angel One data APIs are not wired up yet (scaffold only).",
    );
  }

  async searchInstruments(): Promise<Instrument[]> {
    return this.unavailable();
  }
  async getInstrument(): Promise<Instrument | undefined> {
    return this.unavailable();
  }
  async getIndices(): Promise<ListedQuote[]> {
    return this.unavailable();
  }
  async getMovers(): Promise<Movers> {
    return this.unavailable();
  }
  async getQuote(): Promise<Quote> {
    return this.unavailable();
  }
  async getOptionUnderlyings(): Promise<Instrument[]> {
    return this.unavailable();
  }
  async getOptionExpiries(): Promise<string[]> {
    return this.unavailable();
  }
  async getOptionChain(): Promise<OptionChain> {
    return this.unavailable();
  }
  async getCandles(): Promise<Candle[]> {
    return this.unavailable();
  }
  subscribeQuotes(): Unsubscribe {
    return () => {};
  }
  subscribeDepth(): Unsubscribe {
    return () => {};
  }
}
