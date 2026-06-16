import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(app)/leagues/actions";
import { getMyGlobalStanding } from "@/lib/leagues/queries";
import { getEarnedBadges } from "@/lib/achievements/queries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TrophyCase } from "@/components/ui/TrophyCase";
import { getT } from "@/lib/i18n";
import { NameEditor } from "@/components/settings/NameEditor";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { t } = await getT();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const isAnon = user.is_anonymous === true;
  const { data: prefs } = await supabase
    .from("notification_prefs").select("push_enabled, email_enabled, email").eq("user_id", user.id).maybeSingle();

  let name = t.common.guest;
  if (!isAnon) {
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    name = profile?.display_name ?? t.common.player;
  }
  const subtitle = isAnon ? t.settings.playingGuest : user.email ?? t.settings.signedIn;
  const [standing, earnedBadges] = await Promise.all([getMyGlobalStanding(), getEarnedBadges()]);

  return (
    <main className="mx-auto max-w-md space-y-5 p-6">
      <div>
        <p className="text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">{t.settings.eyebrow}</p>
        <h1 className="text-2xl font-black">{t.settings.title}</h1>
      </div>

      <Card className="relative overflow-hidden border-[var(--bn-gold)]/25 bg-gradient-to-br from-[var(--bn-gold)]/[0.12] to-transparent">
        <div className="pointer-events-none absolute -right-8 -top-10 text-[7rem] opacity-10" aria-hidden>🏆</div>
        <p className="text-xs font-bold tracking-[2px] text-[var(--bn-gold)]">{t.score.eyebrow}</p>
        <h2 className="mt-0.5 text-lg font-black">{t.score.title}</h2>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-3xl font-black tabular-nums text-[var(--bn-gold)]">{standing.points}</p>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[1px] text-white/45">{t.score.points}</p>
          </div>
          <div className="border-x border-white/10">
            <p className="text-3xl font-black tabular-nums">{standing.rank ? `#${standing.rank}` : "—"}</p>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[1px] text-white/45">
              {standing.rank ? t.score.ofPlayers(standing.memberCount) : t.score.unranked}
            </p>
          </div>
          <div>
            <p className="text-3xl font-black tabular-nums">{standing.exactCount}</p>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[1px] text-white/45">{t.score.exact}</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-white/45">
          {standing.points > 0 ? t.score.live : t.score.earnHint}
        </p>
        <Link href="/leagues" className="mt-3 inline-block text-sm font-bold text-[var(--bn-gold)]">
          {t.score.viewLeaderboard}
        </Link>
      </Card>

      <Card>
        <TrophyCase earned={earnedBadges} />
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <span className={"grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-black " + (isAnon ? "bg-white/10 text-white/70" : "bg-[var(--bn-gold)]/20 text-[var(--bn-gold)]")}>
            {isAnon ? "👤" : name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold">{name}</p>
            <p className="truncate text-xs text-white/45">{subtitle}</p>
          </div>
        </div>

        <NameEditor initialName={isAnon && name === t.common.guest ? "" : name} />

        {isAnon ? (
          <>
            <p className="text-sm text-white/60">{t.settings.signInToSave}</p>
            <Link href="/login"><Button className="w-full">{t.common.signInCreate}</Button></Link>
          </>
        ) : (
          <form action={signOut}>
            <Button variant="ghost" className="w-full">{t.common.signOut}</Button>
          </form>
        )}
      </Card>

      <SettingsClient
        userId={user.id}
        initialPush={prefs?.push_enabled ?? false}
        initialEmail={prefs?.email_enabled ?? false}
        initialAddr={prefs?.email ?? null}
      />

      <Card>
        <a href="/api/calendar" className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-xl" aria-hidden>📅</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{t.settings.calendarTitle}</p>
            <p className="text-xs text-white/45">{t.settings.calendarSub}</p>
          </div>
          <span className="text-white/40">›</span>
        </a>
      </Card>
    </main>
  );
}
