"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function LoginForm() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  async function signInWithGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setError(error.message);
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <Card className="space-y-4">
      <div className="text-center">
        <p className="text-xs tracking-[3px] text-[var(--bn-accent)] font-bold">
          FIFA WORLD CUP 2026
        </p>
        <h1 className="mt-1 text-2xl font-black">Sign in to play</h1>
      </div>

      <Button variant="ghost" className="w-full" onClick={signInWithGoogle}>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-white/40 text-xs">
        <span className="h-px flex-1 bg-white/10" /> OR <span className="h-px flex-1 bg-white/10" />
      </div>

      {sent ? (
        <p className="text-sm text-[var(--bn-success)] text-center">
          Check your email for a magic link to sign in.
        </p>
      ) : (
        <form onSubmit={sendMagicLink} className="space-y-3">
          <Input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Email me a magic link"}
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
    </Card>
  );
}
