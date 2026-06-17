/** Public base URL for links in emails. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bracket-royal.vercel.app";

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
  <p><a href="${SITE_URL}/predict" style="background:#d4af37;color:#0a1428;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:800">Predict now</a></p>
</div>`,
  };
}

export interface WinItem {
  kind: "exact" | "goals";
  detail: string;
}

const WIN_COPY = {
  en: {
    subject: (n: number) => `🏅 You won ${n} ${n === 1 ? "medal" : "medals"} today!`,
    heading: "Daily Wins",
    greeting: (name: string) => `Nice calls, ${name}!`,
    intro: "Your predictions just paid off. Here's what you earned today:",
    exact: "Exact score",
    goals: "Exact goals",
    cta: "See your medals",
    footer: "Bracket Royale · World Cup 2026",
    unsub: "You're getting this because email reminders are on in your settings.",
  },
  es: {
    subject: (n: number) => `🏅 ¡Ganaste ${n} ${n === 1 ? "medalla" : "medallas"} hoy!`,
    heading: "Victorias del día",
    greeting: (name: string) => `¡Bien jugado, ${name}!`,
    intro: "Tus pronósticos dieron en el blanco. Esto es lo que ganaste hoy:",
    exact: "Marcador exacto",
    goals: "Goles exactos",
    cta: "Ver mis medallas",
    footer: "Bracket Royale · Mundial 2026",
    unsub: "Recibes esto porque tienes activados los recordatorios por correo.",
  },
} as const;

/** A beautiful dark, gold-accented digest of the day's medals. */
export function dailyWinsEmail(name: string, wins: WinItem[], locale: "en" | "es" = "en"): { subject: string; html: string } {
  const c = WIN_COPY[locale] ?? WIN_COPY.en;
  const rows = wins
    .map((w) => {
      const emoji = w.kind === "exact" ? "🎯" : "⚽";
      const label = w.kind === "exact" ? c.exact : c.goals;
      return `<tr>
        <td style="padding:12px 14px;border-radius:14px;background:#0e1b38;border:1px solid rgba(212,175,55,0.25)">
          <span style="font-size:22px;vertical-align:middle">${emoji}</span>
          <span style="color:#f4d56a;font-weight:800;margin-left:8px">${label}</span>
          <span style="color:#cdd6e6;margin-left:8px">${w.detail}</span>
        </td>
      </tr><tr><td style="height:10px"></td></tr>`;
    })
    .join("");

  return {
    subject: c.subject(wins.length),
    html: `<div style="margin:0;padding:24px;background:#070f20;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto">
    <tr><td style="text-align:center;padding-bottom:8px">
      <div style="font-size:40px">🏆</div>
      <div style="color:#9aa7c2;font-size:11px;font-weight:800;letter-spacing:3px;margin-top:6px">${c.heading.toUpperCase()}</div>
    </td></tr>
    <tr><td style="background:linear-gradient(180deg,rgba(212,175,55,0.14),rgba(212,175,55,0));border:1px solid rgba(212,175,55,0.25);border-radius:20px;padding:22px">
      <h1 style="margin:0 0 6px;color:#ffffff;font-size:22px;font-weight:900">${c.greeting(name)}</h1>
      <p style="margin:0 0 16px;color:#aeb9d0;font-size:14px;line-height:1.5">${c.intro}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <div style="text-align:center;margin-top:18px">
        <a href="${SITE_URL}/settings" style="display:inline-block;background:linear-gradient(90deg,#d4af37,#f4d56a);color:#0a1428;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:900;font-size:14px">${c.cta} →</a>
      </div>
    </td></tr>
    <tr><td style="text-align:center;padding-top:16px">
      <div style="color:#6b7798;font-size:11px">${c.footer}</div>
      <div style="color:#4a5572;font-size:10px;margin-top:4px">${c.unsub}</div>
    </td></tr>
  </table>
</div>`,
  };
}
