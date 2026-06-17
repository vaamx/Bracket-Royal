import { describe, it, expect } from "vitest";
import { signGuestClaim, verifyGuestClaim } from "@/lib/auth/guestClaim";

const SECRET = "test-secret";
const GUEST = "11111111-1111-1111-1111-111111111111";
const NOW = 1_000_000_000_000;

describe("guestClaim", () => {
  it("round-trips a guest id", () => {
    const token = signGuestClaim(GUEST, SECRET, NOW);
    expect(verifyGuestClaim(token, SECRET, NOW)).toBe(GUEST);
  });

  it("rejects a tampered token", () => {
    const token = signGuestClaim(GUEST, SECRET, NOW);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifyGuestClaim(tampered, SECRET, NOW)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signGuestClaim(GUEST, SECRET, NOW);
    expect(verifyGuestClaim(token, "other-secret", NOW)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signGuestClaim(GUEST, SECRET, NOW);
    expect(verifyGuestClaim(token, SECRET, NOW + 60 * 60 * 1000 + 1)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyGuestClaim("not-a-token", SECRET, NOW)).toBeNull();
    expect(verifyGuestClaim("", SECRET, NOW)).toBeNull();
  });
});
