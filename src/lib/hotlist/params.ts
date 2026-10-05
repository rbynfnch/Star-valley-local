import { isCategory, type HotlistCategory } from "./model.ts";

// Filters for /hotlist. Everything is validated; unknown values fall back to "all" so a stale link still shows the Hotlist.
export const SORTS = [{ value: "newest", label: "Newest" }, { value: "ending", label: "Ending soon" }, { value: "popular", label: "Most popular" }] as const;
export type HotlistSort = (typeof SORTS)[number]["value"];
export const PRICE_STEPS = [{ value: 1500, label: "Under $15" }, { value: 2500, label: "Under $25" }, { value: 5000, label: "Under $50" }, { value: 10000, label: "Under $100" }] as const;
export const PER_PAGE = 12;

export interface HotlistParams { kind: "deal" | "pick" | null; category: HotlistCategory | null; q: string; town: string | null; maxPrice: number | null; sort: HotlistSort; page: number }
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseHotlistParams(raw: Raw): HotlistParams {
  const view = one(raw.view), cat = one(raw.category), town = one(raw.town), price = Number(one(raw.price)), sort = one(raw.sort), page = Number(one(raw.page));
  const q = (one(raw.q) ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 100);
  return {
    kind: view === "deals" ? "deal" : view === "picks" ? "pick" : null,
    category: isCategory(cat) ? cat : null,
    q, town: town && SLUG.test(town) && town.length <= 80 ? town : null,
    maxPrice: PRICE_STEPS.some((p) => p.value === price) ? price : null,
    sort: SORTS.some((s) => s.value === sort) ? (sort as HotlistSort) : "newest",
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

/** True when any filter narrows the list: the page then shows results instead of the curated landing. */
export const isFiltered = (p: HotlistParams): boolean => !!(p.kind || p.category || p.q || p.town || p.maxPrice !== null || p.sort !== "newest" || p.page > 1);

export function hotlistUrl(p: Partial<HotlistParams>): string {
  const sp = new URLSearchParams();
  if (p.kind) sp.set("view", p.kind === "deal" ? "deals" : "picks");
  if (p.category) sp.set("category", p.category);
  if (p.q) sp.set("q", p.q);
  if (p.town) sp.set("town", p.town);
  if (p.maxPrice) sp.set("price", String(p.maxPrice));
  if (p.sort && p.sort !== "newest") sp.set("sort", p.sort);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const s = sp.toString();
  return s ? `/hotlist?${s}` : "/hotlist";
}
