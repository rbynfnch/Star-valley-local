"use server";

import { revalidatePath } from "next/cache";
import { parseHotlistInput } from "@/lib/admin/hotlist-input";
import { isUuid } from "@/lib/admin/detail-input";
import { parseEditInput } from "@/lib/admin/edit-input";
import { requireOwnedBusiness } from "@/lib/owner/session";
import { createUserClient } from "@/lib/supabase/server";

export interface OwnerState { error?: string; message?: string }
const FAIL = "That could not be saved. Try again, or reload the page.";
const FRIENDLY = new Set(["22023", "22001", "53400", "P0002"]);
const friendly = (e: { code?: string; message?: string }) => (e.code && FRIENDLY.has(e.code) && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);

// What an owner may change on the profile form. (The database refuses the rest again, so a tampered form gains nothing.)
const OWNER_FIELDS = ["name", "address_line1", "address_line2", "city", "postal_code", "phone", "website", "short_description", "hours_note"] as const;
const ENHANCED_FIELDS = ["description", "email"] as const;

export async function saveProfile(_s: OwnerState, form: FormData): Promise<OwnerState> {
  const id = String(form.get("business") ?? "");
  const ctx = await requireOwnedBusiness(id, "/dashboard");
  const allowed: string[] = [...OWNER_FIELDS, ...(ctx.business.tier === "enhanced" ? ENHANCED_FIELDS : [])];
  const clean = new FormData(); clean.set("business", id);
  for (const k of allowed) if (form.has(k)) clean.set(k, String(form.get(k) ?? ""));
  const p = parseEditInput(clean); if (!p.ok) return { error: p.error };
  const { error } = await (await createUserClient()).rpc("update_business_fields", { p_tenant: ctx.tenant.id, p_business: id, p_fields: p.fields });
  if (error) return { error: friendly(error) };
  revalidatePath(`/dashboard/${id}`); revalidatePath(`/dashboard/${id}/profile`); revalidatePath(`/business/${ctx.business.slug}`);
  return { message: "Saved. Your public listing is updated." };
}

const STATUSES = ["new", "contacted", "in_progress", "converted", "lost"];
export async function setLeadStatus(_s: OwnerState, form: FormData): Promise<OwnerState> {
  const business = String(form.get("business") ?? ""), lead = String(form.get("lead") ?? ""), status = String(form.get("status") ?? "");
  await requireOwnedBusiness(business, "/dashboard");
  if (!isUuid(lead) || !STATUSES.includes(status)) return { error: "Unknown request." };
  // Row-level security limits this to leads of businesses the account owns; the extra filter makes the intent explicit.
  const { data, error } = await (await createUserClient()).from("leads").update({ status }).eq("id", lead).eq("business_id", business).select("id");
  if (error || !data || data.length === 0) return { error: FAIL };
  revalidatePath(`/dashboard/${business}/leads`); revalidatePath(`/dashboard/${business}`); revalidatePath("/dashboard");
  return { message: "Updated." };
}

// Hotlist offers go to the editors' approval queue; nothing is published from here. The business is the one in the URL, never a form field.
export async function submitOffer(_s: OwnerState, form: FormData): Promise<OwnerState> {
  const id = String(form.get("business") ?? "");
  const ctx = await requireOwnedBusiness(id, "/dashboard");
  const f = new FormData();
  for (const [k, v] of form.entries()) if (typeof v === "string" && !["business", "kind", "status", "badge", "category", "id"].includes(k)) f.set(k, v);
  f.set("business", ctx.business.slug); f.set("kind", "deal"); f.set("status", "pending");
  f.set("badge", "hot_deal"); f.set("category", String(form.get("category") ?? ""));
  const p = parseHotlistInput(f, ctx.tenant.timezone); if (!p.ok) return { error: p.error };
  const { error } = await (await createUserClient()).rpc("submit_hotlist_offer", { p_tenant: ctx.tenant.id, p_business: id, p_fields: p.value.fields });
  if (error) return { error: friendly(error) };
  revalidatePath(`/dashboard/${id}/hotlist`);
  return { message: "Sent for review. We will approve it, ask for changes, or let you know why it is not a fit." };
}
