import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** True when Supabase auth is configured. Without it the admin fails closed (nobody can sign in). */
export const authConfigured = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Cookie-session client for the signed-in user (anon key; RLS applies as that user). Server components, actions, route handlers. */
export async function createUserClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server components cannot set cookies; the proxy refreshes the session, so ignoring that case is safe.
        try { for (const { name, value, options } of list) store.set(name, value, options); } catch { /* read-only context */ }
      },
    },
  });
}
