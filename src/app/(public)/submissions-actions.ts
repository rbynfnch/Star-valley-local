"use server";

import { headers } from "next/headers";
import { getDirectoryData } from "@/lib/directory/data";
import { parseBusiness, parseEvent, parseUpdate, type Parsed } from "@/lib/submissions/input";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenant } from "@/lib/tenant/resolve";
import { verifyTurnstile } from "@/lib/turnstile";

export interface SubmitState { done?: boolean; error?: string }
const FAIL = "That did not go through. Please try again in a minute.";
// submission_create raises readable messages for rule violations; show only those, never anything else.
const friendly = (e: { code?: string; message?: string }) => (["22023", "53400", "P0002"].includes(e.code ?? "") && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);

async function submit(kind: "update" | "business" | "event", form: FormData): Promise<SubmitState> {
  const h = await headers();
  const human = await verifyTurnstile(form.get("cf-turnstile-response"), { secret: process.env.TURNSTILE_SECRET_KEY, ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null, isProduction: process.env.NODE_ENV === "production" });
  if (!human) return { error: "We could not confirm you are human. Reload the page and try again." };
  const tenant = await getTenant();
  if (!tenant) return { error: FAIL };
  const parsed = kind === "update" ? parseUpdate(form) : kind === "business" ? parseBusiness(form) : parseEvent(form, tenant.timezone);
  if (!parsed.ok) return { error: parsed.error };
  const p: Parsed = parsed.value;

  let businessId: string | null = null;
  if (kind === "update") {
    const raw = await getDirectoryData().businessProfile(tenant.id, p.business ?? "");   // public data: the id never comes from the browser
    if (!raw) return { error: "We could not find that business." };
    businessId = raw.business.id;
  }
  let userId: string | null = null;
  if (authConfigured()) { try { userId = (await (await createUserClient()).auth.getUser()).data.user?.id ?? null; } catch { userId = null; } }

  const { error } = await createServiceClient().rpc("submission_create", {
    p_tenant: tenant.id, p_kind: kind, p_business: businessId, p_payload: p.payload,
    p_name: p.contact.name, p_email: p.contact.email, p_phone: p.contact.phone, p_user: userId,
  });
  if (error) return { error: friendly(error) };
  return { done: true };
}

export async function submitUpdate(_prev: SubmitState, form: FormData): Promise<SubmitState> { return submit("update", form); }
export async function submitBusiness(_prev: SubmitState, form: FormData): Promise<SubmitState> { return submit("business", form); }
export async function submitEvent(_prev: SubmitState, form: FormData): Promise<SubmitState> { return submit("event", form); }
