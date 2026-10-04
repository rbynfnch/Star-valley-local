"use server";

import { revalidatePath } from "next/cache";
import { parseReviewInput } from "@/lib/admin/moderation-input";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";

export interface ReviewState { error?: string; message?: string; href?: string; duplicate?: { id: string; name: string } }
const FAIL = "That could not be saved. Reload the page and try again.";
// review_submission raises readable messages for rule violations (SQLSTATE 22023); anything else gets the generic message.
const friendly = (e: { code?: string; message?: string }) => (e.code === "22023" && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);

export async function reviewSubmission(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  const staff = await requireArea("moderation");
  const p = parseReviewInput(form);
  if (!p.ok) return { error: p.error };
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("review_submission", { p_tenant: staff.tenant.id, p_id: p.value.id, p_action: p.value.action, p_notes: p.value.notes, p_apply: p.value.apply, p_force: p.value.force });
  if (error) return { error: friendly(error) };
  const r = (data ?? {}) as { result?: string; business_id?: string; business_name?: string; event_id?: string; applied?: string[] };
  if (r.result === "duplicate" && r.business_id) return { duplicate: { id: r.business_id, name: r.business_name ?? "an existing business" } };
  revalidatePath("/admin/moderation"); revalidatePath("/admin");
  if (r.result === "approved") {
    if (r.business_id) return { message: "Approved. A hidden prospect was created.", href: `/admin/businesses/${r.business_id}` };
    if (r.event_id) return { message: "Approved. The event is published." };
    return { message: r.applied && r.applied.length ? `Approved. Applied: ${r.applied.join(", ")}.` : "Approved." };
  }
  return { message: r.result === "spam" ? "Marked as spam." : "Rejected." };
}
