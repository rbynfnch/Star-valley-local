import { cache } from "react";
import { getDirectoryData } from "./data.ts";
import { countFor, type HubKind } from "./hub.ts";
import { rotateFeatured } from "./rotation.ts";
import { expandCategoryIds, pageSize } from "./search-params.ts";
import type { Category, Community, CountRow, SearchRow, Tenant } from "./types.ts";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type Hub = {
  kind: HubKind; category?: Category; community?: Community; region: string | null;
  categories: Category[]; communities: Community[]; counts: CountRow[];
  count: number; featured: SearchRow[]; rows: SearchRow[]; page: number; totalPages: number;
};

/**
 * Everything a hub page needs, or null when the page must not exist (unknown slug, or a category x community pair with
 * no businesses: those would be thin, empty pages). Memoised per request so generateMetadata and the page share one load.
 */
export const loadHub = cache(async (tenant: Tenant, kind: HubKind, categorySlug: string | null, communitySlug: string | null, page: number): Promise<Hub | null> => {
  if ((categorySlug !== null && !SLUG.test(categorySlug)) || (communitySlug !== null && !SLUG.test(communitySlug))) return null;
  const data = getDirectoryData();
  const [region, categories, communities, counts] = await Promise.all([data.regionName(tenant.id), data.categories(tenant.id), data.communities(tenant.id), data.counts(tenant.id)]);
  const category = categorySlug ? categories.find((c) => c.slug === categorySlug) : undefined;
  const community = communitySlug ? communities.find((c) => c.slug === communitySlug) : undefined;
  if ((categorySlug && !category) || (communitySlug && !community)) return null;

  const count = countFor(counts, category?.id ?? null, community?.id ?? null);
  if (kind === "combo" && count === 0) return null;

  const categoryIds = category ? expandCategoryIds([category.slug], categories) : [];
  const base = { q: "", communityIds: community ? [community.id] : [], categoryIds, verified: false, featured: false, deals: false, quotes: false, price: [], sort: "name" as const };

  // Featured strip: a category hub shows the category slot, a community hub the community slot, and a combination hub the
  // category slot restricted (in the database) to businesses that serve that community.
  const slot = kind === "community" ? "community" : "category";
  const scope = kind === "community" ? [community!.id] : categoryIds;
  const placed = await data.livePlacements(tenant.id, slot, scope);
  let featured: SearchRow[] = [];
  if (placed.length > 0) {
    // `ids` is always an explicit list here: an empty list would mean "nothing", while omitting it means "everything".
    featured = (await data.searchBusinesses(tenant.id, { ...base, ids: placed, limit: 50, offset: 0 })).rows;
    featured = rotateFeatured(featured, featured.length, `${tenant.id}:${slot}:${(category ?? community)!.id}`, new Date());
  }

  // `count` comes from directory_counts (a test proves it equals what the search returns), so it stays correct even when
  // `page` is past the end and the page of rows is empty.
  const { rows } = await data.searchBusinesses(tenant.id, { ...base, limit: pageSize(), offset: (page - 1) * pageSize() });
  return { kind, category, community, region, categories, communities, counts, count, featured, rows, page, totalPages: Math.max(1, Math.ceil(count / pageSize())) };
});
