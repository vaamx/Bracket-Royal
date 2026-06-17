"use server";

import { createClient } from "@/lib/supabase/server";
import { signGuestClaim } from "@/lib/auth/guestClaim";

/**
 * If the caller is an anonymous guest, return a signed token of their user id
 * so a later sign-in can migrate their picks into the new account. Returns null
 * for non-guests or when the secret is unset.
 */
export async function mintGuestClaim(): Promise<string | null> {
  const secret = process.env.GUEST_CLAIM_SECRET;
  if (!secret) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.is_anonymous) return null;
  return signGuestClaim(user.id, secret);
}
