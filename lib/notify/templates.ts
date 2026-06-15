export interface MatchInfo {
  home: string;
  away: string;
  group: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

/** Push notification for an upcoming lock. */
export function lockReminderPush(m: MatchInfo): PushPayload {
  return {
    title: `⏰ ${m.home} vs ${m.away}`,
    body: "Predict before it locks at kickoff!",
    url: "/predict",
  };
}

/** Email for an upcoming lock. */
export function lockReminderEmail(m: MatchInfo): { subject: string; html: string } {
  const where = m.group ? `Group ${m.group}` : "Knockout";
  return {
    subject: `⏰ ${m.home} vs ${m.away} — lock your prediction`,
    html: `<div style="font-family:system-ui,sans-serif">
  <h2>${m.home} vs ${m.away}</h2>
  <p>${where} · World Cup 2026. This match locks at kickoff — get your prediction in.</p>
  <p><a href="https://localhost/predict" style="background:#d4af37;color:#0a1428;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:800">Predict now</a></p>
</div>`,
  };
}
