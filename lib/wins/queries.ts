import { createClient } from "@/lib/supabase/server";

export interface DailyWinRow {
  winKey: string;
  kind: "exact" | "goals";
  detail: string;
  createdAt: string;
}

/** The signed-in user's earned daily-win medals, newest first. */
export async function getMyDailyWins(limit = 20): Promise<DailyWinRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("daily_wins").select("win_key, kind, detail, created_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((w) => ({
    winKey: w.win_key, kind: (w.kind === "goals" ? "goals" : "exact"), detail: w.detail, createdAt: w.created_at,
  }));
}
