"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/admin/detail-input";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";

export interface RetryState { error?: string; message?: string }
export async function retryEmail(form: FormData): Promise<RetryState> {
  const staff = await requireArea("crm");
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Unknown email." };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("retry_notification", { p_tenant: staff.tenant.id, p_id: id });
  if (error) return { error: error.code === "22023" && error.message ? error.message.charAt(0).toUpperCase() + error.message.slice(1) + "." : "That could not be retried. Reload the page and try again." };
  revalidatePath("/admin/email");
  return { message: "Queued to send again." };
}
