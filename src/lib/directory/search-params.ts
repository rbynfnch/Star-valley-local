// URL <-> search filters for /businesses. Everything from the query string is untrusted: each value is validated and
// anything unrecognised is dropped, so the page can never be driven into an unexpected state by a crafted URL.

export const PAGE_SIZE = 12;
export const MAX_PAGE = 500;
export const SORTS = ["relevance", "name"] as const;
export type Sort = (typeof SORTS)[number];
export const PRICE_LEVELS = [0, 1, 2, 3] as const;

export type SearchFilters = {
  q: string;
  communities: string[];   // slugs
  categories: string[];    // slugs
  verified: boolean;
  featured: boolean;
  deals: boolean;
  quotes: boolean;
  price: number[];
  sort: Sort;
  page: number;
};

export const DEFAULT_FILTERS: SearchFilters = { q: "", communities: [], categories: [], verified: false, featured: false, deals: false, quotes: false, price: [], sort: "relevance", page: 1 };

type Raw = Record<string, string | string[] | undefined>;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const many = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const flag = (v: string | string[] | undefined) => ["1", "true", "on"].includes(one(v) ?? "");
const slugs = (v: string | string[] | undefined) => [...new Set(many(v).filter((s) => typeof s === "string" && s.length <= 60 && SLUG.test(s)))].slice(0, 20);

export function parseSearchParams(raw: Raw): SearchFilters {
  const own = (k: string) => (Object.prototype.hasOwnProperty.call(raw, k) ? raw[k] : undefined);   // never read inherited keys
  const q = (one(own("q")) ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  const price = [...new Set(many(own("price")).map((p) => (/^[0-3]$/.test(p) ? Number(p) : NaN)).filter((n) => !Number.isNaN(n)))].sort();
  const sort = (one(own("sort")) as Sort | undefined) === "name" ? "name" : "relevance";
  const pageNum = Number(one(own("page")));
  const page = Number.isInteger(pageNum) && pageNum >= 1 ? Math.min(pageNum, MAX_PAGE) : 1;
  return {
    q, communities: slugs(own("community")), categories: slugs(own("category")),
    verified: flag(own("verified")), featured: flag(own("featured")), deals: flag(own("deals")), quotes: flag(own("quotes")),
    price, sort, page,
  };
}

/** Canonical query string: fixed key order, defaults omitted, so one set of filters is exactly one URL. */
export function toQueryString(f: SearchFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  for (const c of [...f.communities].sort()) p.append("community", c);
  for (const c of [...f.categories].sort()) p.append("category", c);
  if (f.verified) p.set("verified", "1");
  if (f.featured) p.set("featured", "1");
  if (f.deals) p.set("deals", "1");
  if (f.quotes) p.set("quotes", "1");
  for (const n of [...f.price].sort()) p.append("price", String(n));
  if (f.sort !== "relevance") p.set("sort", f.sort);
  if (f.page > 1) p.set("page", String(f.page));
  return p.toString();
}

export function buildBusinessesUrl(f: SearchFilters, overrides: Partial<SearchFilters> = {}): string {
  const qs = toQueryString({ ...f, ...overrides });
  return qs ? `/businesses?${qs}` : "/businesses";
}

/** Any filter or text at all (page and sort alone do not count). Faceted URLs are noindex; the bare directory is not. */
export function hasActiveFilters(f: SearchFilters): boolean {
  return !!f.q || f.communities.length > 0 || f.categories.length > 0 || f.verified || f.featured || f.deals || f.quotes || f.price.length > 0;
}

/** Page numbers to show: 1 … 4 5 [6] 7 8 … 20 */
export function pageWindow(current: number, totalPages: number, around = 2): (number | "gap")[] {
  if (totalPages <= 1) return [];
  const pages = new Set<number>([1, totalPages]);
  for (let i = current - around; i <= current + around; i++) if (i >= 1 && i <= totalPages) pages.add(i);
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((n, i) => { if (i > 0 && n - sorted[i - 1] > 1) out.push("gap"); out.push(n); });
  return out;
}

/** A category slug selects itself and its subcategories (the directory has two levels). */
export function expandCategoryIds(selected: string[], categories: { id: string; slug: string; parent_id: string | null }[]): string[] {
  const ids = new Set<string>();
  for (const s of selected) {
    const c = categories.find((x) => x.slug === s);
    if (!c) continue;
    ids.add(c.id);
    for (const child of categories) if (child.parent_id === c.id) ids.add(child.id);
  }
  return [...ids];
}
