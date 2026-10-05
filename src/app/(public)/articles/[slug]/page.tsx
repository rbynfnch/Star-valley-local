import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArticleTile } from "@/components/content/ContentCards";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { articleJsonLd, buildArticleView, toArticleCard, type ArticleCtx } from "@/lib/content/articles";
import { getDirectoryData } from "@/lib/directory/data";
import type { Tenant } from "@/lib/directory/types";
import { mediaBaseUrl } from "@/lib/media";
import { jsonLdString } from "@/lib/seo/jsonld";
import { socialMeta } from "@/lib/seo/meta";
import { requestOrigin } from "@/lib/tenant/request-origin";
import { getTenant } from "@/lib/tenant/resolve";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const load = cache(async (tenant: Tenant, slug: string) => {
  if (!SLUG.test(slug)) return null;
  const data = getDirectoryData();
  const found = await data.articleBySlug(tenant.id, slug);
  if (!found) return null;
  const a = found.article;
  const [cats, related] = await Promise.all([data.articleCategories(tenant.id), data.listArticles(tenant.id, { q: "", categoryId: a.category_id, featured: false, limit: 4, offset: 0 })]);
  const rel = related.rows.filter((r) => r.id !== a.id).slice(0, 3);
  const ids = <T,>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => !!x))] as string[];
  const [authors, media, businesses] = await Promise.all([
    data.authors(tenant.id, ids([a.author_id, ...rel.map((r) => r.author_id)])), data.mediaAssets(tenant.id, ids([a.cover_media_id, ...rel.map((r) => r.cover_media_id)])),
    data.businessesByIds(tenant.id, ids([a.spotlight_business_id, ...found.items.map((i) => i.business_id)])),
  ]);
  const ctx: ArticleCtx = { categories: cats, authors, media, mediaBase: mediaBaseUrl(), tz: tenant.timezone };
  return { view: buildArticleView(a, found.items, ctx, businesses), related: rel.map((r) => toArticleCard(r, ctx)), spotlightBusiness: businesses.find((b) => b.id === a.spotlight_business_id) ?? null };
});

export async function generateMetadata(props: PageProps<"/articles/[slug]">): Promise<Metadata> {
  const tenant = await getTenant(); if (!tenant) return {};
  const v = (await load(tenant, (await props.params).slug))?.view; if (!v) return {};
  return { title: v.seoTitle, description: v.description, alternates: { canonical: v.path }, ...socialMeta({ title: v.seoTitle, description: v.description, path: v.path, siteName: tenant.name, image: v.card.image?.url }) };
}

export default async function ArticlePage(props: PageProps<"/articles/[slug]">) {
  const tenant = await getTenant(); if (!tenant) notFound();
  const r = await load(tenant, (await props.params).slug); if (!r) notFound();
  const { view: v } = r, origin = await requestOrigin();
  const crumbs = [{ name: "Home", path: "/" }, { name: "Articles", path: "/articles" }, { name: v.title, path: v.path }];
  return (
    <main id="main">
      {origin && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(articleJsonLd({ origin, path: v.path, title: v.title, description: v.description, published: v.card.date, author: v.card.authorName, image: v.card.image?.url ?? null, siteName: tenant.name })) }} />}
      <header className="bg-[linear-gradient(115deg,var(--navy)_0%,var(--navy)_55%,var(--valley-blue)_100%)] text-text-on-inverse">
        <div className="mx-auto w-full max-w-[var(--container-max)] space-y-4 px-4 py-8 sm:px-8">
          <Breadcrumbs crumbs={crumbs} />
          {v.card.categoryName && <p className="text-sm font-bold text-text-on-inverse">{v.card.categoryName}</p>}
          <h1 className="max-w-3xl font-heading text-4xl font-bold text-text-on-inverse [overflow-wrap:anywhere]">{v.title}</h1>
          <p className="text-text-on-inverse">{[v.card.authorName && `By ${v.card.authorName}`, v.card.dateText, v.card.readText].filter(Boolean).join(" · ")}</p>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-[var(--container-max)] gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_20rem]">
        <article className="min-w-0 max-w-3xl">
          {v.card.image && <div className="relative mb-6 aspect-[16/9] overflow-hidden rounded-card bg-surface-muted"><Image src={v.card.image.url} alt={v.card.image.alt} fill sizes="(min-width: 1024px) 60vw, 100vw" priority className="object-cover" /></div>}
          <div className="article-body" dangerouslySetInnerHTML={{ __html: v.html }} />
          {v.items.length > 0 && (
            <ol className="mt-8 space-y-5">
              {v.items.map((i) => (
                <li key={i.position} className="flex gap-4 rounded-card bg-surface-card p-5 shadow-card">
                  <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-inverse font-bold text-text-on-inverse">{i.position}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-heading text-xl font-bold leading-snug [overflow-wrap:anywhere]"><span className="sr-only">{i.position}. </span>{i.title}</h2>
                    {i.html && <div className="article-body mt-2 !text-base" dangerouslySetInnerHTML={{ __html: i.html }} />}
                    {i.business && <p className="mt-2"><Link href={`/business/${i.business.slug}`} className="font-semibold text-link underline underline-offset-4">{i.business.name}</Link></p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {v.spotlight && <p className="mt-8 rounded-card bg-surface-muted p-4 text-text">Business spotlight: <Link href={`/business/${v.spotlight.slug}`} className="font-semibold text-link underline underline-offset-4">{v.spotlight.name}</Link></p>}
          {v.authorBio && v.card.authorName && <p className="mt-8 border-t border-border pt-4 text-sm text-text-muted"><strong className="text-text">{v.card.authorName}.</strong> {v.authorBio}</p>}
        </article>
        <aside aria-label="Related articles" className="space-y-4">
          {r.related.length > 0 && (<><h2 className="font-heading text-xl font-bold">Related articles</h2><ul className="grid gap-4">{r.related.map((a) => <ArticleTile key={a.slug} a={a} />)}</ul></>)}
          <p><Link href="/articles" className="font-semibold text-link underline underline-offset-4">All articles</Link></p>
        </aside>
      </div>
    </main>
  );
}
