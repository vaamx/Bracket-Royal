import webpush from "web-push";

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

let configured = false;
function ensureConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:noreply@example.com";
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
  }
  return true;
}

/** Send a push payload to one subscription. Returns true if sent, false if skipped/failed.
 *  No-ops (returns false) when VAPID keys are absent. */
export async function sendPush(sub: PushSub, payload: object): Promise<boolean> {
  if (!ensureConfigured()) return false;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return true;
  } catch {
    return false; // expired/invalid subscription — caller may prune
  }
}
