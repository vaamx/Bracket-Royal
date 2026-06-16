import Link from "next/link";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { getT } from "@/lib/i18n";
import { joinLeagueForm } from "@/app/(app)/leagues/actions";

interface LeaguePreview {
  id: string;
  name: string;
  memberCount: number;
}

/** Look up a league by invite code via the service-role client — the invitee
 *  isn't a member yet, so RLS would otherwise hide it. Returns null on miss. */
async function getPreview(code: string): Promise<LeaguePreview | null> {
  try {
    const admin = createAdminClient();
    const { data: league } = await admin
      .from("leagues").select("id, name").eq("invite_code", code).maybeSingle();
    if (!league) return null;
    const { count } = await admin
      .from("league_members").select("*", { count: "exact", head: true }).eq("league_id", league.id);
    return { id: league.id, name: league.name, memberCount: count ?? 0 };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const { t } = await getT();
  const preview = await getPreview(code.toUpperCase());
  const title = preview ? t.join.metaTitle(preview.name) : t.meta.title;
  return {
    title,
    description: t.join.metaDesc,
    openGraph: { title, description: t.join.metaDesc, type: "website" },
  };
}

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalized = code.toUpperCase();
  const { t } = await getT();
  const preview = await getPreview(normalized);

  if (!preview) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl">🤷</div>
        <h1 className="mt-3 text-2xl font-black">{t.join.notFoundTitle}</h1>
        <p className="mt-2 max-w-xs text-sm text-white/60">{t.join.notFoundSub}</p>
        <Link href="/" className="mt-6 rounded-full bg-gradient-to-r from-[#d4af37] to-[#f4d56a] px-6 py-3 text-sm font-extrabold text-[#0a1428]">
          {t.join.goHome}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
      <div className="bn-float mb-5 grid h-20 w-20 place-items-center rounded-2xl bg-[var(--bn-gold)]/15 text-4xl ring-1 ring-[var(--bn-gold)]/40">
        🛡️
      </div>
      <p className="text-xs font-bold tracking-[3px] text-[var(--bn-accent)]">{t.join.eyebrow}</p>
      <h1 className="mt-2 text-3xl font-black">{t.join.title(preview.name)}</h1>
      <p className="mt-1 text-sm text-white/45">{t.common.players(preview.memberCount)}</p>
      <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-white/65">{t.join.sub}</p>

      <form action={joinLeagueForm} className="mt-7 w-full">
        <input type="hidden" name="code" value={normalized} />
        <button
          type="submit"
          className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#d4af37] to-[#f4d56a] text-base font-black text-[#0a1428] shadow-[0_10px_30px_rgba(212,175,55,0.35)] transition-transform active:scale-[0.98]"
        >
          {t.join.cta}
        </button>
      </form>
      <Link href="/predict" className="mt-4 text-sm font-semibold text-white/45 transition-colors hover:text-white/75">
        {t.join.later}
      </Link>
    </main>
  );
}
