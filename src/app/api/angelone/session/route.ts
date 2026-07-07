/**
 * Angel One SmartAPI session endpoint — DATA ACCESS ONLY.
 *
 * Performs loginByPassword server-side so ANGELONE_* secrets never reach the
 * browser, and returns only the tokens the client needs for the market-data
 * WebSocket. This route must never be extended to proxy order placement;
 * trading on this platform is paper-only by design.
 *
 * Without credentials configured it responds 503 with a clear reason — the
 * client falls back to the mock provider.
 */

import { NextResponse } from "next/server";
import { generateTOTP } from "@/lib/market/angelone/totp";

const LOGIN_URL =
  "https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword";

interface AngelLoginResponse {
  status: boolean;
  message: string;
  data?: {
    jwtToken: string;
    refreshToken: string;
    feedToken: string;
  };
}

export async function POST(): Promise<NextResponse> {
  const apiKey = process.env.ANGELONE_API_KEY;
  const clientCode = process.env.ANGELONE_CLIENT_CODE;
  const pin = process.env.ANGELONE_PIN;
  const totpSecret = process.env.ANGELONE_TOTP_SECRET;

  const missing = [
    !apiKey && "ANGELONE_API_KEY",
    !clientCode && "ANGELONE_CLIENT_CODE",
    !pin && "ANGELONE_PIN",
    !totpSecret && "ANGELONE_TOTP_SECRET",
  ].filter(Boolean);

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        reason: `Angel One credentials not configured (missing ${missing.join(", ")}). See .env.example.`,
      },
      { status: 503 },
    );
  }

  try {
    const totp = await generateTOTP(totpSecret!);
    const res = await fetch(LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-UserType": "USER",
        "X-SourceID": "WEB",
        "X-ClientLocalIP": "127.0.0.1",
        "X-ClientPublicIP": "127.0.0.1",
        "X-MACAddress": "00:00:00:00:00:00",
        "X-PrivateKey": apiKey!,
      },
      body: JSON.stringify({ clientcode: clientCode, password: pin, totp }),
      cache: "no-store",
    });
    const body = (await res.json()) as AngelLoginResponse;
    if (!body.status || !body.data) {
      return NextResponse.json(
        { ok: false, reason: `Angel One login failed: ${body.message}` },
        { status: 502 },
      );
    }
    // feedToken is required for the market-data WebSocket; jwtToken for REST
    // data endpoints. No order-scope usage exists in this codebase.
    return NextResponse.json({
      ok: true,
      feedToken: body.data.feedToken,
      jwtToken: body.data.jwtToken,
      apiKey,
      clientCode,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reason: `Angel One login request errored: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 502 },
    );
  }
}
