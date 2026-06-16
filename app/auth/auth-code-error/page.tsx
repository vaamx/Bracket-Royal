import Link from "next/link";

export default function AuthCodeError() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
      <div className="text-5xl">📭</div>
      <h1 className="mt-3 text-2xl font-black">Sign-in link expired</h1>
      <p className="mt-2 max-w-xs text-sm text-white/60">
        That link didn&apos;t work or has already been used. Request a fresh one — your guest picks are still saved.
      </p>
      <Link
        href="/login"
        className="mt-6 rounded-full bg-gradient-to-r from-[#d4af37] to-[#f4d56a] px-6 py-3 text-sm font-extrabold text-[#0a1428]"
      >
        Back to sign in →
      </Link>
    </main>
  );
}
