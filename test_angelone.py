"""Manual smoke test for the Angel One loginByPassword endpoint.

Reads credentials from the environment (never hardcode secrets here) and
computes a real 6-digit TOTP from the base32 secret. Usage:

    export $(grep -v '^#' .env.local | xargs)   # or set the vars yourself
    python3 test_angelone.py
"""
import base64
import hashlib
import hmac
import http.client
import json
import os
import struct
import time


def generate_totp(secret: str, for_time: float | None = None) -> str:
    for_time = time.time() if for_time is None else for_time
    clean = secret.upper().replace(" ", "")
    clean += "=" * (-len(clean) % 8)
    key = base64.b32decode(clean, casefold=True)
    counter = struct.pack(">Q", int(for_time // 30))
    digest = hmac.new(key, counter, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{code:06d}"


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


client_code = require_env("ANGELONE_CLIENT_CODE")
pin = require_env("ANGELONE_PIN")
api_key = require_env("ANGELONE_API_KEY")
totp_secret = require_env("ANGELONE_TOTP_SECRET")

payload = json.dumps({
    "clientcode": client_code,
    "password": pin,
    "totp": generate_totp(totp_secret),
})
headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '127.0.0.1',
    'X-MACAddress': '00:00:00:00:00:00',
    'X-PrivateKey': api_key,
}

conn = http.client.HTTPSConnection("apiconnect.angelone.in")
conn.request(
    "POST",
    "/rest/auth/angelbroking/user/v1/loginByPassword",
    payload,
    headers)

res = conn.getresponse()
data = res.read()
print(data.decode("utf-8"))
