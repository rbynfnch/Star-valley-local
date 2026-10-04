"use server";

import { getDirectoryData } from "@/lib/directory/data";
import { parseSlug } from "@/lib/claim/input";
import { isUuid } from "@/lib/admin/detail-input";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant/resolve";

export interface WaitlistState { ok?: boolean; position?: number; error?: string }
const FAIL = "That did not go through. Please try again in a minute.";
const SLOTS = ["homepage", "category", "community", "things_to_do"] as const;
// join_waitlist raises readable messages for rule violations; show only those.
const friendly = (e: { code?: string; message?: string }) => ((e.code === "22023" || e.code === "28000") && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);

export async function joinWaitlist(form: FormData): Promise<WaitlistState> {
  const slug = parseSlug(form.get("business"));
  const slot = String(form.get("slot") ?? "");
  const scope = String(form.get("scope") ?? "");
  if (!slug || !(SLOTS as readonly string[]).includes(slot) || (scope && !isUuid(scope))) return { error: FAIL };
  if (!authConfigured()) return { error: "Sign in first." };
  const tenant = await getTenant();
  if (!tenant) return { error: FAIL };
  const raw = await getDirectoryData().businessProfile(tenant.id, slug);          // public data: the id never comes from the browser
  if (!raw) return { error: "We could not find that business." };
  const supabase = await createUserClient();                                       // runs as the signed-in user: the database checks they own it
  const { data, error } = await supabase.rpc("join_waitlist", { p_business: raw.business.id, p_slot: slot, p_scope: scope || null });
  if (error) return { error: friendly(error) };
  return { ok: true, position: Number((data as { position?: number } | null)?.position ?? 0) || undefined };
}
