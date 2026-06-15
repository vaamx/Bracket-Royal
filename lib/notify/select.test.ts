import { describe, it, expect } from "vitest";
import { selectDueReminders } from "@/lib/notify/select";

const base = {
  dueMatches: [{ id: "GA-MEX-BEL", lockAtMs: 1_000 }],
  users: [
    { userId: "u1", push: true, email: true },
    { userId: "u2", push: false, email: false },
  ],
  predictedPairs: new Set<string>(),
  sentPairs: new Set<string>(),
};

describe("selectDueReminders", () => {
  it("includes a user's enabled channels for a due, unpredicted, un-sent match", () => {
    const out = selectDueReminders(base);
    expect(out).toEqual([{ userId: "u1", matchId: "GA-MEX-BEL", channels: ["push", "email"] }]);
  });

  it("skips users with no channel enabled", () => {
    const out = selectDueReminders(base);
    expect(out.find((r) => r.userId === "u2")).toBeUndefined();
  });

  it("skips a match the user already predicted", () => {
    const out = selectDueReminders({ ...base, predictedPairs: new Set(["u1:GA-MEX-BEL"]) });
    expect(out).toHaveLength(0);
  });

  it("does not re-send a channel already logged, but still sends the other", () => {
    const out = selectDueReminders({ ...base, sentPairs: new Set(["u1:GA-MEX-BEL:push"]) });
    expect(out).toEqual([{ userId: "u1", matchId: "GA-MEX-BEL", channels: ["email"] }]);
  });

  it("emits nothing when both channels were already sent", () => {
    const out = selectDueReminders({ ...base, sentPairs: new Set(["u1:GA-MEX-BEL:push", "u1:GA-MEX-BEL:email"]) });
    expect(out).toHaveLength(0);
  });
});
