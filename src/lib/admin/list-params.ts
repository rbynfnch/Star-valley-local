// Parse the admin business-list URL into validated filters. Anything unrecognised is dropped, never passed on.
export const STATUSES = ["prospect", "unclaimed", "claimed", "archived"] as const;
export const TIERS = ["free", "enhanced"] as const;
export const STAGES = ["new", "contacted", "interested", "proposal", "client", "lost"] as const;
export const PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ListFilters {
  q: string | null;
  status: (typeof STATUSES)[number] | null;
  community: string | null;
  category: string | null;
  tier: (typeof TIERS)[number] | null;
  stage: (typeof STAGES)[number] | null;
  verified: boolean | null;
  page: number;
}
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const oneOf = <T extends string>(list: readonly T[], v: string | undefined): T | null => (list as readonly string[]).includes(v ?? "") ? (v as T) : null;

export function parseListParams(sp: Raw): ListFilters {
  const q = (one(sp.q) ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 100);
  const uuid = (v: string | undefined) => (v && UUID.test(v) ? v.toLowerCase() : null);
  const verified = one(sp.verified);
  const pageN = Number.parseInt(one(sp.page) ?? "1", 10);
  return {
    q: q || null,
    status: oneOf(STATUSES, one(sp.status)),
    community: uuid(one(sp.community)),
    category: uuid(one(sp.category)),
    tier: oneOf(TIERS, one(sp.tier)),
    stage: oneOf(STAGES, one(sp.stage)),
    verified: verified === "yes" ? true : verified === "no" ? false : null,
    page: Number.isFinite(pageN) && pageN >= 1 ? Math.min(pageN, 10000) : 1,
  };
}

/** RPC arguments for admin_list_businesses. */
export const toRpcArgs = (tenantId: string, f: ListFilters) => ({
  p_tenant: tenantId, p_q: f.q, p_status: f.status ? [f.status] : null, p_community: f.community, p_category: f.category,
  p_tier: f.tier, p_stage: f.stage, p_verified: f.verified, p_limit: PAGE_SIZE, p_offset: (f.page - 1) * PAGE_SIZE,
});

/** Query string for a set of filters (defaults omitted), optionally overriding the page. */
export function toQuery(f: ListFilters, page = f.page): string {
  const u = new URLSearchParams();
  if (f.q) u.set("q", f.q);
  if (f.status) u.set("status", f.status);
  if (f.community) u.set("community", f.community);
  if (f.category) u.set("category", f.category);
  if (f.tier) u.set("tier", f.tier);
  if (f.stage) u.set("stage", f.stage);
  if (f.verified !== null) u.set("verified", f.verified ? "yes" : "no");
  if (page > 1) u.set("page", String(page));
  const s = u.toString();
  return s ? `?${s}` : "";
}
