"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/detail-input";
import { parseEditInput } from "@/lib/admin/edit-input";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";

export interface EditState { error?: string; saved?: string }
const FAIL = "That could not be saved. Try again, or reload the page.";
// update_business_fields / set_business_status raise readable messages for rule violations (SQLSTATE 22023 / 22001);
// anything else (network, permissions, bugs) gets the generic message.
const friendly = (e: { code?: string; message?: string }) => ((e.code === "22023" || e.code === "22001") && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);

export async function saveFields(_prev: EditState, form: FormData): Promise<EditState> {
  const staff = await requireArea("businesses");
  const p = parseEditInput(form);
  if (!p.ok) return { error: p.error };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("update_business_fields", { p_tenant: staff.tenant.id, p_business: p.business, p_fields: p.fields });
  if (error) return { error: friendly(error) };
  revalidatePath(`/admin/businesses/${p.business}`);
  redirect(`/admin/businesses/${p.business}?saved=1`);
}

const TARGETS = ["unclaimed", "archived", "prospect"] as const;
export async function changeStatus(_prev: EditState, form: FormData): Promise<EditState> {
  const staff = await requireArea("businesses");
  const business = String(form.get("business") ?? "");
  const status = String(form.get("status") ?? "");
  if (!isUuid(business) || !(TARGETS as readonly string[]).includes(status)) return { error: "Unknown business or status." };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("set_business_status", { p_tenant: staff.tenant.id, p_business: business, p_status: status });
  if (error) return { error: friendly(error) };
  revalidatePath(`/admin/businesses/${business}`);
  revalidatePath("/admin/businesses");
  return { saved: status === "unclaimed" ? "Published. It is now on the public site." : status === "archived" ? "Archived. It is no longer on the public site." : "Restored as a hidden prospect." };
}
