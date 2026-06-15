import { describe, it, expect } from "vitest";
import { lockReminderPush, lockReminderEmail } from "@/lib/notify/templates";

const match = { home: "Mexico", away: "Belgium", group: "A" };

describe("notification templates", () => {
  it("push payload has a title, body, and a deep link to /predict", () => {
    const p = lockReminderPush(match);
    expect(p.title).toMatch(/Mexico.*Belgium/);
    expect(p.body.toLowerCase()).toContain("lock");
    expect(p.url).toBe("/predict");
  });

  it("email has a subject and HTML body naming both teams", () => {
    const e = lockReminderEmail(match);
    expect(e.subject).toMatch(/Mexico|Belgium/);
    expect(e.html).toContain("Mexico");
    expect(e.html).toContain("Belgium");
    expect(e.html).toContain("</");
  });
});
