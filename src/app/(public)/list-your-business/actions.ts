"use server";

import { headers } from "next/headers";
import { getDirectoryData } from "@/lib/directory/data";
import { maskPhone, parseCode, parseSlug, smsBody, verifyMessage, type VerifyResult } from "@/lib/claim/input";
import { isUuid } from "@/lib/admin/detail-input";
import { sendSms, smsConfigFromEnv } from "@/lib/sms/twilio";
import { createServiceClient } from "@/lib/supabase/service";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant/resolve";
import { verifyTurnstile } from "@/lib/turnstile";

export interface ClaimState { step: "start" | "code" | "done"; claimId?: string; sentTo?: string; error?: string; slug?: string }
const FAIL = "That did not work. Try again in a minute.";
// claim_start raises readable messages for rule violations; show only those, never anything else.
const friendly = (e: { code?: string; message?: string }) => (["22023", "53400", "P0002", "28000"].includes(e.code ?? "") && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);

async function signedInUser() {
  if (!authConfigured()) return null;
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function startClaim(_prev: ClaimState, form: FormData): Promise<ClaimState> {
  const slug = parseSlug(form.get("slug"));
  if (!slug) return { step: "start", error: "Unknown business." };
  const user = await signedInUser();
  if (!user) return { step: "start", slug, error: "Sign in first." };
  const h = await headers();
  const human = await verifyTurnstile(form.get("cf-turnstile-response"), { secret: process.env.TURNSTILE_SECRET_KEY, ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null, isProduction: process.env.NODE_ENV === "production" });
  if (!human) return { step: "start", slug, error: "We could not confirm you are human. Reload the page and try again." };
  const tenant = await getTenant();
  if (!tenant) return { step: "start", slug, error: FAIL };
  const raw = await getDirectoryData().businessProfile(tenant.id, slug);   // public data: the id is never taken from the browser
  if (!raw) return { step: "start", slug, error: "Unknown business." };
  if (raw.business.status !== "unclaimed") return { step: "start", slug, error: "This business has already been claimed." };

  const service = createServiceClient();
  const { data, error } = await service.rpc("claim_start", { p_tenant: tenant.id, p_business: raw.business.id, p_user: user.id, p_method: "sms_code" });
  if (error || !data) return { step: "start", slug, error: error ? friendly(error) : FAIL };
  const c = data as { claim_id: string; secret: string; destination: string };

  const cancel = () => service.from("claims").update({ status: "cancelled" }).eq("id", c.claim_id);
  const cfg = smsConfigFromEnv();
  if (!cfg) {
    if (process.env.NODE_ENV === "production") { await cancel(); return { step: "start", slug, error: "Text messages are not set up yet. Please try again later." }; }
    console.warn(`[DEV ONLY: Twilio not configured] claim code for ${slug}: ${c.secret}`);   // never reached in production
  } else {
    try { await sendSms(cfg, c.destination, smsBody(tenant.name, raw.business.name, c.secret)); }
    catch { await cancel(); return { step: "start", slug, error: "We could not send the text message. Please try again in a minute." }; }
  }
  return { step: "code", slug, claimId: c.claim_id, sentTo: maskPhone(c.destination) ?? undefined };
}

export async function verifyClaim(prev: ClaimState, form: FormData): Promise<ClaimState> {
  const slug = parseSlug(form.get("slug")) ?? undefined;
  const claimId = String(form.get("claim_id") ?? "");
  const user = await signedInUser();
  if (!user) return { step: "start", slug, error: "Sign in first." };
  if (!isUuid(claimId)) return { step: "start", slug, error: FAIL };
  const code = parseCode(form.get("code"));
  // A malformed code never reaches the database, so a typo cannot use up one of the five attempts.
  if (!code) return { step: "code", slug, claimId, sentTo: prev.sentTo, error: "Enter the 6-digit code from the text message." };
  const service = createServiceClient();
  const { data, error } = await service.rpc("claim_verify", { p_claim: claimId, p_user: user.id, p_secret: code });
  if (error || !data) return { step: "code", slug, claimId, sentTo: prev.sentTo, error: FAIL };
  const m = verifyMessage(data as VerifyResult);
  if (m.ok) return { step: "done", slug };
  return m.done ? { step: "start", slug, error: m.text } : { step: "code", slug, claimId, sentTo: prev.sentTo, error: m.text };
}
