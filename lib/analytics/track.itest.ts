import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { recordSession, recordEvent, purgeExpiredIps } from "@/lib/analytics/track";
import type { AnalyticsContext } from "@/lib/analytics/context";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ctx = (over: Partial<AnalyticsContext> = {}): AnalyticsContext => ({
  ip: "203.0.113.7",
  ipHash: "hash-abc",
  country: "US",
  region: "TX",
  city: "Austin",
  userAgent: "Mozilla/5.0 (iPhone) Safari",
  device: "mobile",
  browser: "Safari",
  os: "iOS",
  isBot: false,
  referrer: "https://t.co/x",
  utm: { source: "twitter", medium: "social", campaign: "launch", term: null, content: null },
  language: "es-MX",
  ...over,
});

describe("analytics writers (integration)", () => {
  let userId: string;

  beforeAll(async () => {
    const stamp = `${process.pid}-${Math.floor(performance.now())}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `analytics-${stamp}@example.com`,
      password: "Password123!",
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId); // cascades to analytics rows
  });

  it("recordSession upserts a session row (first-touch acquisition preserved)", async () => {
    await recordSession(userId, ctx());
    await recordSession(userId, ctx({ referrer: null, utm: { source: null, medium: null, campaign: null, term: null, content: null } }));
    const { data } = await admin.from("analytics_sessions").select("*").eq("user_id", userId).single();
    expect(data?.country).toBe("US");
    expect(data?.utm_source).toBe("twitter"); // not wiped by the second (null) ping
    expect(data?.device).toBe("mobile");
  });

  it("recordEvent inserts an event row", async () => {
    await recordEvent(userId, "start_predicting", { from: "test" }, "/predict");
    const { data } = await admin
      .from("analytics_events")
      .select("name, path, props")
      .eq("user_id", userId)
      .eq("name", "start_predicting");
    expect(data?.length).toBe(1);
    expect(data?.[0]?.path).toBe("/predict");
  });

  it("the predictions trigger logs a pick_saved event", async () => {
    const { data: match } = await admin.from("matches").select("id").limit(1).single();
    await admin.from("predictions").insert({
      user_id: userId,
      match_id: match!.id,
      predicted_home: 1,
      predicted_away: 0,
    });
    const { data } = await admin
      .from("analytics_events")
      .select("props")
      .eq("user_id", userId)
      .eq("name", "pick_saved");
    expect((data?.length ?? 0)).toBeGreaterThanOrEqual(1);
    expect(data?.some((e) => (e.props as Record<string, unknown>).match_id === match!.id)).toBe(true);
  });

  it("purgeExpiredIps nulls raw IP on old rows but keeps ip_hash", async () => {
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
    await admin.from("analytics_sessions").update({ first_seen_at: old }).eq("user_id", userId);
    const purged = await purgeExpiredIps(90);
    expect(purged).toBeGreaterThanOrEqual(1);
    const { data } = await admin.from("analytics_sessions").select("ip, ip_hash").eq("user_id", userId).single();
    expect(data?.ip).toBeNull();
    expect(data?.ip_hash).not.toBeNull();
  });
});
