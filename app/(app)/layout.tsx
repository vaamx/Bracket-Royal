import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav/BottomNav";

/** App shell for all signed-in screens: a top bar (brand + sign-in/account) and a bottom tab bar. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAnon = !user || user.is_anonymous === true;

  let name = "Guest";
  if (user && !isAnon) {
    const { data } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    name = data?.display_name ?? "Player";
  }

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[var(--bn-bg-deep)]/90 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-md items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-1.5 font-black">
            <span aria-hidden>🏆</span>
            <span>Bracket Royale</span>
          </Link>
          {isAnon ? (
            <Link
              href="/login"
              className="rounded-full bg-gradient-to-r from-[#d4af37] to-[#f4d56a] px-3 py-1 text-xs font-extrabold text-[#0a1428]"
            >
              Sign in
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
      </header>

      {children}

      <BottomNav />
    </div>
  );
}
