import { createClient } from "@/lib/supabase/server";
import { buildIcs, type IcsEvent } from "@/lib/calendar/ics";

export const dynamic = "force-dynamic";

/** Upcoming match deadlines as a downloadable .ics calendar. */
export async function GET() {
  const supabase = await createClient();
  const { data: matches } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, group_label, stage, lock_at, status")
    .eq("status", "scheduled")
    .not("lock_at", "is", null)
    .order("lock_at", { ascending: true })
    .limit(100);
  const { data: teams } = await supabase.from("teams").select("id, name");
  const nameById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  const events: IcsEvent[] = (matches ?? [])
    .filter((m) => m.home_team_id && m.away_team_id)
    .map((m) => {
      const home = nameById.get(m.home_team_id as string) ?? m.home_team_id;
      const away = nameById.get(m.away_team_id as string) ?? m.away_team_id;
      return {
        uid: `${m.id}@bracket-royale`,
        start: m.lock_at as string,
        summary: `${home} vs ${away} — lock your prediction`,
        description: m.group_label ? `World Cup 2026 · Group ${m.group_label}` : `World Cup 2026 · ${m.stage.toUpperCase()}`,
      };
    });

  const ics = buildIcs(events, new Date().toISOString());
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="worldcup2026-deadlines.ics"',
    },
  });
}
