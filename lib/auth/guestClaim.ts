import crypto from "node:crypto";

const TTL_MS = 60 * 60 * 1000; // 1 hour

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function hmac(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Sign a guest (anonymous) user id into a short-lived, tamper-proof token.
 * The secret is passed in (this module is pure — no env, no server-only).
 */
export function signGuestClaim(guestId: string, secret: string, nowMs: number = Date.now()): string {
  const payload = `${guestId}.${nowMs + TTL_MS}`;
  return `${b64urlEncode(payload)}.${hmac(payload, secret)}`;
}

/** Verify a guest-claim token; returns the guest id, or null if invalid/expired. */
export function verifyGuestClaim(token: string, secret: string, nowMs: number = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = hmac(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const [guestId, expStr] = payload.split(".");
  const exp = Number(expStr);
  if (!guestId || !Number.isFinite(exp) || exp < nowMs) return null;
  return guestId;
}
