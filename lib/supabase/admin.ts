import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS — use ONLY in trusted server contexts
 * (integration tests, cron/scoring jobs). Never import into client code.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
