"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { mintGuestClaim } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Passwordless sign-in that preserves guest progress.
 *
 * If the visitor is an anonymous guest, we first try to ATTACH the email to
 * their current account (updateUser) so the picks they made as a guest carry
 * over. If that email already belongs to an account — which can't be merged —
 * we fall back to a normal magic-link sign-in into that existing account.
 * Either way it's one "email me a link" flow: no separate sign-up, no
 * "already registered" error.
 */
export function LoginForm() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  async function sendEmailLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // If the visitor is an anonymous guest, mint a signed token of their id so
    // the callback can migrate their picks even if sign-in lands on a different
    // account. Non-guests get a plain redirect.
    const guestToken = await mintGuestClaim();
    const base = `${window.location.origin}/auth/callback`;
    const redirectTo = guestToken ? `${base}?guest=${encodeURIComponent(guestToken)}` : base;

    if (guestToken) {
      // Guest: try to upgrade this account in place first (keeps their id).
      const { error: linkErr } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo });
      if (!linkErr) { setLoading(false); setSent(true); return; }
      // Email already has an account → fall through; the guest token rides along
      // so the callback still migrates their picks into that account.
    }

    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="w-full">
      <div className="mb-8 text-center">
        <div className="mb-4 text-5xl drop-shadow-[0_8px_30px_rgba(212,175,55,0.35)]">🏆</div>
        <p className="text-xs font-bold tracking-[3px] text-[var(--bn-accent)]">{t.login.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black">{t.login.title}</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/55">{t.login.subtitle}</p>
      </div>

      {sent ? (
        <div className="rounded-2xl border border-[var(--bn-success)]/30 bg-[var(--bn-success)]/10 p-5 text-center">
          <div className="text-3xl">📬</div>
          <p className="mt-2 font-bold text-[var(--bn-success)]">{t.login.checkEmail}</p>
          <p className="mt-1 text-sm text-white/60">{t.login.sentTo(email)}</p>
          <p className="mt-2 text-xs text-white/40">{t.login.checkSpam}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={sendEmailLink} className="space-y-3">
            <Input
              type="email"
              required
              placeholder={t.login.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t.login.sending : t.login.emailCta}
            </Button>
          </form>

          {error && <p className="text-center text-sm text-red-400">{error}</p>}
        </div>
      )}

      <div className="mt-8 text-center">
        <Link href="/predict" className="text-sm font-semibold text-white/45 transition-colors hover:text-white/75">
          {t.login.skipGuest}
        </Link>
      </div>
    </div>
  );
}
