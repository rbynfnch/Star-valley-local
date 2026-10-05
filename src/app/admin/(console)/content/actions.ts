"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/detail-input";
import { parseArticleInput, parseEventInput } from "@/lib/admin/editorial-input";
import { sniffImage } from "@/lib/admin/image-sniff";
import { requireArea } from "@/lib/admin/session";
import { createServiceClient } from "@/lib/supabase/service";
import { createUserClient } from "@/lib/supabase/server";

export interface EditorialState { error?: string; message?: string }
const FAIL = "That could not be saved. Reload the page and try again.";
const FRIENDLY = new Set(["22023", "22001", "P0002"]);
const friendly = (e: { code?: string; message?: string }) => (e.code && FRIENDLY.has(e.code) && e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : FAIL);
const BUCKET = "media";
const refresh = (kind: "article" | "event") => { revalidatePath(`/admin/content/${kind}s`); revalidatePath("/admin/content"); };

async function businessId(supabase: Awaited<ReturnType<typeof createUserClient>>, tenant: string, slug: string | null): Promise<{ id: string | null; error?: string }> {
  if (!slug) return { id: null };
  const { data } = await supabase.from("businesses").select("id").eq("tenant_id", tenant).eq("slug", slug).maybeSingle();
  return data ? { id: (data as { id: string }).id } : { id: null, error: `No business has the web address name "${slug}".` };
}
async function removeFile(path: string | null | undefined) {
  if (!path) return;
  try { await createServiceClient().storage.from(BUCKET).remove([path]); } catch { /* an orphaned file is harmless */ }
}

export async function saveArticle(_s: EditorialState, form: FormData): Promise<EditorialState> {
  const staff = await requireArea("content");
  const p = parseArticleInput(form, staff.tenant.timezone); if (!p.ok) return { error: p.error };
  const a = p.value, supabase = await createUserClient();
  const spot = await businessId(supabase, staff.tenant.id, a.spotlightSlug); if (spot.error) return { error: spot.error };
  const { data, error } = await supabase.rpc("save_article", {
    p_tenant: staff.tenant.id, p_id: a.id, p_title: a.title, p_slug: a.slug, p_excerpt: a.excerpt, p_body: a.body, p_category: a.category, p_author: a.author, p_status: a.status,
    p_publish_at: a.publishAt, p_featured_rank: a.featuredRank, p_seo_title: a.seoTitle, p_seo_description: a.seoDescription, p_spotlight: spot.id, p_items: a.items,
  });
  if (error) return { error: friendly(error) };
  refresh("article");
  if (!a.id) redirect(`/admin/content/articles/${data as string}?created=1`);
  return { message: "Article saved." };
}
export async function saveEvent(_s: EditorialState, form: FormData): Promise<EditorialState> {
  const staff = await requireArea("content");
  const p = parseEventInput(form, staff.tenant.timezone); if (!p.ok) return { error: p.error };
  const e = p.value, supabase = await createUserClient();
  const org = await businessId(supabase, staff.tenant.id, e.organizerSlug); if (org.error) return { error: org.error };
  const { data, error } = await supabase.rpc("save_event", {
    p_tenant: staff.tenant.id, p_id: e.id, p_title: e.title, p_description: e.description, p_community: e.community, p_category: e.category, p_venue: e.venue, p_address: e.address,
    p_starts: e.startsAt, p_ends: e.endsAt, p_all_day: e.allDay, p_rrule: e.rrule, p_until: e.until, p_url: e.url, p_organizer: org.id, p_status: e.status,
  });
  if (error) return { error: friendly(error) };
  refresh("event");
  if (!e.id) redirect(`/admin/content/events/${data as string}?created=1`);
  return { message: "Event saved." };
}

async function remove(kind: "article" | "event", form: FormData): Promise<EditorialState> {
  const staff = await requireArea("content");
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Unknown item." };
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc(kind === "article" ? "delete_article" : "delete_event", { p_tenant: staff.tenant.id, p_id: id });
  if (error) return { error: friendly(error) };
  await removeFile((data as { path?: string } | null)?.path);
  refresh(kind);
  redirect(`/admin/content/${kind}s?deleted=1`);
}
export async function deleteArticle(_s: EditorialState, form: FormData) { return remove("article", form); }
export async function deleteEvent(_s: EditorialState, form: FormData) { return remove("event", form); }

// Cover images: the server stores the file (type from its bytes, never the filename), the database function records it.
export async function uploadCover(_s: EditorialState, form: FormData): Promise<EditorialState> {
  const staff = await requireArea("content");
  const kind = form.get("kind") === "event" ? "event" : form.get("kind") === "hotlist" ? "hotlist" : "article", id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Unknown item." };
  const alt = String(form.get("alt") ?? "").replace(/\s+/g, " ").trim();
  if (!alt) return { error: "Describe the image for people who cannot see it (alt text)." };
  if (alt.length > 200) return { error: "Alt text is limited to 200 characters." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  if (file.size > 5_000_000) return { error: "Images can be at most 5 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const img = sniffImage(bytes); if (!img.ok) return { error: img.error };
  const path = `${staff.tenant.id}/${kind}s/${id}/${randomUUID()}.${img.ext}`;
  try {
    const up = await createServiceClient().storage.from(BUCKET).upload(path, bytes, { contentType: img.type, upsert: false, cacheControl: "31536000" });
    if (up.error) return { error: FAIL };
  } catch { return { error: FAIL }; }
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("set_content_image", { p_tenant: staff.tenant.id, p_kind: kind, p_id: id, p_bucket: BUCKET, p_path: path, p_alt: alt, p_width: img.width, p_height: img.height, p_bytes: bytes.length });
  if (error) { await removeFile(path); return { error: friendly(error) }; }
  await removeFile((data as { replaced?: { path?: string } | null } | null)?.replaced?.path);
  revalidatePath(kind === "hotlist" ? `/admin/hotlist/${id}` : `/admin/content/${kind}s/${id}`);
  return { message: "Image saved." };
}
export async function removeCover(_s: EditorialState, form: FormData): Promise<EditorialState> {
  const staff = await requireArea("content");
  const kind = form.get("kind") === "event" ? "event" : form.get("kind") === "hotlist" ? "hotlist" : "article", id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Unknown item." };
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("clear_content_image", { p_tenant: staff.tenant.id, p_kind: kind, p_id: id });
  if (error) return { error: friendly(error) };
  await removeFile((data as { path?: string | null } | null)?.path);
  revalidatePath(kind === "hotlist" ? `/admin/hotlist/${id}` : `/admin/content/${kind}s/${id}`);
  return { message: "Image removed." };
}
