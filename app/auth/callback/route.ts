import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

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
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
