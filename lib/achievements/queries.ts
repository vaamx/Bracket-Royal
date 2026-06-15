import { createClient } from "@/lib/supabase/server";

/** Badge keys the signed-in user has earned. */
export async function getEarnedBadges(): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from("achievements").select("badge_key").eq("user_id", user.id);
  return (data ?? []).map((r) => r.badge_key);
}
