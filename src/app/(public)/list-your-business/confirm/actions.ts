"use server";

import { emailLinkMessage, parseToken, type VerifyResult } from "@/lib/claim/input";
import { isUuid } from "@/lib/admin/detail-input";
import { createServiceClient } from "@/lib/supabase/service";
import { authConfigured, createUserClient } from "@/lib/supabase/server";

export interface ConfirmState { done?: boolean; ok?: boolean; error?: string; slug?: string }

// Pressing the button is what verifies; merely opening the link does nothing (mail scanners open links). Only the account that
// asked for the link can use it (claim_verify checks the claimant). A link issued by our staff has no claimant yet: claim_verify_invite
// binds it to the signed-in account once the secret matches, then verifies.
export async function confirmEmailClaim(_prev: ConfirmState, form: FormData): Promise<ConfirmState> {
  const claim = String(form.get("c") ?? ""), token = parseToken(form.get("t"));
  if (!isUuid(claim) || !token) return { done: true, ok: false, error: "That link is not valid. Ask for a new one." };
  if (!authConfigured()) return { error: "Sign in first." };
  const { data: { user } } = await (await createUserClient()).auth.getUser();
  if (!user) return { error: "Sign in first." };
  const service = createServiceClient();
  const { data, error } = await service.rpc("claim_verify_invite", { p_claim: claim, p_user: user.id, p_secret: token });
  if (error || !data) return { done: error?.code === "P0002", ok: false, error: error?.code === "P0002" ? "This link is for a different account. Sign in with the account that asked for it." : "That did not work. Try again in a minute." };
  const m = emailLinkMessage(data as VerifyResult);
  const { data: pv } = m.ok ? await service.rpc("claim_preview", { p_claim: claim, p_user: user.id }) : { data: null };
  return m.ok ? { done: true, ok: true, slug: (pv as { slug?: string } | null)?.slug } : { done: m.done, ok: false, error: m.text };
}
