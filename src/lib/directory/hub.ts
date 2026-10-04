// The SEO hub pages: /categories/[c], /communities/[c], /categories/[c]/[community].
// Pure functions (tested): titles, counts, related links, breadcrumbs. A hub exists only if it has businesses.
import type { Category, Community, CountRow } from "./types.ts";

/**
 * A hub page is only INDEXED (and listed in the sitemap) if it has at least this many listings. Below that it still
 * works for visitors but is `noindex`. Reason: one business that serves the whole valley would otherwise appear on ten
 * near-identical "Plumbers in <town>" pages, which search engines treat as doorway pages and penalise the whole site.
 */
export const MIN_INDEXABLE_LISTINGS = 2;
export const isIndexable = (listings: number) => listings >= MIN_INDEXABLE_LISTINGS;

export const plural = (c: Category) => c.plural_name?.trim() || c.name;

/** Businesses under (category, community); null = all. 0 means the page must not exist. */
export function countFor(counts: CountRow[], categoryId: string | null, communityId: string | null): number {
  return counts.find((r) => r.category_id === categoryId && r.community_id === communityId)?.n ?? 0;
}

export type HubKind = "category" | "community" | "combo";
export type HubText = { h1: string; title: string; description: string };

/** "Plumbers in Thayne, WY" / "Plumbers in Star Valley" / "Local businesses in Thayne, WY". */
export function hubText(o: { category?: Category; community?: Community; region: string | null; count: number }): HubText {
  const { category, community, count } = o;
  const area = community ? `${community.name}, ${community.state}` : (o.region ?? "our area");
  const what = category ? plural(category) : "Local businesses";
  const h1 = `${what} in ${area}`;
  const listings = `${count} local ${count === 1 ? "listing" : "listings"}`;
  const description = category
    ? `${h1}: ${listings} with phone numbers, websites and directions.`
    : `${h1}: browse ${listings} by category, with phone numbers, websites and directions.`;
  return { h1, title: h1, description };
}

export type Crumb = { name: string; path: string };

export function breadcrumbs(o: { category?: Category; categories: Category[]; community?: Community; tenantName: string }): Crumb[] {
  const out: Crumb[] = [{ name: "Home", path: "/" }, { name: "Businesses", path: "/businesses" }];
  const { category, community } = o;
  if (category) {
    const parent = category.parent_id ? o.categories.find((c) => c.id === category.parent_id) : undefined;
    if (parent) out.push({ name: plural(parent), path: `/categories/${parent.slug}` });
    out.push({ name: plural(category), path: `/categories/${category.slug}` });
    if (community) out.push({ name: community.name, path: `/categories/${category.slug}/${community.slug}` });
  } else if (community) {
    out.push({ name: community.name, path: `/communities/${community.slug}` });
  }
  return out;
}

export type RelatedLink = { label: string; href: string; n: number };

/** Internal links to OTHER hubs, only to ones that exist (n >= 1), in the tenant's own display order. */
export function relatedLinks(o: { kind: HubKind; category?: Category; community?: Community; categories: Category[]; communities: Community[]; counts: CountRow[] }): { heading: string; links: RelatedLink[] }[] {
  const { kind, category, community, categories, communities, counts } = o;
  const byOrder = <T extends { sort_order: number; name: string }>(a: T[]) => [...a].sort((x, y) => x.sort_order - y.sort_order || x.name.localeCompare(y.name));
  const sections: { heading: string; links: RelatedLink[] }[] = [];

  if (kind === "category" && category) {
    const kids = byOrder(categories.filter((c) => c.parent_id === category.id));
    const subs = kids.map((k) => ({ label: plural(k), href: `/categories/${k.slug}`, n: countFor(counts, k.id, null) })).filter((l) => l.n > 0);
    if (subs.length) sections.push({ heading: `Types of ${category.name.toLowerCase()}`, links: subs });
    const places = byOrder(communities).map((m) => ({ label: `${plural(category)} in ${m.name}`, href: `/categories/${category.slug}/${m.slug}`, n: countFor(counts, category.id, m.id) })).filter((l) => l.n > 0);
    if (places.length) sections.push({ heading: `${plural(category)} by community`, links: places });
  }
  if (kind === "community" && community) {
    const tops = byOrder(categories.filter((c) => c.parent_id === null));
    const cats = tops.map((c) => ({ label: `${plural(c)} in ${community.name}`, href: `/categories/${c.slug}/${community.slug}`, n: countFor(counts, c.id, community.id) })).filter((l) => l.n > 0);
    if (cats.length) sections.push({ heading: `Browse ${community.name} by category`, links: cats });
    const others = byOrder(communities).filter((m) => m.id !== community.id).map((m) => ({ label: m.name, href: `/communities/${m.slug}`, n: countFor(counts, null, m.id) })).filter((l) => l.n > 0);
    if (others.length) sections.push({ heading: "Other communities", links: others });
  }
  if (kind === "combo" && category && community) {
    const sameCat = byOrder(communities).filter((m) => m.id !== community.id).map((m) => ({ label: `${plural(category)} in ${m.name}`, href: `/categories/${category.slug}/${m.slug}`, n: countFor(counts, category.id, m.id) })).filter((l) => l.n > 0);
    if (sameCat.length) sections.push({ heading: `${plural(category)} in other communities`, links: sameCat });
    const sameComm = byOrder(categories.filter((c) => c.parent_id === null && c.id !== category.id && c.id !== category.parent_id)).map((c) => ({ label: `${plural(c)} in ${community.name}`, href: `/categories/${c.slug}/${community.slug}`, n: countFor(counts, c.id, community.id) })).filter((l) => l.n > 0);
    if (sameComm.length) sections.push({ heading: `More in ${community.name}`, links: sameComm });
  }
  return sections;
}

/** schema.org BreadcrumbList. */
export function breadcrumbJsonLd(origin: string, crumbs: Crumb[]) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.path}` })) };
}

/** schema.org ItemList of the businesses on the page (URLs only: the profile page carries the LocalBusiness data). */
export function itemListJsonLd(origin: string, name: string, items: { slug: string; name: string }[], startAt = 1) {
  return { "@context": "https://schema.org", "@type": "ItemList", name,
    itemListElement: items.map((b, i) => ({ "@type": "ListItem", position: startAt + i, name: b.name, url: `${origin}/business/${b.slug}` })) };
}
