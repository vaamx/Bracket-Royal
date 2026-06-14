"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateInviteCode } from "@/lib/leagues/inviteCode";

export async function setDisplayName(formData: FormData) {
  const name = String(formData.get("display_name") ?? "").trim();
  if (!name) return { error: "Name is required" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/leagues");
  return { ok: true };
}

export async function createLeague(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "League name is required" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Insert with a unique code, retrying on the rare collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const { data: league, error } = await supabase
      .from("leagues")
      .insert({ name, invite_code: code, owner_id: user.id })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") continue; // unique_violation on invite_code -> retry
      return { error: error.message };
    }
    await supabase.from("league_members").insert({ league_id: league.id, user_id: user.id });
    revalidatePath("/leagues");
    return { ok: true, code: league.invite_code };
  }
  return { error: "Could not generate a unique invite code, try again" };
}

export async function joinLeague(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "Invite code is required" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.rpc("join_league_by_code", { p_code: code });
  if (error) return { error: "League not found for that code" };
  revalidatePath("/leagues");
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
