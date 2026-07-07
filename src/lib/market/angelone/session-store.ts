/**
 * Angel One SmartAPI session — SERVER ONLY.
 *
 * Holds the logged-in session (jwt + feed token) in a process-level singleton
 * so the ANGELONE_* secrets never leave the server. All authenticated market-
 * data routes call `withAngelSession` / `angelDataHeaders`.
 *
 * ── Safety boundary ────────────────────────────────────────────────────────
 * DATA ACCESS ONLY. There is no order-placement usage anywhere. The jwt is
 * used exclusively for market-data REST endpoints (quote, candles, greeks).
 * ───────────────────────────────────────────────────────────────────────────
 */

import { generateTOTP } from "./totp";

const LOGIN_URL =
  "https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword";

/** Re-login after this long even if the token would still be accepted. */
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

export interface AngelSession {
  jwtToken: string;
  refreshToken: string;
  feedToken: string;
  apiKey: string;
  clientCode: string;
  obtainedAt: number;
}

export interface AngelCreds {
  apiKey: string;
  clientCode: string;
  pin: string;
  totpSecret: string;
}

interface AngelLoginResponse {
  status: boolean;
  message: string;
  data?: { jwtToken: string; refreshToken: string; feedToken: string };
}

export class AngelCredsError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Angel One credentials not configured (missing ${missing.join(", ")}).`);
    this.name = "AngelCredsError";
  }
}

export class AngelLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AngelLoginError";
  }
}

function readCreds(): AngelCreds {
  const apiKey = process.env.ANGELONE_API_KEY;
  const clientCode = process.env.ANGELONE_CLIENT_CODE;
  const pin = process.env.ANGELONE_PIN;
  const totpSecret = process.env.ANGELONE_TOTP_SECRET;
  const missing = [
    !apiKey && "ANGELONE_API_KEY",
    !clientCode && "ANGELONE_CLIENT_CODE",
    !pin && "ANGELONE_PIN",
    !totpSecret && "ANGELONE_TOTP_SECRET",
  ].filter((x): x is string => Boolean(x));
  if (missing.length > 0) throw new AngelCredsError(missing);
  return { apiKey: apiKey!, clientCode: clientCode!, pin: pin!, totpSecret: totpSecret! };
}

export function credsStatus(): { ok: boolean; missing: string[] } {
  try {
    readCreds();
    return { ok: true, missing: [] };
  } catch (err) {
    return { ok: false, missing: err instanceof AngelCredsError ? err.missing : [] };
  }
}

/** Common Angel REST headers. `session` adds the bearer for data endpoints. */
export function angelHeaders(apiKey: string, jwtToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "127.0.0.1",
    "X-ClientPublicIP": "127.0.0.1",
    "X-MACAddress": "00:00:00:00:00:00",
    "X-PrivateKey": apiKey,
  };
  if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`;
  return headers;
}

let cached: AngelSession | null = null;
let inflight: Promise<AngelSession> | null = null;

async function login(creds: AngelCreds): Promise<AngelSession> {
  const totp = await generateTOTP(creds.totpSecret);
  let res: Response;
  try {
    res = await fetch(LOGIN_URL, {
      method: "POST",
      headers: angelHeaders(creds.apiKey),
      body: JSON.stringify({
        clientcode: creds.clientCode,
        password: creds.pin,
        totp,
      }),
      cache: "no-store",
    });
  } catch (err) {
    throw new AngelLoginError(
      `Angel One login request failed: ${err instanceof Error ? err.message : "network error"}`,
    );
  }
  const body = (await res.json().catch(() => null)) as AngelLoginResponse | null;
  if (!body?.status || !body.data) {
    throw new AngelLoginError(`Angel One login rejected: ${body?.message ?? `HTTP ${res.status}`}`);
  }
  return {
    jwtToken: body.data.jwtToken,
    refreshToken: body.data.refreshToken,
    feedToken: body.data.feedToken,
    apiKey: creds.apiKey,
    clientCode: creds.clientCode,
    obtainedAt: Date.now(),
  };
}

/**
 * Get a valid session, logging in (and caching) on demand. Concurrent callers
 * share one in-flight login. Pass `forceRefresh` after a 401 to re-login.
 */
export async function getAngelSession(forceRefresh = false): Promise<AngelSession> {
  const creds = readCreds(); // throws AngelCredsError if unconfigured
  const fresh = cached && Date.now() - cached.obtainedAt < SESSION_TTL_MS;
  if (!forceRefresh && fresh) return cached!;
  if (inflight) return inflight;
  inflight = login(creds)
    .then((s) => {
      cached = s;
      return s;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Run an authenticated data request, transparently re-logging in once if the
 * server rejects the token (401). `run` receives fresh session + headers.
 */
export async function withAngelSession<T>(
  run: (session: AngelSession, headers: HeadersInit) => Promise<{ status: number; value: T }>,
): Promise<T> {
  let session = await getAngelSession();
  let out = await run(session, angelHeaders(session.apiKey, session.jwtToken));
  if (out.status === 401) {
    session = await getAngelSession(true);
    out = await run(session, angelHeaders(session.apiKey, session.jwtToken));
  }
  return out.value;
}
