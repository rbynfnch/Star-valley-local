"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/admin/detail-input";
import { requireArea } from "@/lib/admin/session";
import { requestOrigin } from "@/lib/tenant/request-origin";
import { createUserClient } from "@/lib/supabase/server";

export interface Card { business_id: string; name: string; address_line1: string | null; address_line2: string | null; city: string | null; state: string | null; postal_code: string | null; code: string; url: string }
export interface BatchState { error?: string; message?: string; label?: string; cards?: Card[] }
const FAIL = "That could not be done. Reload the page and try again.";
const friendly = (e: { code?: string; message?: string }) => (["22023", "P0002"].includes(e.code ?? "") && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);

// The codes come back from the database exactly once, here, and go straight to the printable sheet. Only a hash is stored.
export async function createBatch(_s: BatchState, form: FormData): Promise<BatchState> {
  const staff = await requireArea("crm");
  const ids = form.getAll("business").map(String).filter(isUuid);
  if (ids.length === 0) return { error: "Choose at least one business." };
  const origin = await requestOrigin();
  if (!origin) return { error: FAIL };
  const { data, error } = await (await createUserClient()).rpc("postcard_batch_create", { p_tenant: staff.tenant.id, p_label: String(form.get("label") ?? ""), p_businesses: ids });
  if (error || !data) return { error: error ? friendly(error) : FAIL };
  revalidatePath("/admin/postcards");
  const r = data as { label: string; cards: Omit<Card, "url">[] };
  return { label: r.label, message: `${r.cards.length} card${r.cards.length === 1 ? "" : "s"} ready. Print them now: the codes are not stored and cannot be shown again.`,
    cards: r.cards.map((c) => ({ ...c, url: `${origin}/verify/postcard?c=${c.code}` })) };
}

export async function voidCard(_s: BatchState, form: FormData): Promise<BatchState> {
  const staff = await requireArea("crm");
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Unknown card." };
  const { error } = await (await createUserClient()).rpc("postcard_void", { p_tenant: staff.tenant.id, p_code: id });
  if (error) return { error: friendly(error) };
  revalidatePath("/admin/postcards");
  return { message: "Card voided." };
}
