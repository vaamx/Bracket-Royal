"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Optional sign-in. When the visitor is currently anonymous we LINK the new
 * identity to their existing account (so their predictions are preserved);
 * otherwise we do a normal sign-in.
 */
export function LoginForm({ isAnonymous }: { isAnonymous: boolean }) {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  async function continueWithGoogle() {
    setError(null);
    const { error } = isAnonymous
      ? await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo } })
      : await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) setError(error.message);
  }

  async function sendEmailLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // Anonymous user: attach the email to the existing account (confirmation
    // link emailed). Otherwise send a normal magic-link OTP.
    const { error } = isAnonymous
      ? await supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo })
      : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
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
          <button
            onClick={continueWithGoogle}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/[0.04] font-bold text-white/90 transition-colors hover:bg-white/[0.08] active:scale-[0.98]"
          >
            <GoogleGlyph />
            {t.login.google}
          </button>

          <div className="flex items-center gap-3 text-[11px] font-semibold text-white/30">
            <span className="h-px flex-1 bg-white/10" /> {t.login.or} <span className="h-px flex-1 bg-white/10" />
          </div>

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

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
