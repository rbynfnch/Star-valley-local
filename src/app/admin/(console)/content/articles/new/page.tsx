import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";
import { ArticleForm } from "../../ArticleForm";

export const metadata: Metadata = { title: "New article" };

export default async function NewArticle() {
  const staff = await requireArea("content");
  const supabase = await createUserClient();
  const [cats, authors] = await Promise.all([
    supabase.from("article_categories").select("id,name").eq("tenant_id", staff.tenant.id).eq("is_active", true).order("sort_order"),
    supabase.from("authors").select("name").eq("tenant_id", staff.tenant.id).order("name"),
  ]);
  return (
    <>
      <p className="text-sm"><Link href="/admin/content/articles" className="text-link underline">← Articles</Link></p>
      <h1 className="mt-2 font-heading text-2xl font-semibold text-text">New article</h1>
      <p className="mt-1 text-sm text-text-muted">It is saved as a draft until you publish it. Add a cover image after the first save.</p>
      <div className="mt-4 rounded-card bg-surface-card p-4 shadow-card">
        <ArticleForm categories={cats.data ?? []} authors={(authors.data ?? []).map((a: { name: string }) => a.name)}
          v={{ id: null, title: "", slug: "", excerpt: "", body: "", category: "", author: "", status: "draft", publish_date: "", publish_time: "09:00", featured_rank: "", seo_title: "", seo_description: "", spotlight: "", items: [] }} />
      </div>
    </>
  );
}
