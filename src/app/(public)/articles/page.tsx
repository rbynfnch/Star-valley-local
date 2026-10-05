import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArticleTile } from "@/components/content/ContentCards";
import { Pagination } from "@/components/directory/Pagination";
import { ChipNav, PageHero } from "@/components/site/PageHero";
import { ARTICLES_PER_PAGE, articlesUrl, parseArticleParams, toArticleCard, type ArticleCtx } from "@/lib/content/articles";
import { getDirectoryData } from "@/lib/directory/data";
import { mediaBaseUrl } from "@/lib/media";
import { socialMeta } from "@/lib/seo/meta";
import { getTenant } from "@/lib/tenant/resolve";

const DESC = "Local news, helpful guides, upcoming events and inspiration for living, working and exploring Star Valley.";
export async function generateMetadata(props: PageProps<"/articles">): Promise<Metadata> {
  const p = parseArticleParams(await props.searchParams);
  const filtered = !!p.category || !!p.q;
  return { title: p.q ? `Articles matching "${p.q}"` : "Articles", description: DESC, ...socialMeta({ title: "Articles", description: DESC, path: articlesUrl(filtered ? {} : { page: p.page }), siteName: (await getTenant())?.name ?? "" }),
    robots: filtered ? { index: false, follow: true } : undefined, alternates: { canonical: filtered ? "/articles" : articlesUrl({ page: p.page }) } };
}

export default async function Articles(props: PageProps<"/articles">) {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const p = parseArticleParams(await props.searchParams);
  const data = getDirectoryData();
  const cats = await data.articleCategories(tenant.id);
  const cat = p.category ? cats.find((c) => c.slug === p.category) ?? null : null;
  const unfiltered = !p.category && !p.q;
  const [list, counts, featured] = await Promise.all([
    p.category && !cat ? Promise.resolve({ rows: [], total: 0 }) : data.listArticles(tenant.id, { q: p.q, categoryId: cat?.id ?? null, featured: false, limit: ARTICLES_PER_PAGE, offset: (p.page - 1) * ARTICLES_PER_PAGE }),
    data.articleCategoryCounts(tenant.id),
    unfiltered && p.page === 1 ? data.listArticles(tenant.id, { q: "", categoryId: null, featured: true, limit: 1, offset: 0 }) : Promise.resolve({ rows: [], total: 0 }),
  ]);
  const shown = [...featured.rows, ...list.rows];
  const [authors, media] = await Promise.all([data.authors(tenant.id, [...new Set(shown.map((a) => a.author_id).filter((x): x is string => !!x))]), data.mediaAssets(tenant.id, [...new Set(shown.map((a) => a.cover_media_id).filter((x): x is string => !!x))])]);
  const ctx: ArticleCtx = { categories: cats, authors, media, mediaBase: mediaBaseUrl(), tz: tenant.timezone };
  const hero = featured.rows[0] ? toArticleCard(featured.rows[0], ctx) : null;
  const cards = list.rows.filter((r) => r.slug !== featured.rows[0]?.slug).map((r) => toArticleCard(r, ctx));
  const totalPages = Math.max(1, Math.ceil(list.total / ARTICLES_PER_PAGE));
  const all = counts.reduce((n, c) => n + c.n, 0);

  return (
    <main id="main">
      <PageHero id="articles-heading" eyebrow="Local stories and resources" title="The Latest from Star Valley" intro={DESC}>
        <form action="/articles" method="get" role="search" aria-label="Search articles" className="flex max-w-xl gap-2 rounded-card bg-surface-card p-2 shadow-card">
          {p.category && <input type="hidden" name="category" value={p.category} />}
          <label htmlFor="ar-q" className="sr-only">Search articles</label>
          <input id="ar-q" name="q" type="search" defaultValue={p.q} placeholder="Search articles…" autoComplete="off" className="min-w-0 flex-1 rounded-button bg-transparent px-3 py-2 text-text" />
          <button type="submit" className="rounded-button bg-brand px-5 py-2.5 font-semibold text-brand-contrast hover:bg-brand-hover">Search</button>
        </form>
      </PageHero>
      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-8 sm:px-8">
        <ChipNav label="Article categories" items={[{ href: articlesUrl({ q: p.q }), label: "All articles", count: all, active: !p.category }, ...cats.map((c) => ({ href: articlesUrl({ category: c.slug, q: p.q }), label: c.name, count: counts.find((x) => x.category_id === c.id)?.n ?? 0, active: p.category === c.slug })).filter((c) => c.count > 0 || c.active)]} />
        {hero && (
          <section aria-labelledby="featured-article" className="mb-10">
            <h2 id="featured-article" className="mb-4 font-heading text-2xl font-bold">Featured article</h2>
            <article className="grid overflow-hidden rounded-card bg-surface-card shadow-card md:grid-cols-2">
              <div className="relative aspect-[16/9] bg-surface-muted md:aspect-auto md:min-h-64">{hero.image && <Image src={hero.image.url} alt={hero.image.alt} fill sizes="(min-width: 768px) 50vw, 100vw" priority className="object-cover" />}</div>
              <div className="flex flex-col gap-3 p-6">
                <p className="text-sm text-text-muted">{hero.categoryName && <span className="font-semibold">{hero.categoryName} · </span>}<time dateTime={hero.date}>{hero.dateText}</time></p>
                <h3 className="font-heading text-3xl font-bold leading-tight [overflow-wrap:anywhere]"><Link href={`/articles/${hero.slug}`} className="text-text hover:underline underline-offset-4">{hero.title}</Link></h3>
                {hero.excerpt && <p className="text-lg text-text-body [overflow-wrap:anywhere]">{hero.excerpt}</p>}
                <p className="mt-auto text-sm text-text-muted">{[hero.authorName && `By ${hero.authorName}`, hero.readText].filter(Boolean).join(" · ")}</p>
              </div>
            </article>
          </section>
        )}
        <section aria-labelledby="latest-articles">
          <h2 id="latest-articles" className="mb-4 font-heading text-2xl font-bold">{p.q ? `Results for "${p.q}"` : cat ? cat.name : "Latest articles"}</h2>
          <p role="status" className="sr-only">{list.total} articles</p>
          {cards.length > 0 ? <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{cards.map((a, i) => <ArticleTile key={a.slug} a={a} priority={i < 3 && !hero} />)}</ul> : (
            <div className="rounded-card bg-surface-muted p-8 text-center"><p className="font-heading text-xl font-bold">No articles found</p><p className="mt-2 text-text-muted"><Link href="/articles" className="font-semibold underline underline-offset-4">See all articles</Link></p></div>
          )}
          <Pagination current={Math.min(p.page, totalPages)} totalPages={totalPages} hrefFor={(n) => articlesUrl({ ...p, page: n })} />
        </section>
      </div>
    </main>
  );
}
