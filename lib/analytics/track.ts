import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnalyticsContext } from "@/lib/analytics/context";

export async function recordSession(userId: string, ctx: AnalyticsContext): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("record_session", {
    p_user_id: userId,
    p_ip: ctx.ip,
    p_ip_hash: ctx.ipHash,
    p_country: ctx.country,
    p_region: ctx.region,
    p_city: ctx.city,
    p_user_agent: ctx.userAgent,
    p_device: ctx.device,
    p_browser: ctx.browser,
    p_os: ctx.os,
    p_is_bot: ctx.isBot,
    p_referrer: ctx.referrer,
    p_utm_source: ctx.utm.source,
    p_utm_medium: ctx.utm.medium,
    p_utm_campaign: ctx.utm.campaign,
    p_utm_term: ctx.utm.term,
    p_utm_content: ctx.utm.content,
    p_language: ctx.language,
  });
  if (error) console.error("recordSession failed:", error.message);
}

export async function recordEvent(
  userId: string,
  name: string,
  props: Record<string, unknown> = {},
  path: string | null = null
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("analytics_events").insert({ user_id: userId, name, props, path });
  if (error) console.error("recordEvent failed:", error.message);
}

export async function purgeExpiredIps(olderThanDays = 90): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("analytics_sessions")
    .update({ ip: null })
    .lt("first_seen_at", cutoff)
    .not("ip", "is", null)
    .select("user_id");
  if (error) {
    console.error("purgeExpiredIps failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
