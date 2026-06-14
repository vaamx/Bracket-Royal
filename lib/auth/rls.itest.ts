import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const GLOBAL_LEAGUE = "00000000-0000-0000-0000-000000000001";

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Create a confirmed email+password user and return an authenticated client. */
async function makeUser(email: string): Promise<{ id: string; client: SupabaseClient }> {
  const password = "Password123!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  return { id: data.user!.id, client };
}

describe("RLS + provisioning (integration)", () => {
  let alice: { id: string; client: SupabaseClient };
  let bob: { id: string; client: SupabaseClient };

  beforeAll(async () => {
    // Unique emails per run so reseeding isn't required.
    const stamp = `${process.pid}-${Math.floor(performance.now())}`;
    alice = await makeUser(`alice-${stamp}@example.com`);
    bob = await makeUser(`bob-${stamp}@example.com`);
  });

  it("provisions a profile on signup", async () => {
    const { data } = await alice.client.from("profiles").select("id").eq("id", alice.id).single();
    expect(data?.id).toBe(alice.id);
  });

  it("auto-joins every new user to the global league", async () => {
    const { data } = await alice.client
      .from("league_members").select("league_id").eq("league_id", GLOBAL_LEAGUE).eq("user_id", alice.id);
    expect(data?.length).toBe(1);
  });

  it("blocks anonymous reads of profiles", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data } = await anon.from("profiles").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("lets a user create a private league and join via code, but hides it from non-members", async () => {
    // Mix process.pid with a high-resolution time component so repeated runs
    // don't collide on the unique invite_code constraint. Keep only chars from
    // the unambiguous A-Z2-9 set, sliced/padded to 6.
    const raw = (process.pid.toString(36) + Math.floor(performance.now()).toString(36)).toUpperCase();
    const cleaned = raw.replace(/[0O1IL]/g, "2");
    const code = cleaned.slice(0, 6).padEnd(6, "X");
    const { data: league, error } = await alice.client
      .from("leagues")
      .insert({ name: "Alice's League", invite_code: code, owner_id: alice.id })
      .select()
      .single();
    expect(error).toBeNull();
    await alice.client.from("league_members").insert({ league_id: league!.id, user_id: alice.id });

    // Bob cannot see Alice's league yet.
    const { data: hidden } = await bob.client.from("leagues").select("id").eq("id", league!.id);
    expect(hidden ?? []).toHaveLength(0);

    // Bob joins via the RPC, then can see it.
    const { error: joinErr } = await bob.client.rpc("join_league_by_code", { p_code: code });
    expect(joinErr).toBeNull();
    const { data: visible } = await bob.client.from("leagues").select("id").eq("id", league!.id);
    expect(visible).toHaveLength(1);
  });

  it("rejects joining with an unknown code", async () => {
    const { error } = await bob.client.rpc("join_league_by_code", { p_code: "ZZZZZZ" });
    expect(error).not.toBeNull();
  });

  it("prevents a user from inserting predictions as someone else", async () => {
    const { error } = await bob.client.from("predictions").insert({
      user_id: alice.id, // not bob -> must be rejected by RLS
      match_id: "GA-MEX-BEL",
      predicted_home: 1,
      predicted_away: 0,
    });
    expect(error).not.toBeNull();
  });
});
