import Link from "next/link";
import { BusinessCard } from "@/components/directory/BusinessCard";
import { TrackEvents } from "@/components/tracking/Tracker";
import { Pagination } from "@/components/directory/Pagination";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { breadcrumbJsonLd, breadcrumbs, hubText, itemListJsonLd, plural, relatedLinks } from "@/lib/directory/hub";
import type { Hub } from "@/lib/directory/hub-data";
import { toBusinessCard } from "@/lib/directory/home";
import { pageSize } from "@/lib/directory/search-params";
import { jsonLdString } from "@/lib/seo/jsonld";

export function hubPath(h: Pick<Hub, "kind" | "category" | "community">): string {
  if (h.kind === "combo") return `/categories/${h.category!.slug}/${h.community!.slug}`;
  return h.kind === "category" ? `/categories/${h.category!.slug}` : `/communities/${h.community!.slug}`;
}
export const hubPageUrl = (h: Pick<Hub, "kind" | "category" | "community">, page: number) => (page > 1 ? `${hubPath(h)}?page=${page}` : hubPath(h));

export function HubPage({ hub, tenantName, origin }: { hub: Hub; tenantName: string; origin: string | null }) {
  const { category, community, categories, communities, counts, featured, rows, page, totalPages } = hub;
  const text = hubText({ category, community, region: hub.region, count: hub.count });
  const crumbs = breadcrumbs({ category, categories, community, tenantName });
  const related = relatedLinks({ kind: hub.kind, category, community, categories, communities, counts });
  const what = category ? plural(category) : "businesses";
  const first = (page - 1) * pageSize() + 1;

  const surface = category && community ? "category_community" : category ? "category" : "community";
  const seen = [...(page === 1 ? featured : []), ...rows].filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i).slice(0, 24);

  return (
    <main id="main">
      {seen.length > 0 && <TrackEvents events={seen.map((r) => ({ type: "search_appearance", business_id: r.id, surface, ...(category ? { category_id: category.id } : {}), ...(community ? { community_id: community.id } : {}) }))} />}
      {origin && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString([
          breadcrumbJsonLd(origin, crumbs),
          ...(rows.length ? [itemListJsonLd(origin, text.h1, rows, first)] : []),
        ]) }} />
      )}
      <section aria-labelledby="hub-heading" className="bg-[linear-gradient(115deg,var(--navy)_0%,var(--navy)_55%,var(--valley-blue)_100%)] text-text-on-inverse">
        <div className="mx-auto w-full max-w-[var(--container-max)] space-y-4 px-4 py-10 sm:px-8">
          <Breadcrumbs crumbs={crumbs} />
          <h1 id="hub-heading" className="font-heading text-4xl font-bold text-text-on-inverse">{text.h1}</h1>
          <p className="max-w-2xl text-lg text-text-on-inverse">{text.description}</p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[var(--container-max)] space-y-12 px-4 pt-10 sm:px-8">
        {featured.length > 0 && page === 1 && (   // the strip is advertising: show it once, not on every page of the list
          <section aria-labelledby="featured-heading">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="featured-heading" className="text-2xl font-bold">Featured {category ? what : "businesses"}</h2>
              <p className="text-sm text-text-muted">Featured listings are paid placements.</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((r) => <BusinessCard key={r.id} b={toBusinessCard(r, communities, categories)} featured />)}
            </ul>
          </section>
        )}

        <section aria-labelledby="all-heading">
          <h2 id="all-heading" className="mb-1 text-2xl font-bold">All {what}{community ? ` in ${community.name}` : ""}</h2>
          <p role="status" className="mb-4 text-text-muted">
            {hub.count === 0 ? "No listings yet" : hub.count === 1 ? "1 listing" : `${hub.count} listings`}
            {hub.count > pageSize() && ` · showing ${first}–${first + rows.length - 1}`}
          </p>
          {rows.length > 0 ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {rows.map((r) => <BusinessCard key={r.id} b={toBusinessCard(r, communities, categories)} featured={r.live_placement} />)}
            </ul>
          ) : (
            <div className="rounded-card bg-surface-muted p-8 text-center">
              <p className="font-heading text-xl font-bold">No listings here yet</p>
              <p className="mt-2 text-text-muted">Know a local business that belongs? <Link href="/list-your-business" className="font-semibold underline underline-offset-4">Suggest it</Link>.</p>
            </div>
          )}
          <Pagination current={page} totalPages={totalPages} hrefFor={(p) => hubPageUrl(hub, p)} />
        </section>

        {related.map((sec) => (
          <section key={sec.heading} aria-labelledby={`rel-${sec.heading.replace(/\W+/g, "-").toLowerCase()}`}>
            <h2 id={`rel-${sec.heading.replace(/\W+/g, "-").toLowerCase()}`} className="mb-3 text-xl font-bold">{sec.heading}</h2>
            <ul className="flex flex-wrap gap-2">
              {sec.links.map((l) => (
                <li key={l.href}><Link href={l.href} className="inline-block rounded-pill bg-surface-muted px-4 py-1.5 text-sm font-semibold text-text hover:bg-border">{l.label} <span className="font-normal text-text-muted">({l.n})</span></Link></li>
              ))}
            </ul>
          </section>
        ))}

        <p className="rounded-card bg-surface-muted p-6 text-center text-text-body">
          Don&apos;t see your business on {tenantName}? <Link href="/list-your-business" className="font-semibold underline underline-offset-4">List it for free</Link>.
        </p>
      </div>
    </main>
  );
}
