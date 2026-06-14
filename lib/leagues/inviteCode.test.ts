import { describe, it, expect } from "vitest";
import { generateInviteCode, INVITE_ALPHABET } from "@/lib/leagues/inviteCode";

describe("generateInviteCode", () => {
  it("is 6 chars by default, all from the unambiguous alphabet", () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(6);
    for (const ch of code) expect(INVITE_ALPHABET).toContain(ch);
  });

  it("honors a custom length", () => {
    expect(generateInviteCode(8)).toHaveLength(8);
  });

  it("excludes ambiguous characters (0/O/1/I/L)", () => {
    expect(INVITE_ALPHABET).not.toMatch(/[0O1IL]/);
  });

  it("is deterministic given an injected rng (for testability)", () => {
    // rng returns 0 -> always the first alphabet char
    const code = generateInviteCode(4, () => 0);
    expect(code).toBe(INVITE_ALPHABET[0].repeat(4));
  });
});
