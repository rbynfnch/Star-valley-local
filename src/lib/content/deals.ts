import { dealBadge } from "../directory/profile.ts";
import { validThroughDay } from "../format.ts";
import type { BusinessRow, Category, Community, DealRow } from "../directory/types.ts";

// The /deals page. The database has already limited the rows to deals that are live now, belong to a public business and are Enhanced;
// this only filters, orders and labels them.
export const DEALS_PER_PAGE = 12;
export interface DealParams { category: string | null; community: string | null; page: number }
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function parseDealParams(raw: Raw): DealParams {
  const c = one(raw.category), m = one(raw.community), p = Number(one(raw.page));
  return { category: c && SLUG.test(c) && c.length <= 80 ? c : null, community: m && SLUG.test(m) && m.length <= 80 ? m : null, page: Number.isInteger(p) && p >= 1 && p <= 1000 ? p : 1 };
}
export function dealsUrl(p: Partial<DealParams>): string {
  const sp = new URLSearchParams();
  if (p.category) sp.set("category", p.category);
  if (p.community) sp.set("community", p.community);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const s = sp.toString();
  return s ? `/deals?${s}` : "/deals";
}

export interface DealCard {
  id: string; title: string; description: string | null; terms: string | null; badge: string | null;
  businessName: string; businessSlug: string; businessId: string; communityName: string | null; categoryName: string | null; validText: string; endsSoon: boolean;
}
export interface DealTab { slug: string | null; name: string; count: number }

export function buildDealCards(deals: DealRow[], businesses: BusinessRow[], communities: Community[], categories: Category[], p: DealParams, now: Date, tz: string) {
  const byId = new Map(businesses.map((b) => [b.id, b]));
  const top = (id: string | null) => { const c = categories.find((x) => x.id === id); return c ? (c.parent_id ? categories.find((x) => x.id === c.parent_id) ?? c : c) : null; };
  const rows = deals.filter((d) => byId.has(d.business_id) && (!d.ends_at || new Date(d.ends_at).getTime() > now.getTime()));
  const topCats = categories.filter((c) => c.parent_id === null).sort((a, b) => a.sort_order - b.sort_order);
  const tabs: DealTab[] = [{ slug: null, name: "All deals", count: rows.length }, ...topCats.map((c) => ({ slug: c.slug, name: c.name, count: rows.filter((d) => top(byId.get(d.business_id)!.primary_category_id)?.id === c.id).length })).filter((t) => t.count > 0)];
  const comm = p.community ? communities.find((c) => c.slug === p.community) : null;
  const cat = p.category ? topCats.find((c) => c.slug === p.category) : null;
  const wanted = (p.category && !cat) || (p.community && !comm) ? [] : rows.filter((d) => {
    const b = byId.get(d.business_id)!;
    return (!cat || top(b.primary_category_id)?.id === cat.id) && (!comm || b.home_community_id === comm.id);
  });
  wanted.sort((a, b) => (a.ends_at ?? "9999").localeCompare(b.ends_at ?? "9999") || a.title.localeCompare(b.title));
  const totalPages = Math.max(1, Math.ceil(wanted.length / DEALS_PER_PAGE));
  const page = Math.min(p.page, totalPages);
  const cards: DealCard[] = wanted.slice((page - 1) * DEALS_PER_PAGE, page * DEALS_PER_PAGE).map((d) => {
    const b = byId.get(d.business_id)!;
    return {
      id: d.id, title: d.title, description: d.description, terms: d.terms, badge: dealBadge(d.discount_type, d.discount_value),
      businessName: b.name, businessSlug: b.slug, businessId: b.id, communityName: communities.find((c) => c.id === b.home_community_id)?.name ?? null,
      categoryName: categories.find((c) => c.id === b.primary_category_id)?.name ?? null,
      validText: d.ends_at ? `Valid through ${validThroughDay(d.ends_at, tz)}` : "Ongoing", endsSoon: !!d.ends_at && new Date(d.ends_at).getTime() - now.getTime() <= 7 * 86400_000,
    };
  });
  return { cards, total: wanted.length, page, totalPages, tabs };
}
