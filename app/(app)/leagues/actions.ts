"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateInviteCode } from "@/lib/leagues/inviteCode";

/** Join via the invite landing, setting a display name first (everyone gets a name). */
export async function joinWithNameForm(formData: FormData): Promise<void> {
  const name = String(formData.get("display_name") ?? "").trim();
  if (name) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").update({ display_name: name.slice(0, 24) }).eq("id", user.id);
  }
  const res = await joinLeague(formData);
  if ("ok" in res && res.id) redirect(`/leagues/${res.id}`);
}

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
  if (!name) return { error: "name_required" };
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
      return { error: "generic" };
    }
    await supabase.from("league_members").insert({ league_id: league.id, user_id: user.id });
    revalidatePath("/leagues");
    return { ok: true as const, id: league.id as string, code: league.invite_code as string };
  }
  return { error: "generic" };
}

export async function joinLeague(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "code_required" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("join_league_by_code", { p_code: code });
  if (error) return { error: "not_found" };
  revalidatePath("/leagues");
  return { ok: true as const, id: (data as { id?: string } | null)?.id };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
