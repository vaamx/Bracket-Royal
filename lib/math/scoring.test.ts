import { describe, it, expect } from "vitest";
import { outcomeOf } from "@/lib/math/scoring";

describe("outcomeOf", () => {
  it("returns home when home scores more", () => { expect(outcomeOf(2, 1)).toBe("home"); });
  it("returns away when away scores more", () => { expect(outcomeOf(0, 3)).toBe("away"); });
  it("returns draw when level", () => { expect(outcomeOf(1, 1)).toBe("draw"); });
});
