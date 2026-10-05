import { mediaUrl } from "../media.ts";
import { plainExcerpt, renderMarkdown } from "./markdown.ts";
import type { ArticleCategory, ArticleFull, ArticleItem, ArticleListRow, Author, BusinessRow, MediaRow } from "../directory/types.ts";

// The /articles pages and the weekend guide. Cover images come from media_assets rows read as the public; every URL goes through mediaUrl().
export const ARTICLES_PER_PAGE = 9;
export interface ArticleParams { category: string | null; q: string; page: number }
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function parseArticleParams(raw: Raw): ArticleParams {
  const c = one(raw.category), q = (one(raw.q) ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100), p = Number(one(raw.page));
  return { category: c && SLUG.test(c) && c.length <= 80 ? c : null, q, page: Number.isInteger(p) && p >= 1 && p <= 1000 ? p : 1 };
}
export function articlesUrl(p: Partial<ArticleParams>): string {
  const sp = new URLSearchParams();
  if (p.category) sp.set("category", p.category);
  if (p.q) sp.set("q", p.q);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const s = sp.toString();
  return s ? `/articles?${s}` : "/articles";
}

export interface ArticleCtx { categories: ArticleCategory[]; authors: Author[]; media: MediaRow[]; mediaBase: string | null; tz: string }
export interface ArticleCard {
  slug: string; title: string; excerpt: string | null; categoryName: string | null; categoryColor: string | null; authorName: string | null;
  date: string; dateText: string; readText: string | null; image: { url: string; alt: string } | null;
}
const dateText = (iso: string, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
export function coverFor(id: string | null, ctx: Pick<ArticleCtx, "media" | "mediaBase">): { url: string; alt: string } | null {
  const m = id ? ctx.media.find((x) => x.id === id) : null;
  const url = m ? mediaUrl(ctx.mediaBase, m.storage_bucket, m.storage_path) : null;
  return m && url ? { url, alt: m.alt_text?.trim() || "" } : null;
}
export function toArticleCard(a: ArticleListRow, ctx: ArticleCtx): ArticleCard {
  const cat = ctx.categories.find((c) => c.id === a.category_id);
  return {
    slug: a.slug, title: a.title, excerpt: a.excerpt, categoryName: cat?.name ?? null, categoryColor: cat?.color_token ?? null,
    authorName: ctx.authors.find((x) => x.id === a.author_id)?.name ?? null, date: a.publish_at, dateText: dateText(a.publish_at, ctx.tz),
    readText: a.read_minutes ? `${a.read_minutes} min read` : null, image: coverFor(a.cover_media_id, ctx),
  };
}

export interface ArticleView {
  id: string; slug: string; path: string; title: string; description: string; html: string; card: ArticleCard; seoTitle: string;
  items: { position: number; title: string; html: string; business: { name: string; slug: string } | null; eventSlug: string | null }[];
  authorBio: string | null; spotlight: { name: string; slug: string } | null;
}
export function buildArticleView(a: ArticleFull, items: ArticleItem[], ctx: ArticleCtx, businesses: BusinessRow[]): ArticleView {
  const card = toArticleCard(a, ctx);
  const biz = (id: string | null) => { const b = id ? businesses.find((x) => x.id === id) : null; return b ? { name: b.name, slug: b.slug } : null; };
  return {
    id: a.id, slug: a.slug, path: `/articles/${a.slug}`, title: a.title, card, seoTitle: a.seo_title?.trim() || a.title,
    description: a.seo_description?.trim() || a.excerpt?.trim() || plainExcerpt(a.body_md, 160), html: renderMarkdown(a.body_md),
    items: items.map((i) => ({ position: i.position, title: i.title, html: i.body ? renderMarkdown(i.body) : "", business: biz(i.business_id), eventSlug: null })),
    authorBio: ctx.authors.find((x) => x.id === a.author_id)?.bio ?? null, spotlight: biz(a.spotlight_business_id),
  };
}

export function articleJsonLd(o: { origin: string; path: string; title: string; description: string; published: string; author: string | null; image: string | null; siteName: string }): object[] {
  const abs = (u: string) => (u.startsWith("/") ? o.origin + u : u);
  return [{
    "@context": "https://schema.org", "@type": "Article", "@id": `${o.origin}${o.path}#article`, mainEntityOfPage: `${o.origin}${o.path}`, headline: o.title.slice(0, 110),
    description: o.description, datePublished: o.published, dateModified: o.published,
    ...(o.author ? { author: { "@type": "Person", name: o.author } } : { author: { "@type": "Organization", name: o.siteName } }),
    publisher: { "@type": "Organization", name: o.siteName }, ...(o.image ? { image: [abs(o.image)] } : {}),
  }, {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, { name: "Articles", path: "/articles" }, { name: o.title, path: o.path }].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${o.origin}${c.path}` })),
  }];
}

/** "Oct 9–11" (same month) or "Oct 30 – Nov 1": the label for the weekend that Friday 5 PM to Sunday night covers. */
export function weekendLabel(start: Date, end: Date, tz: string): string {
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).format(d);
  const s = new Date(start), last = new Date(end.getTime() - 1);
  const sm = f(s, { month: "short" }), lm = f(last, { month: "short" });
  return sm === lm ? `${sm} ${f(s, { day: "numeric" })}–${f(last, { day: "numeric" })}` : `${sm} ${f(s, { day: "numeric" })} – ${lm} ${f(last, { day: "numeric" })}`;
}
