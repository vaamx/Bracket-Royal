"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { scorersLocked } from "@/lib/players/queries";

const MAX_PICKS = 10;

async function userOrThrow() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "no_user" as const };
  if (await scorersLocked()) return { error: "locked" as const };
  return { supabase, userId: user.id };
}

export async function addScorerPick(playerId: string) {
  const ctx = await userOrThrow();
  if ("error" in ctx) return ctx;
  const { supabase, userId } = ctx;
  const { count } = await supabase.from("scorer_predictions").select("*", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= MAX_PICKS) return { error: "max" as const };
  const { error } = await supabase.from("scorer_predictions").upsert({ user_id: userId, player_id: playerId }, { onConflict: "user_id,player_id" });
  if (error) return { error: "db" as const };
  revalidatePath("/scorers");
  return { ok: true as const };
}

export async function removeScorerPick(playerId: string) {
  const ctx = await userOrThrow();
  if ("error" in ctx) return ctx;
  const { supabase, userId } = ctx;
  const { error } = await supabase.from("scorer_predictions").delete().eq("user_id", userId).eq("player_id", playerId);
  if (error) return { error: "db" as const };
  revalidatePath("/scorers");
  return { ok: true as const };
}

export async function setGoldenBoot(playerId: string) {
  const ctx = await userOrThrow();
  if ("error" in ctx) return ctx;
  const { supabase, userId } = ctx;
  await supabase.from("scorer_predictions").update({ is_golden_boot: false }).eq("user_id", userId).neq("player_id", playerId);
  const { error } = await supabase.from("scorer_predictions").update({ is_golden_boot: true }).eq("user_id", userId).eq("player_id", playerId);
  if (error) return { error: "db" as const };
  revalidatePath("/scorers");
  return { ok: true as const };
}

export async function setBootGoals(predictedGoals: number | null) {
  const ctx = await userOrThrow();
  if ("error" in ctx) return ctx;
  const { supabase, userId } = ctx;
  const g = predictedGoals == null ? null : Math.max(0, Math.min(30, Math.floor(predictedGoals)));
  const { error } = await supabase.from("scorer_predictions").update({ predicted_goals: g }).eq("user_id", userId).eq("is_golden_boot", true);
  if (error) return { error: "db" as const };
  revalidatePath("/scorers");
  return { ok: true as const };
}
