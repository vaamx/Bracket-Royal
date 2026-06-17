"use client";

import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))) as Uint8Array<ArrayBuffer>;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** Register the SW, request permission, subscribe, and persist the subscription.
 *  Returns true on success. */
export async function enablePush(userId: string): Promise<boolean> {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!pushSupported() || !vapid) return false;
  const reg = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid),
  });
  const json = sub.toJSON();
  const keys = json.keys ?? { p256dh: "", auth: "" };
  const supabase = createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: "user_id,endpoint" }
  );
  return !error;
}

/** Upsert the user's notification preferences (locale drives transactional email language). */
export async function savePrefs(userId: string, prefs: { push: boolean; email: boolean; email_addr?: string | null; locale?: string }): Promise<boolean> {
  const supabase = createClient();
  const base: Record<string, unknown> = {
    user_id: userId, push_enabled: prefs.push, email_enabled: prefs.email,
    email: prefs.email_addr ?? null, updated_at: new Date().toISOString(),
  };
  const payload: Record<string, unknown> = prefs.locale ? { ...base, locale: prefs.locale } : base;
  const { error } = await supabase.from("notification_prefs").upsert(payload, { onConflict: "user_id" });
  if (!error) return true;
  // Fallback when the `locale` column isn't deployed yet (migration 0008 pending).
  const { error: e2 } = await supabase.from("notification_prefs").upsert(base, { onConflict: "user_id" });
  return !e2;
}
