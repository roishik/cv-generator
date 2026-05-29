/**
 * HMAC-signed download token for LocalFsStorage.
 *
 * Structure (URL-safe base64, dot-delimited):
 *   <payload_b64>.<signature_b64>
 *
 * Payload (JSON, base64url):
 *   { key: string; exp: number }   // exp = unix epoch seconds
 *
 * Signature: HMAC-SHA256(STORAGE_SIGNING_SECRET, payload_b64)
 *
 * The `/api/files/[token]` route handler verifies the token and streams
 * the file from LocalFsStorage. The ownership check (userId ⊂ key) is
 * performed by the route handler BEFORE calling getSignedUrl.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const ALGORITHM = "sha256";

/** Encode a Buffer or string to URL-safe base64 (no padding). */
function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

/** Decode a URL-safe base64 string to a Buffer. */
function b64urlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function sign(secret: string, payload: string): string {
  return createHmac(ALGORITHM, secret).update(payload).digest("base64url");
}

export interface TokenPayload {
  key: string;
  exp: number; // unix epoch seconds
}

/**
 * Mint a signed download token for the given storage key.
 *
 * @param secret     STORAGE_SIGNING_SECRET
 * @param key        storage object key
 * @param ttlSeconds token lifetime (default 3600 = 1 hour)
 */
export function mintToken(secret: string, key: string, ttlSeconds = 3600): string {
  const payload: TokenPayload = {
    key,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = sign(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

/**
 * Verify a signed download token and return the payload.
 *
 * @throws if the token is expired, malformed, or the signature does not match.
 */
export function verifyToken(secret: string, token: string): TokenPayload {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 1) {
    throw new Error("malformed token: missing signature");
  }
  const payloadB64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  // Constant-time signature comparison.
  const expected = sign(secret, payloadB64);
  const sigBuf = b64urlDecode(sig);
  const expectedBuf = b64urlDecode(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error("invalid token: signature mismatch");
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as TokenPayload;
  } catch {
    throw new Error("malformed token: payload is not valid JSON");
  }

  if (typeof payload.key !== "string" || typeof payload.exp !== "number") {
    throw new Error("malformed token: missing required fields");
  }
  if (Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error("token expired");
  }
  return payload;
}
