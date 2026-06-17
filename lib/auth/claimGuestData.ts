import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyGuestClaim } from "@/lib/auth/guestClaim";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Best-effort: migrate an anonymous guest's data into the just-signed-in user.
 * No-op unless a valid guest token is present and resolves to a different id.
 * Never throws — a failure must not block the sign-in redirect.
 */
export async function claimGuestData(guestToken: string | null, supabase: ServerClient): Promise<void> {
  try {
    if (!guestToken) return;
    const secret = process.env.GUEST_CLAIM_SECRET;
    if (!secret) return;
    const guestId = verifyGuestClaim(guestToken, secret);
    if (!guestId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id === guestId) return;

    const admin = createAdminClient();
    const { error } = await admin.rpc("claim_guest_data", { p_guest_id: guestId, p_new_user: user.id });
    if (error) console.error("claim_guest_data failed:", error.message);
  } catch (e) {
    console.error("claimGuestData failed:", e instanceof Error ? e.message : e);
  }
}
