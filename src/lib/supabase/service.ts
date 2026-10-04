import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client: BYPASSES row-level security. Server-only; use it solely for the few flows that must act on
 * behalf of a user the server has already authenticated (claim start/verify). Never import this from a client component.
 */
export function createServiceClient(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("the service-role client must never run in the browser");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
