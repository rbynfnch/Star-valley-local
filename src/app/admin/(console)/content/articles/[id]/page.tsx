import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/admin/detail-input";
import { dateField, timeField } from "@/lib/admin/editorial-input";
import { articleLive } from "@/lib/admin/editorial-view";
import { requireArea } from "@/lib/admin/session";
import { mediaBaseUrl } from "@/lib/media";
import { createUserClient } from "@/lib/supabase/server";
import { ArticleForm } from "../../ArticleForm";
import { CoverImage, DeleteButton } from "../../EditorialBits";

export const metadata: Metadata = { title: "Edit article" };
type A = { id: string; slug: string; title: string; excerpt: string | null; body_md: string; status: string; category_id: string | null; author_id: string | null; cover_media_id: string | null; spotlight_business_id: string | null; featured_rank: number | null; publish_at: string | null; seo_title: string | null; seo_description: string | null };

export default async function EditArticle({ params, searchParams }: PageProps<"/admin/content/articles/[id]">) {
  const staff = await requireArea("content");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const created = (await searchParams).created === "1";
  const supabase = await createUserClient(), t = staff.tenant.id, tz = staff.tenant.timezone;
  const { data } = await supabase.from("articles").select("id,slug,title,excerpt,body_md,status,category_id,author_id,cover_media_id,spotlight_business_id,featured_rank,publish_at,seo_title,seo_description").eq("tenant_id", t).eq("id", id).maybeSingle();
  if (!data) notFound();
  const a = data as A;
  const [cats, authors, items, cover, spot, author] = await Promise.all([
    supabase.from("article_categories").select("id,name").eq("tenant_id", t).eq("is_active", true).order("sort_order"),
    supabase.from("authors").select("name").eq("tenant_id", t).order("name"),
    supabase.from("article_items").select("position,title,body,business_id").eq("tenant_id", t).eq("article_id", id).order("position"),
    a.cover_media_id ? supabase.from("media_assets").select("storage_bucket,storage_path,alt_text").eq("id", a.cover_media_id).maybeSingle() : Promise.resolve({ data: null }),
    a.spotlight_business_id ? supabase.from("businesses").select("slug").eq("id", a.spotlight_business_id).maybeSingle() : Promise.resolve({ data: null }),
    a.author_id ? supabase.from("authors").select("name").eq("id", a.author_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const itemRows = (items.data ?? []) as { position: number; title: string; body: string | null; business_id: string | null }[];
  const bizIds = [...new Set(itemRows.map((i) => i.business_id).filter((x): x is string => !!x))];
  const bizSlugs = bizIds.length ? ((await supabase.from("businesses").select("id,slug").in("id", bizIds)).data ?? []) as { id: string; slug: string }[] : [];
  const live = articleLive(a);
  const media = cover.data as { storage_bucket: string; storage_path: string; alt_text: string | null } | null;
  return (
    <>
      <p className="text-sm"><Link href="/admin/content/articles" className="text-link underline">← Articles</Link></p>
      <h1 className="mt-2 font-heading text-2xl font-semibold text-text [overflow-wrap:anywhere]">Edit article</h1>
      {created && <p role="status" className="mt-3 rounded-card bg-surface-muted p-3 text-sm font-medium text-green-800">Created as a draft. Add a cover image below, then publish when it is ready.</p>}
      <p className="mt-1 text-sm text-text-muted">{live ? <>Live at <Link href={`/articles/${a.slug}`} className="font-medium text-link underline" target="_blank">/articles/{a.slug}</Link></> : "Not visible to the public yet."}</p>
      <div className="mt-4 space-y-4">
        <div className="rounded-card bg-surface-card p-4 shadow-card">
          <ArticleForm categories={cats.data ?? []} authors={(authors.data ?? []).map((x: { name: string }) => x.name)}
            v={{ id: a.id, title: a.title, slug: a.slug, excerpt: a.excerpt ?? "", body: a.body_md, category: a.category_id ?? "", author: (author.data as { name: string } | null)?.name ?? "", status: a.status,
              publish_date: dateField(a.publish_at, tz), publish_time: timeField(a.publish_at, tz) || "09:00", featured_rank: a.featured_rank ? String(a.featured_rank) : "", seo_title: a.seo_title ?? "", seo_description: a.seo_description ?? "",
              spotlight: (spot.data as { slug: string } | null)?.slug ?? "", items: itemRows.map((i) => ({ title: i.title, body: i.body ?? "", business_slug: bizSlugs.find((b) => b.id === i.business_id)?.slug ?? "" })) }} />
        </div>
        <CoverImage kind="article" id={a.id} mediaBase={mediaBaseUrl()} current={media ? { bucket: media.storage_bucket, path: media.storage_path, alt: media.alt_text } : null} />
        <div className="rounded-card bg-surface-card p-4 shadow-card"><DeleteButton kind="article" id={a.id} what="article" /><p className="mt-2 text-xs text-text-muted">Only a draft or archived article can be deleted.</p></div>
      </div>
    </>
  );
}
