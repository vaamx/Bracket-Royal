import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav/BottomNav";
import { LocaleToggle } from "@/components/i18n/LocaleToggle";
import { getMyGlobalStanding } from "@/lib/leagues/queries";
import { getT } from "@/lib/i18n";

/** App shell for all signed-in screens: a top bar (brand + sign-in/account) and a bottom tab bar. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { t } = await getT();
  const { data: { user } } = await supabase.auth.getUser();
  const isAnon = !user || user.is_anonymous === true;

  let name = t.common.guest;
  if (user && !isAnon) {
    const { data } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    name = data?.display_name ?? t.common.player;
  }
  // Headline score for the always-visible points pill (zeros until first scoring run).
  const standing = user ? await getMyGlobalStanding() : null;

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[var(--bn-bg-deep)]/90 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-md items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-1.5 font-black">
            <span aria-hidden>🏆</span>
            <span>{t.nav.brand}</span>
          </Link>
          <div className="flex items-center gap-2">
            {standing && (
              <Link
                href="/leagues"
                aria-label={t.score.points}
                className="flex items-center gap-1 rounded-full bg-[var(--bn-gold)]/15 px-2.5 py-1 text-xs font-black text-[var(--bn-gold)] tabular-nums"
              >
                <span aria-hidden>★</span>
                {standing.points}
              </Link>
            )}
            <LocaleToggle />
            {isAnon ? (
              <Link
                href="/login"
                className="rounded-full bg-gradient-to-r from-[#d4af37] to-[#f4d56a] px-3 py-1 text-xs font-extrabold text-[#0a1428]"
              >
                {t.common.signIn}
              </Link>
            ) : (
              <Link href="/settings" className="flex items-center gap-1.5 text-xs font-semibold text-white/70">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-[10px] font-black">
                  {name.slice(0, 1).toUpperCase()}
                </span>
                {name}
              </Link>
            )}
          </div>
        </div>
      </header>

      {children}

      <BottomNav />
    </div>
  );
}
