"use server";

import { revalidatePath } from "next/cache";
import { parseActivateListing, parseActivatePlacement, SLOTS } from "@/lib/admin/billing-input";
import { isUuid } from "@/lib/admin/detail-input";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";

export interface BillingState { error?: string; message?: string; full?: boolean }
const FAIL = "That could not be saved. Reload the page and try again.";
// The functions raise readable messages for rule violations (SQLSTATE 22023); anything else gets the generic message.
const friendly = (e: { code?: string; message?: string }) => (e.code === "22023" && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);
const refresh = (business?: string) => { revalidatePath("/admin/placements"); if (business) revalidatePath(`/admin/businesses/${business}`); revalidatePath("/pricing"); };
const money = (cents: number | null) => (cents ? ` $${(cents / 100).toFixed(2)}` : "");

async function adminOnly() {
  const staff = await requireArea("placements");
  return staff.role === "admin" ? { staff } : { error: "Only admins can change plans and placements." };
}

export async function activateListing(form: FormData): Promise<BillingState> {
  const a = await adminOnly(); if (!a.staff) return { error: a.error };
  const p = parseActivateListing(form, a.staff.tenant.timezone); if (!p.ok) return { error: p.error };
  const v = p.value; const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("activate_listing", {
    p_tenant: a.staff.tenant.id, p_business: v.business, p_months: "months" in v.term ? v.term.months : null, p_ends_at: "endsAt" in v.term ? v.term.endsAt : null,
    p_source: v.source, p_amount_cents: v.amountCents, p_product_code: v.product, p_auto_renews: v.autoRenews, p_notes: v.notes,
  });
  if (error) return { error: friendly(error) };
  refresh(v.business);
  const r = (data ?? {}) as { extended?: boolean };
  return { message: `${r.extended ? "Enhanced listing extended" : "Enhanced listing activated"}${v.source === "paid" ? `. Payment${money(v.amountCents)} recorded` : " (comp)"}.` };
}

export async function endListing(form: FormData): Promise<BillingState> {
  const a = await adminOnly(); if (!a.staff) return { error: a.error };
  const business = String(form.get("business") ?? ""); if (!isUuid(business)) return { error: "Unknown business." };
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("end_listing", { p_tenant: a.staff.tenant.id, p_business: business, p_reason: String(form.get("reason") ?? "").slice(0, 500) || null });
  if (error) return { error: friendly(error) };
  refresh(business);
  const n = Number((data as { ended_paid_placements?: number } | null)?.ended_paid_placements ?? 0);
  return { message: n > 0 ? `Enhanced listing ended. ${n} paid Featured placement${n === 1 ? "" : "s"} ended with it.` : "Enhanced listing ended." };
}

export async function activatePlacement(form: FormData): Promise<BillingState> {
  const a = await adminOnly(); if (!a.staff) return { error: a.error };
  const p = parseActivatePlacement(form, a.staff.tenant.timezone); if (!p.ok) return { error: p.error };
  const v = p.value; const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("activate_placement", {
    p_tenant: a.staff.tenant.id, p_business: v.business || null, p_slot: v.slot, p_scope: v.scope, p_months: "months" in v.term ? v.term.months : null, p_ends_at: "endsAt" in v.term ? v.term.endsAt : null,
    p_source: v.source, p_amount_cents: v.amountCents, p_product_code: v.product, p_auto_renews: v.autoRenews, p_notes: v.notes, p_waitlist_id: v.waitlistId,
  });
  if (error) return { error: friendly(error) };
  refresh(v.business || undefined);
  if ((data as { result?: string } | null)?.result === "full") return { full: true, message: "That spot is full right now." };
  return { message: `Featured placement activated${v.source === "paid" ? `. Payment${money(v.amountCents)} recorded` : " (comp)"}.` };
}

export async function addToWaitlist(form: FormData): Promise<BillingState> {
  const a = await adminOnly(); if (!a.staff) return { error: a.error };
  const business = String(form.get("business") ?? ""), slot = String(form.get("slot") ?? ""), scope = String(form.get("scope") ?? "");
  if (!isUuid(business) || !(SLOTS as readonly string[]).includes(slot) || (scope && !isUuid(scope))) return { error: FAIL };
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("add_to_waitlist", { p_tenant: a.staff.tenant.id, p_business: business, p_slot: slot, p_scope: scope || null, p_notes: null });
  if (error) return { error: friendly(error) };
  refresh(business);
  return { message: (data as { already?: boolean } | null)?.already ? "Already on the waitlist." : "Added to the waitlist." };
}

export async function endPlacement(form: FormData): Promise<BillingState> {
  const a = await adminOnly(); if (!a.staff) return { error: a.error };
  const id = String(form.get("id") ?? ""); if (!isUuid(id)) return { error: "Unknown placement." };
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("end_placement", { p_tenant: a.staff.tenant.id, p_id: id, p_reason: String(form.get("reason") ?? "").slice(0, 500) || null });
  if (error) return { error: friendly(error) };
  refresh(String(form.get("business") ?? "") || undefined);
  return { message: `Done: ${(data as { result?: string } | null)?.result ?? "ended"}.` };
}
