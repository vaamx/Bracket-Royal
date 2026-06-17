import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

describe("claim_guest_data (integration)", () => {
  let guestId: string;
  let newUserId: string;
  let leagueId: string;
  let matchA: string;
  let matchB: string;
  let playerX: string;

  beforeAll(async () => {
    const stamp = `${process.pid}-${Math.floor(performance.now())}`;

    // Anonymous guest (real anonymous session).
    const guestClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: anon, error: anonErr } = await guestClient.auth.signInAnonymously();
    if (anonErr) throw anonErr;
    guestId = anon.user!.id;

    // Target real account.
    const { data: real, error: realErr } = await admin.auth.admin.createUser({
      email: `claim-${stamp}@example.com`,
      password: "Password123!",
      email_confirm: true,
    });
    if (realErr) throw realErr;
    newUserId = real.user!.id;

    // Two non-final matches + a player.
    const { data: matches } = await admin.from("matches").select("id").neq("status", "final").limit(2);
    matchA = matches![0].id;
    matchB = matches![1].id;
    const { data: players } = await admin.from("players").select("id").limit(1);
    playerX = players![0].id;

    // A PRIVATE league OWNED by the guest (exercises the owner-reassign path).
    const code = `CLM${stamp}`.replace(/[^A-Z0-9]/gi, "").slice(0, 12).toUpperCase();
    const { data: league, error: lErr } = await admin
      .from("leagues")
      .insert({ name: `Claim Test ${stamp}`, invite_code: code, owner_id: guestId, is_global: false })
      .select("id")
      .single();
    if (lErr) throw lErr;
    leagueId = league!.id;
    await admin.from("league_members").insert({ league_id: leagueId, user_id: guestId });

    // Guest picks: matchA conflicts with the account; matchB is unique to the guest.
    await admin.from("predictions").insert([
      { user_id: guestId, match_id: matchA, predicted_home: 1, predicted_away: 1 },
      { user_id: guestId, match_id: matchB, predicted_home: 2, predicted_away: 0 },
    ]);
    await admin.from("scorer_predictions").insert({ user_id: guestId, player_id: playerX });

    // The account's own (conflicting) pick for matchA.
    await admin.from("predictions").insert({ user_id: newUserId, match_id: matchA, predicted_home: 3, predicted_away: 3 });
  });

  afterAll(async () => {
    if (newUserId) await admin.auth.admin.deleteUser(newUserId);
    if (leagueId) await admin.from("leagues").delete().eq("id", leagueId);
    if (guestId) await admin.auth.admin.deleteUser(guestId).catch(() => {}); // normally already deleted by the RPC
  });

  it("migrates non-conflicting data, preserves the account's picks, reassigns the league, and deletes the guest", async () => {
    const { error } = await admin.rpc("claim_guest_data", { p_guest_id: guestId, p_new_user: newUserId });
    expect(error).toBeNull();

    // matchB (unique to guest) moved to the new user.
    const { data: b } = await admin
      .from("predictions").select("predicted_home,predicted_away")
      .eq("user_id", newUserId).eq("match_id", matchB).maybeSingle();
    expect(b).toEqual({ predicted_home: 2, predicted_away: 0 });

    // matchA: the account keeps ITS pick (3-3), not the guest's (1-1).
    const { data: a } = await admin
      .from("predictions").select("predicted_home,predicted_away")
      .eq("user_id", newUserId).eq("match_id", matchA).maybeSingle();
    expect(a).toEqual({ predicted_home: 3, predicted_away: 3 });

    // Scorer pick moved.
    const { data: s } = await admin
      .from("scorer_predictions").select("player_id").eq("user_id", newUserId).eq("player_id", playerX);
    expect(s?.length).toBe(1);

    // Private league: ownership reassigned + new user is a member; league still exists.
    const { data: lg } = await admin.from("leagues").select("owner_id").eq("id", leagueId).maybeSingle();
    expect(lg?.owner_id).toBe(newUserId);
    const { data: m } = await admin
      .from("league_members").select("league_id").eq("user_id", newUserId).eq("league_id", leagueId);
    expect(m?.length).toBe(1);

    // Guest user deleted (de-inflation).
    const { data: g } = await admin.auth.admin.getUserById(guestId);
    expect(g.user).toBeNull();

    // No leftover guest predictions or scorer picks.
    const { data: leftovers } = await admin.from("predictions").select("match_id").eq("user_id", guestId);
    expect(leftovers ?? []).toHaveLength(0);
    const { data: scorerLeftovers } = await admin.from("scorer_predictions").select("player_id").eq("user_id", guestId);
    expect(scorerLeftovers ?? []).toHaveLength(0);
  });
});
