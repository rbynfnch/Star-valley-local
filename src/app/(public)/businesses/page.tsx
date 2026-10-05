import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SearchIcon } from "@/components/icons";
import { ActiveFilters } from "@/components/directory/ActiveFilters";
import { BusinessCard } from "@/components/directory/BusinessCard";
import { TrackEvents } from "@/components/tracking/Tracker";
import { categoryStyle } from "@/components/directory/CategoryTile";
import { FilterForm, FORM_ID } from "@/components/directory/FilterForm";
import { FiltersDisclosure } from "@/components/directory/FiltersDisclosure";
import { Pagination } from "@/components/directory/Pagination";
import { getDirectoryData } from "@/lib/directory/data";
import { toBusinessCard, topLevelCategories } from "@/lib/directory/home";
import { buildBusinessesUrl, expandCategoryIds, hasActiveFilters, pageSize, parseSearchParams } from "@/lib/directory/search-params";
import { getTenant } from "@/lib/tenant/resolve";

export async function generateMetadata(props: PageProps<"/businesses">): Promise<Metadata> {
  const f = parseSearchParams(await props.searchParams);
  const filtered = hasActiveFilters(f);
  return {
    title: f.q ? `Search results for "${f.q}"` : "Business Directory",
    description: "Find trusted local businesses: browse by category and community, or search.",
    // Faceted and search URLs are not for search engines: the category and community pages are the ones meant to rank.
    // Plain pagination of the directory itself stays indexable, each page canonical to itself.
    robots: filtered ? { index: false, follow: true } : undefined,
    alternates: { canonical: filtered ? "/businesses" : buildBusinessesUrl(f) },
  };
}

export default async function Businesses(props: PageProps<"/businesses">) {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const filters = parseSearchParams(await props.searchParams);
  const data = getDirectoryData();
  const [region, categories, communities] = await Promise.all([data.regionName(tenant.id), data.categories(tenant.id), data.communities(tenant.id)]);

  // Unknown slugs in the URL are ignored (they simply select nothing). Subcategories ride along with their parent.
  const communityIds = communities.filter((c) => filters.communities.includes(c.slug)).map((c) => c.id);
  const categoryIds = expandCategoryIds(filters.categories, categories);
  const query = {
    q: filters.q, communityIds, categoryIds, verified: filters.verified, featured: filters.featured, deals: filters.deals,
    quotes: filters.quotes, price: filters.price, sort: filters.sort, limit: pageSize(), offset: (filters.page - 1) * pageSize(),
  };
  // NOTE: logging search appearances (CLAUDE.md §9) arrives with event tracking (slice 5).
  const { rows, total } = await data.searchBusinesses(tenant.id, query);
  if (rows.length === 0 && filters.page > 1) {
    // A stale or hand-edited page number: send them to the last real page (or the first, if there is nothing).
    const count = (await data.searchBusinesses(tenant.id, { ...query, limit: 1, offset: 0 })).total;
    redirect(buildBusinessesUrl(filters, { page: count > 0 ? Math.ceil(count / pageSize()) : 1 }));
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize()));
  const tops = topLevelCategories(categories);
  const first = (filters.page - 1) * pageSize() + 1;

  return (
    <main id="main">
      <form id={FORM_ID} action="/businesses" method="get" role="search" aria-label="Business directory search" />

      <section aria-labelledby="dir-heading" className="bg-[linear-gradient(115deg,var(--navy)_0%,var(--navy)_55%,var(--valley-blue)_100%)] text-text-on-inverse">
        <div className="mx-auto w-full max-w-[var(--container-max)] space-y-4 px-4 py-10 sm:px-8">
          <h1 id="dir-heading" className="font-heading text-4xl font-bold text-text-on-inverse">Business Directory</h1>
          <p className="max-w-xl text-lg text-text-on-inverse">Find trusted local businesses{region ? ` in ${region}` : ""}.</p>
          <div className="flex max-w-2xl gap-2 rounded-card bg-surface-card p-2 shadow-card">
            <label htmlFor="dir-q" className="sr-only">Search businesses, services, or categories</label>
            <input id="dir-q" form={FORM_ID} name="q" type="search" defaultValue={filters.q} placeholder="Search businesses, services, or categories…" autoComplete="off" className="min-w-0 flex-1 rounded-button bg-transparent px-3 py-2.5 text-text placeholder:text-text-muted" />
            <button type="submit" form={FORM_ID} className="flex items-center gap-2 rounded-button bg-brand px-5 py-2.5 font-semibold text-brand-contrast hover:bg-brand-hover"><SearchIcon /><span className="sr-only sm:not-sr-only">Search</span></button>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 pt-8 sm:px-8">
        {tops.length > 0 && (
          <nav aria-label="Browse by category" className="mb-8">
            <ul className="flex flex-wrap gap-2">
              {tops.map((c) => <li key={c.id}><Link href={`/categories/${c.slug}`} style={categoryStyle(c.color_token)} className="inline-block rounded-pill px-4 py-1.5 text-sm font-semibold">{c.name}</Link></li>)}
            </ul>
          </nav>
        )}

        <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
          <aside aria-label="Filters">
            <FiltersDisclosure summary={<>Filters{hasActiveFilters(filters) ? " (active)" : ""}</>}>
              <h2 className="mb-4 hidden font-heading text-xl font-bold lg:block">Filter results</h2>
              <FilterForm filters={filters} communities={communities} categories={tops} />
            </FiltersDisclosure>
          </aside>

          <section aria-labelledby="results-heading">
            <h2 id="results-heading" className="sr-only">Results</h2>
            <p role="status" aria-live="polite" className="mb-4 text-lg font-semibold text-text">
              {total === 0 ? "No businesses found" : total === 1 ? "1 business found" : `${total.toLocaleString("en-US")} businesses found`}
              {total > pageSize() && <span className="ml-2 text-base font-normal text-text-muted">Showing {first}–{first + rows.length - 1}</span>}
            </p>
            <ActiveFilters filters={filters} communities={communities} categories={categories} />

            {rows.length > 0 && <TrackEvents events={rows.slice(0, 24).map((r) => ({ type: "search_appearance", business_id: r.id, surface: "search", ...(filters.q ? { query: filters.q } : {}) }))} />}
            {rows.length > 0 ? (
              <ul className="grid gap-4">
                {rows.map((r) => <BusinessCard key={r.id} b={toBusinessCard(r, communities, categories)} featured={r.live_placement} />)}
              </ul>
            ) : (
              <div className="rounded-card bg-surface-muted p-8 text-center">
                <h3 className="font-heading text-xl font-bold">We couldn&apos;t find a match</h3>
                <p className="mx-auto mt-2 max-w-md text-text-muted">Try a different word, fewer filters, or another community.</p>
                <p className="mt-4 flex flex-wrap justify-center gap-4">
                  {hasActiveFilters(filters) && <Link href="/businesses" className="font-semibold underline underline-offset-4">Clear all filters</Link>}
                  <Link href="/list-your-business" className="font-semibold underline underline-offset-4">Suggest a business</Link>
                </p>
              </div>
            )}
            <Pagination current={filters.page} totalPages={totalPages} hrefFor={(p) => buildBusinessesUrl(filters, { page: p })} />
          </section>
        </div>
      </div>
    </main>
  );
}
