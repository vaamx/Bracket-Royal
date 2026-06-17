import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { contextFromHeaders } from "@/lib/analytics/context";
import { recordSession, recordEvent } from "@/lib/analytics/track";

/** Best-effort sign-in analytics; never blocks or breaks the redirect. */
async function logSignIn(request: Request, supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await recordSession(user.id, contextFromHeaders(request.headers, process.env.ANALYTICS_IP_SALT));
    await recordEvent(user.id, "signed_in", {}, "/auth/callback");
  } catch (e) {
    console.error("logSignIn failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * Completes a sign-in / account-upgrade. Handles both flows:
 *  - OAuth & PKCE magic links arrive with `?code=` → exchangeCodeForSession
 *  - Email links (magic link / email-change confirmation) arrive with
 *    `?token_hash=&type=` → verifyOtp
 * Then redirects into the app (same-origin only).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const nextParam = searchParams.get("next") ?? "/predict";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/predict";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await logSignIn(request, supabase);
      return NextResponse.redirect(`${origin}${next}`);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      await logSignIn(request, supabase);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
