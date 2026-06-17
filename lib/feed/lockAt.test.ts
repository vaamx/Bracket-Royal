import { describe, it, expect } from "vitest";
import { lockAtFor, HALFTIME_LOCK_MINUTES } from "@/lib/feed/ingestWorldCup";

describe("lockAtFor (predict until ~halftime)", () => {
  it("locks HALFTIME_LOCK_MINUTES after kickoff, not at kickoff", () => {
    const kickoff = "2026-06-20T18:00:00.000Z";
    expect(lockAtFor(kickoff)).toBe("2026-06-20T18:50:00.000Z");
    expect(HALFTIME_LOCK_MINUTES).toBe(50);
  });

  it("always locks strictly after kickoff", () => {
    const kickoff = "2026-07-01T12:34:00.000Z";
    expect(new Date(lockAtFor(kickoff)).getTime()).toBeGreaterThan(new Date(kickoff).getTime());
  });
});
