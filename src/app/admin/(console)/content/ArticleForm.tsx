"use client";

import { MAX_ITEMS } from "@/lib/admin/editorial-input";
import { saveArticle } from "./actions";
import { ActionForm, field, labelCls } from "./EditorialBits";

export interface ArticleValues {
  id: string | null; title: string; slug: string; excerpt: string; body: string; category: string; author: string; status: string; publish_date: string; publish_time: string;
  featured_rank: string; seo_title: string; seo_description: string; spotlight: string; items: { title: string; body: string; business_slug: string }[];
}
type Opt = { id: string; name: string };

export function ArticleForm({ v, categories, authors }: { v: ArticleValues; categories: Opt[]; authors: string[] }) {
  const rows = Math.min(MAX_ITEMS, v.items.length + 3);
  return (
    <ActionForm action={saveArticle} buttonLabel={v.id ? "Save article" : "Create article"}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div><label htmlFor="title" className={labelCls}>Title</label><input id="title" name="title" defaultValue={v.title} maxLength={150} required className={field} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><label htmlFor="slug" className={labelCls}>Web address <span className="font-normal text-text-muted">(blank: made from the title)</span></label>
          <input id="slug" name="slug" defaultValue={v.slug} maxLength={80} placeholder="ten-things-to-do" className={field} /></div>
        <div><label htmlFor="category" className={labelCls}>Category</label>
          <select id="category" name="category" defaultValue={v.category} className={field}><option value="">None</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label htmlFor="author" className={labelCls}>Author (byline)</label>
          <input id="author" name="author" list="authors" defaultValue={v.author} maxLength={80} className={field} /><datalist id="authors">{authors.map((a) => <option key={a} value={a} />)}</datalist></div>
        <div><label htmlFor="featured_rank" className={labelCls}>Featured position</label>
          <select id="featured_rank" name="featured_rank" defaultValue={v.featured_rank} className={field}><option value="">Not featured</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 1 ? "1 (the main feature)" : n}</option>)}</select></div>
      </div>
      <div><label htmlFor="excerpt" className={labelCls}>Summary <span className="font-normal text-text-muted">(shown on cards, up to 300 characters)</span></label>
        <textarea id="excerpt" name="excerpt" rows={2} maxLength={300} defaultValue={v.excerpt} className={field} /></div>
      <div><label htmlFor="body" className={labelCls}>Article text</label>
        <textarea id="body" name="body" rows={14} defaultValue={v.body} className={`${field} font-mono`} aria-describedby="md-help" />
        <p id="md-help" className="mt-1 text-xs text-text-muted">Plain text with simple formatting: a blank line starts a paragraph; <code># Heading</code>, <code>- list item</code>, <code>1. numbered item</code>, <code>&gt; quote</code>, <code>**bold**</code>, <code>*italic*</code>, <code>[link text](https://example.com)</code>.</p></div>

      <fieldset className="rounded-card border border-slate-600 p-3">
        <legend className="px-1 text-sm font-semibold text-text">Guide items <span className="font-normal text-text-muted">(optional: a numbered list such as &ldquo;10 Things to Do&rdquo;)</span></legend>
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="grid gap-2 rounded-card bg-surface-muted p-3 md:grid-cols-[1fr_1fr_12rem]">
              <div><label htmlFor={`item_title_${i}`} className={labelCls}>Item {i + 1} title</label><input id={`item_title_${i}`} name={`item_title_${i}`} defaultValue={v.items[i]?.title ?? ""} maxLength={150} className={field} /></div>
              <div><label htmlFor={`item_body_${i}`} className={labelCls}>Item {i + 1} text</label><textarea id={`item_body_${i}`} name={`item_body_${i}`} rows={2} maxLength={2000} defaultValue={v.items[i]?.body ?? ""} className={field} /></div>
              <div><label htmlFor={`item_biz_${i}`} className={labelCls}>Business <span className="font-normal text-text-muted">(web address name)</span></label><input id={`item_biz_${i}`} name={`item_biz_${i}`} defaultValue={v.items[i]?.business_slug ?? ""} placeholder="valley-plumbing" className={field} /></div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-text-muted">Saving replaces the whole list. Empty rows are ignored.</p>
      </fieldset>

      <fieldset className="grid gap-4 rounded-card border border-slate-600 p-3 md:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-text">Publishing</legend>
        <div><label htmlFor="status" className={labelCls}>Status</label>
          <select id="status" name="status" defaultValue={v.status} className={field}><option value="draft">Draft (hidden)</option><option value="scheduled">Scheduled (goes live at the time below)</option><option value="published">Published</option><option value="archived">Archived (hidden)</option></select></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label htmlFor="publish_date" className={labelCls}>Publish date</label><input id="publish_date" type="date" name="publish_date" defaultValue={v.publish_date} className={field} /></div>
          <div><label htmlFor="publish_time" className={labelCls}>Time</label><input id="publish_time" type="time" name="publish_time" defaultValue={v.publish_time} className={field} /></div>
        </div>
        <div><label htmlFor="spotlight" className={labelCls}>Business spotlight <span className="font-normal text-text-muted">(web address name)</span></label><input id="spotlight" name="spotlight" defaultValue={v.spotlight} placeholder="valley-plumbing" className={field} /></div>
      </fieldset>
      <fieldset className="grid gap-4 rounded-card border border-slate-600 p-3 md:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-text">Search results <span className="font-normal text-text-muted">(optional)</span></legend>
        <div><label htmlFor="seo_title" className={labelCls}>Search title <span className="font-normal text-text-muted">(up to 70)</span></label><input id="seo_title" name="seo_title" defaultValue={v.seo_title} maxLength={70} className={field} /></div>
        <div><label htmlFor="seo_description" className={labelCls}>Search description <span className="font-normal text-text-muted">(up to 200)</span></label><input id="seo_description" name="seo_description" defaultValue={v.seo_description} maxLength={200} className={field} /></div>
      </fieldset>
    </ActionForm>
  );
}
