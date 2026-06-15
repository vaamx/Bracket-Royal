import { describe, it, expect } from "vitest";
import { buildIcs } from "@/lib/calendar/ics";

describe("buildIcs", () => {
  const events = [
    { uid: "GA-MEX-BEL", start: "2026-06-11T18:00:00Z", summary: "Mexico vs Belgium — predict by kickoff", description: "World Cup 2026 · Group A" },
  ];

  it("wraps events in a VCALENDAR with one VEVENT", () => {
    const ics = buildIcs(events, "2026-06-01T00:00:00Z");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  });

  it("formats the start as a UTC timestamp and includes uid + summary", () => {
    const ics = buildIcs(events, "2026-06-01T00:00:00Z");
    expect(ics).toContain("DTSTART:20260611T180000Z");
    expect(ics).toContain("UID:GA-MEX-BEL");
    expect(ics).toContain("SUMMARY:Mexico vs Belgium — predict by kickoff");
  });

  it("escapes commas and newlines in text fields", () => {
    const ics = buildIcs([{ uid: "x", start: "2026-06-11T18:00:00Z", summary: "A, B", description: "line1\nline2" }], "2026-06-01T00:00:00Z");
    expect(ics).toContain("SUMMARY:A\\, B");
    expect(ics).toContain("DESCRIPTION:line1\\nline2");
  });

  it("uses CRLF line endings and terminates the final line (RFC 5545)", () => {
    const ics = buildIcs(events, "2026-06-01T00:00:00Z");
    expect(ics.includes("\r\n")).toBe(true);
    expect(ics.endsWith("\r\n")).toBe(true);
  });
});
