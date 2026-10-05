"use server";

import { parsePostcardCode, postcardMessage, type PostcardResult } from "@/lib/claim/postcard";
import { createServiceClient } from "@/lib/supabase/service";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant/resolve";

export interface PostcardState { ok?: boolean; message?: string; slug?: string }
const FAIL = "That did not work. Try again in a minute.";

// The server passes the signed-in account's id; the database checks that account owns the business the code was printed for.
export async function redeemPostcard(_prev: PostcardState, form: FormData): Promise<PostcardState> {
  if (!authConfigured()) return { message: "Sign in first." };
  const { data: { user } } = await (await createUserClient()).auth.getUser();
  if (!user) return { message: "Sign in first." };
  const code = parsePostcardCode(form.get("code"));
  if (!code) return { message: "Enter the 10-character code from the postcard." };            // a malformed code never reaches the database
  const tenant = await getTenant();
  if (!tenant) return { message: FAIL };
  const { data, error } = await createServiceClient().rpc("postcard_redeem", { p_tenant: tenant.id, p_user: user.id, p_code: code });
  if (error) return { message: error.code === "53400" && error.message ? error.message.charAt(0).toUpperCase() + error.message.slice(1) + "." : FAIL };
  const r = data as PostcardResult | null;
  if (!r) return { message: FAIL };
  const m = postcardMessage(r);
  return { ok: m.ok, message: m.text, slug: m.ok ? r.slug : undefined };
}
