import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the Supabase session on each request. Sign-in is OPTIONAL: if a visitor
 * has no session yet, we silently create an anonymous one so they can predict
 * immediately (and their picks are saved under RLS). Signing in later upgrades
 * that same anonymous account. No route is gated behind a login.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session yet → create an anonymous one so the app is usable without sign-in.
  // The signInAnonymously call writes auth cookies onto `response` via setAll.
  if (!user) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      // Anonymous sign-in unavailable (e.g. rate limit) — continue unauthenticated;
      // pages render read-only and saving is deferred until a session exists.
      console.error("Anonymous sign-in failed:", error.message);
    }
  }

  return response;
}
