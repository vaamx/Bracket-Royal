/** Unambiguous uppercase alphabet (no 0/O/1/I/L) for human-shareable codes. */
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Generate a random invite code. `rng` returns a float in [0,1) and defaults to a
 * crypto-backed source; it is injectable so tests can be deterministic.
 */
export function generateInviteCode(length = 6, rng: () => number = cryptoRandom): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += INVITE_ALPHABET[Math.floor(rng() * INVITE_ALPHABET.length)];
  }
  return out;
}

function cryptoRandom(): number {
  // 32-bit unsigned int / 2^32 -> [0,1)
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x100000000;
}
