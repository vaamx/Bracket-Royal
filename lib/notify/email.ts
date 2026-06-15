import { Resend } from "resend";

/** Send an email via Resend. No-ops (returns false) without RESEND_API_KEY. */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM ?? "onboarding@resend.dev";
  if (!key) return false;
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({ from, to: opts.to, subject: opts.subject, html: opts.html });
    return !error;
  } catch {
    return false;
  }
}
