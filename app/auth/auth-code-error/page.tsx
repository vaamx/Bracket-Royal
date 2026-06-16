import Link from "next/link";
import { getT } from "@/lib/i18n";

export default async function AuthCodeError() {
  const { t } = await getT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
      <div className="text-5xl">📭</div>
      <h1 className="mt-3 text-2xl font-black">{t.authError.title}</h1>
      <p className="mt-2 max-w-xs text-sm text-white/60">{t.authError.body}</p>
      <Link
        href="/login"
        className="mt-6 rounded-full bg-gradient-to-r from-[#d4af37] to-[#f4d56a] px-6 py-3 text-sm font-extrabold text-[#0a1428]"
      >
        {t.authError.cta}
      </Link>
    </main>
  );
}
