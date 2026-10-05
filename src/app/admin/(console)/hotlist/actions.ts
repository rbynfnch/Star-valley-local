"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/detail-input";
import { parseFeatureIds, parseHotlistInput, slotFromForm } from "@/lib/admin/hotlist-input";
import { requireArea } from "@/lib/admin/session";
import { createServiceClient } from "@/lib/supabase/service";
import { createUserClient } from "@/lib/supabase/server";

export interface HotlistState { error?: string; message?: string }
const FAIL = "That could not be saved. Reload the page and try again.";
const FRIENDLY = new Set(["22023", "22001", "P0002", "53400"]);
const friendly = (e: { code?: string; message?: string }) => (e.code && FRIENDLY.has(e.code) && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);
const refresh = (id?: string) => { revalidatePath("/admin/hotlist"); if (id) revalidatePath(`/admin/hotlist/${id}`); revalidatePath("/hotlist"); };

export async function saveHotlist(_s: HotlistState, form: FormData): Promise<HotlistState> {
  const staff = await requireArea("content");
  const p = parseHotlistInput(form, staff.tenant.timezone); if (!p.ok) return { error: p.error };
  const v = p.value, supabase = await createUserClient();
  const { data: biz } = await supabase.from("businesses").select("id").eq("tenant_id", staff.tenant.id).eq("slug", v.businessSlug).maybeSingle();
  if (!biz) return { error: `No business has the web address name "${v.businessSlug}".` };
  const { data, error } = await supabase.rpc("save_hotlist_item", { p_tenant: staff.tenant.id, p_id: v.id, p_business: (biz as { id: string }).id, p_fields: v.fields, p_status: v.status });
  if (error) return { error: friendly(error) };
  refresh(v.id ?? undefined);
  if (!v.id) redirect(`/admin/hotlist/${data as string}?created=1`);
  return { message: "Saved." };
}

export async function reviewHotlist(_s: HotlistState, form: FormData): Promise<HotlistState> {
  const staff = await requireArea("content");
  const id = String(form.get("id") ?? ""), decision = form.get("decision") === "reject" ? "reject" : "approve";
  if (!isUuid(id)) return { error: "Unknown item." };
  const { error } = await (await createUserClient()).rpc("review_hotlist_item", { p_tenant: staff.tenant.id, p_id: id, p_decision: decision, p_reason: String(form.get("reason") ?? "").slice(0, 500) });
  if (error) return { error: friendly(error) };
  refresh(id);
  return { message: decision === "approve" ? "Approved and published." : "Rejected." };
}

export async function deleteHotlist(_s: HotlistState, form: FormData): Promise<HotlistState> {
  const staff = await requireArea("content");
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Unknown item." };
  const { data, error } = await (await createUserClient()).rpc("delete_hotlist_item", { p_tenant: staff.tenant.id, p_id: id });
  if (error) return { error: friendly(error) };
  const path = (data as { path?: string } | null)?.path;
  if (path) { try { await createServiceClient().storage.from("media").remove([path]); } catch { /* an orphaned file is harmless */ } }
  refresh();
  redirect("/admin/hotlist?deleted=1");
}

export async function saveFeatures(_s: HotlistState, form: FormData): Promise<HotlistState> {
  const staff = await requireArea("content");
  const slot = slotFromForm(form.get("slot")); if (!slot) return { error: "Unknown slot." };
  const ids = parseFeatureIds(form, slot); if (!ids.ok) return { error: ids.error };
  const { error } = await (await createUserClient()).rpc("set_hotlist_features", { p_tenant: staff.tenant.id, p_slot: slot, p_items: ids.value });
  if (error) return { error: friendly(error) };
  refresh();
  return { message: "Saved." };
}

export async function redeemCode(_s: HotlistState, form: FormData): Promise<HotlistState> {
  const staff = await requireArea("content");
  const { data, error } = await (await createUserClient()).rpc("redeem_hotlist_code", { p_tenant: staff.tenant.id, p_code: String(form.get("code") ?? "").slice(0, 40) });
  if (error) return { error: friendly(error) };
  const r = data as { result: string; title: string };
  refresh();
  return { message: r.result === "redeemed" ? `Redeemed: ${r.title}.` : `Already redeemed: ${r.title}.` };
}
