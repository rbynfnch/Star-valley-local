"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/admin/detail-input";
import { parseAreasInput, parseDealInput, parseFaqsInput, parseHighlightsInput, parseHoursInput, parseLinksInput, parsePhotoMeta, parseServicesInput } from "@/lib/admin/content-input";
import { sniffImage } from "@/lib/admin/image-sniff";
import { requireArea } from "@/lib/admin/session";
import { createServiceClient } from "@/lib/supabase/service";
import { createUserClient } from "@/lib/supabase/server";

export interface ContentState { error?: string; message?: string }
const FAIL = "That could not be saved. Reload the page and try again.";
// The functions raise readable messages for rule violations (SQLSTATE 22023 / 22001 / 53400 / P0002); anything else gets the generic message.
const FRIENDLY = new Set(["22023", "22001", "53400", "P0002", "28000"]);
const friendly = (e: { code?: string; message?: string }) => (e.code && FRIENDLY.has(e.code) && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);
const refresh = (business: string) => { revalidatePath(`/admin/businesses/${business}/content`); revalidatePath(`/admin/businesses/${business}`); };
const BUCKET = "media";

// ---- the section saves: parse, call the staff-only function as the signed-in user, refresh
async function save<T>(form: FormData, parse: (f: FormData) => { ok: true; business: string; value: T } | { ok: false; error: string },
  call: (rpc: Awaited<ReturnType<typeof createUserClient>>["rpc"], tenant: string, business: string, v: T) => PromiseLike<{ error: { code?: string; message?: string } | null }>, done: string): Promise<ContentState> {
  const staff = await requireArea("businesses");
  const p = parse(form); if (!p.ok) return { error: p.error };
  const supabase = await createUserClient();
  const { error } = await call(supabase.rpc.bind(supabase), staff.tenant.id, p.business, p.value);
  if (error) return { error: friendly(error) };
  refresh(p.business);
  return { message: done };
}

export async function saveHighlights(_s: ContentState, form: FormData): Promise<ContentState> {
  return save(form, parseHighlightsInput,
    (rpc, t, b, v) => rpc("update_business_fields", { p_tenant: t, p_business: b, p_fields: { highlights: v.highlights, price_range: v.price_range } }), "Highlights saved.");
}
export async function saveHours(_s: ContentState, form: FormData): Promise<ContentState> {
  return save(form, parseHoursInput,
    (rpc, t, b, v) => rpc("set_business_hours", { p_tenant: t, p_business: b, p_rows: v }), "Hours saved.");
}
export async function saveServices(_s: ContentState, form: FormData): Promise<ContentState> {
  return save(form, parseServicesInput,
    (rpc, t, b, v) => rpc("set_business_services", { p_tenant: t, p_business: b, p_names: v }), "Services saved.");
}
export async function saveLinks(_s: ContentState, form: FormData): Promise<ContentState> {
  return save(form, parseLinksInput,
    (rpc, t, b, v) => rpc("set_business_links", { p_tenant: t, p_business: b, p_items: v }), "Links saved.");
}
export async function saveFaqs(_s: ContentState, form: FormData): Promise<ContentState> {
  return save(form, parseFaqsInput,
    (rpc, t, b, v) => rpc("set_business_faqs", { p_tenant: t, p_business: b, p_items: v }), "Questions saved.");
}
export async function saveAreas(_s: ContentState, form: FormData): Promise<ContentState> {
  return save(form, parseAreasInput,
    (rpc, t, b, v) => rpc("set_business_areas", { p_tenant: t, p_business: b, p_community_ids: v.communities, p_category_ids: v.categories }), "Service area saved.");
}

// ---- deals
export async function saveDeal(_s: ContentState, form: FormData): Promise<ContentState> {
  const staff = await requireArea("businesses");
  const p = parseDealInput(form, staff.tenant.timezone); if (!p.ok) return { error: p.error };
  const d = p.value, supabase = await createUserClient();
  const { error } = await supabase.rpc("save_deal", {
    p_tenant: staff.tenant.id, p_business: p.business, p_id: d.id, p_title: d.title, p_description: d.description, p_terms: d.terms,
    p_discount_type: d.type, p_discount_value: d.value, p_status: d.status, p_starts_at: d.startsAt, p_ends_at: d.endsAt,
  });
  if (error) return { error: friendly(error) };
  refresh(p.business);
  return { message: d.id ? "Deal saved." : "Deal added." };
}
export async function deleteDeal(form: FormData): Promise<ContentState> {
  const staff = await requireArea("businesses");
  const business = String(form.get("business") ?? ""), deal = String(form.get("deal") ?? "");
  if (!isUuid(business) || !isUuid(deal)) return { error: "Unknown deal." };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("delete_deal", { p_tenant: staff.tenant.id, p_business: business, p_id: deal });
  if (error) return { error: friendly(error) };
  refresh(business);
  return { message: "Deal deleted." };
}

// ---- photos. The file goes to storage with the service role under <tenant>/<business>/<random>.<ext> (extension from the sniffed
// type, never the filename); the database function then records it and enforces the folder. If recording fails the file is removed;
// replaced or deleted files are removed only after the database has let go of them.
async function removeFile(path: string | null | undefined) {
  if (!path) return;
  try { await createServiceClient().storage.from(BUCKET).remove([path]); } catch { /* an orphaned file is harmless; the row is already gone */ }
}
export async function uploadPhoto(_s: ContentState, form: FormData): Promise<ContentState> {
  const staff = await requireArea("businesses");
  const m = parsePhotoMeta(form); if (!m.ok) return { error: m.error };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo to upload." };
  if (file.size > 5_000_000) return { error: "Photos can be at most 5 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const img = sniffImage(bytes); if (!img.ok) return { error: img.error };
  const path = `${staff.tenant.id}/${m.business}/${randomUUID()}.${img.ext}`;
  const supabase = await createUserClient();
  let stored = false;
  try {
    const up = await createServiceClient().storage.from(BUCKET).upload(path, bytes, { contentType: img.type, upsert: false, cacheControl: "31536000" });
    if (up.error) return { error: FAIL };
    stored = true;
  } catch { return { error: FAIL }; }
  const { data, error } = await supabase.rpc("add_business_photo", {
    p_tenant: staff.tenant.id, p_business: m.business, p_bucket: BUCKET, p_path: path, p_alt: m.value.alt, p_width: img.width, p_height: img.height,
    p_bytes: bytes.length, p_role: m.value.role, p_caption: m.value.caption,
  });
  if (error) { if (stored) await removeFile(path); return { error: friendly(error) }; }
  await removeFile((data as { replaced?: { path?: string } | null } | null)?.replaced?.path);
  refresh(m.business);
  return { message: m.value.role === "gallery" ? "Photo added." : `${m.value.role === "logo" ? "Logo" : "Cover photo"} set.` };
}
export async function updatePhoto(_s: ContentState, form: FormData): Promise<ContentState> {
  const staff = await requireArea("businesses");
  const m = parsePhotoMeta(form); if (!m.ok) return { error: m.error };
  if (!m.value.photo) return { error: "Unknown photo." };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("update_business_photo", { p_tenant: staff.tenant.id, p_business: m.business, p_photo: m.value.photo, p_alt: m.value.alt, p_caption: m.value.caption, p_role: m.value.role });
  if (error) return { error: friendly(error) };
  refresh(m.business);
  return { message: "Photo saved." };
}
export async function deletePhoto(form: FormData): Promise<ContentState> {
  const staff = await requireArea("businesses");
  const business = String(form.get("business") ?? ""), photo = String(form.get("photo") ?? "");
  if (!isUuid(business) || !isUuid(photo)) return { error: "Unknown photo." };
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("delete_business_photo", { p_tenant: staff.tenant.id, p_business: business, p_photo: photo });
  if (error) return { error: friendly(error) };
  await removeFile((data as { path?: string } | null)?.path);
  refresh(business);
  return { message: "Photo deleted." };
}
export async function reorderPhotos(form: FormData): Promise<ContentState> {
  const staff = await requireArea("businesses");
  const business = String(form.get("business") ?? "");
  const ids = form.getAll("order").map(String);
  if (!isUuid(business) || ids.length === 0 || !ids.every(isUuid)) return { error: "Unknown photo." };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("reorder_business_photos", { p_tenant: staff.tenant.id, p_business: business, p_ids: ids });
  if (error) return { error: friendly(error) };
  refresh(business);
  return { message: "Order saved." };
}
