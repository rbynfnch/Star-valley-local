"use server";

import { revalidatePath } from "next/cache";
import { parseCommInput, parseStageInput } from "@/lib/admin/detail-input";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";

export interface FormState { error?: string; saved?: string }
const FAIL = "That could not be saved. Try again, or reload the page.";

export async function setStage(_prev: FormState, form: FormData): Promise<FormState> {
  const staff = await requireArea("crm");
  const p = parseStageInput(form);
  if (!p.ok) return { error: p.error };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("set_lead_stage", { p_tenant: staff.tenant.id, p_business: p.value.business, p_stage: p.value.stage, p_lost_reason: p.value.lostReason });
  if (error) return { error: FAIL };
  revalidatePath(`/admin/businesses/${p.value.business}`);
  return { saved: "Lead stage updated." };
}

export async function addEntry(_prev: FormState, form: FormData): Promise<FormState> {
  const staff = await requireArea("crm");
  const p = parseCommInput(form, staff.tenant.timezone);
  if (!p.ok) return { error: p.error };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("add_communication", {
    p_tenant: staff.tenant.id, p_business: p.value.business, p_kind: p.value.kind, p_subject: p.value.subject, p_body: p.value.body,
    p_outcome: p.value.outcome, p_follow_up_at: p.value.followUpAt,
  });
  if (error) return { error: FAIL };
  revalidatePath(`/admin/businesses/${p.value.business}`);
  return { saved: "Saved to the log." };
}
