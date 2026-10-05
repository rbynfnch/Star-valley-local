"use server";

import { headers } from "next/headers";
import { getDirectoryData } from "@/lib/directory/data";
import { isUuid } from "@/lib/admin/detail-input";
import { parseSlug } from "@/lib/claim/input";
import { createServiceClient } from "@/lib/supabase/service";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant/resolve";
import { verifyTurnstile } from "@/lib/turnstile";

export interface DealClaimState { code?: string; already?: boolean; error?: string }
const FAIL = "That did not work. Try again in a minute.";
const friendly = (e: { code?: string; message?: string }) => (["22023", "53400", "P0002", "28000"].includes(e.code ?? "") && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);

// GET DEAL: reserves a personal code for the signed-in, email-confirmed account. No payment happens here (the customer pays the Hotlist
// price to the business when redeeming). The database enforces quantity, dates and the daily limit; the browser never sends an item id.
export async function claimDeal(_prev: DealClaimState, form: FormData): Promise<DealClaimState> {
  const slug = parseSlug(form.get("slug"));
  if (!slug) return { error: "Unknown deal." };
  if (!authConfigured()) return { error: "Sign in first." };
  const { data: { user } } = await (await createUserClient()).auth.getUser();
  if (!user) return { error: "Sign in first." };
  if (!user.email_confirmed_at) return { error: "Confirm your email address first (we sent you a link when you signed up), then try again." };
  const h = await headers();
  const ip = (h.get("x-real-ip") ?? (h.get("x-forwarded-for") ?? "").split(",").at(-1) ?? "").trim() || null;
  const human = await verifyTurnstile(form.get("cf-turnstile-response"), { secret: process.env.TURNSTILE_SECRET_KEY, ip, isProduction: process.env.NODE_ENV === "production" });
  if (!human) return { error: "We could not confirm you are human. Reload the page and try again." };
  const tenant = await getTenant();
  if (!tenant) return { error: FAIL };
  const item = await getDirectoryData().hotlistDetail(tenant.id, slug);          // public data: the id is never taken from the browser
  if (!item || item.kind !== "deal" || !isUuid(item.id)) return { error: "Unknown deal." };
  const { data, error } = await createServiceClient().rpc("hotlist_claim", { p_tenant: tenant.id, p_item: item.id, p_user: user.id });
  if (error || !data) return { error: error ? friendly(error) : FAIL };
  const r = data as { code: string; already: boolean };
  return { code: r.code, already: r.already };
}
