export interface IcsEvent {
  uid: string;
  start: string; // ISO timestamp
  summary: string;
  description?: string;
}

/** Format an ISO timestamp as an iCalendar UTC value: YYYYMMDDTHHMMSSZ. */
function toIcsUtc(iso: string): string {
  const digits = iso.replace(/[-:]/g, ""); // 2026-06-11T18:00:00Z -> 20260611T180000Z (or with .000Z)
  const m = digits.match(/(\d{8}T\d{6})/);
  return m ? `${m[1]}Z` : digits;
}

/** Escape iCalendar TEXT (RFC 5545 §3.3.11). */
function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Build a VCALENDAR document with one VEVENT per event. `dtstamp` is the ISO "now". */
export function buildIcs(events: IcsEvent[], dtstamp: string): string {
  const stamp = toIcsUtc(dtstamp);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bracket Royale//WC2026//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsUtc(e.start)}`,
      `SUMMARY:${esc(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  // RFC 5545: every content line ends with CRLF (terminator, not just separator).
  return lines.join("\r\n") + "\r\n";
}
