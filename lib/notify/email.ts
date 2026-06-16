import { Resend } from "resend";

/**
 * Send a transactional email. Prefers SendGrid (SENDGRID_API_KEY) since that's
 * our provider; falls back to Resend (RESEND_API_KEY) if configured. No-ops
 * (returns false) when neither is set. NOTE: sign-in / magic-link emails are
 * sent by Supabase Auth's SMTP, not here — this is for match reminders/results.
 */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const from =
    process.env.NOTIFY_EMAIL_FROM ?? process.env.SENDGRID_FROM_EMAIL ?? "onboarding@resend.dev";

  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (sendgridKey) {
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${sendgridKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: opts.to }] }],
          from: { email: from },
          subject: opts.subject,
          content: [{ type: "text/html", value: opts.html }],
        }),
      });
      return res.ok; // 202 Accepted on success
    } catch {
      return false;
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      const { error } = await resend.emails.send({ from, to: opts.to, subject: opts.subject, html: opts.html });
      return !error;
    } catch {
      return false;
    }
  }

  return false;
}
