import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { psqlJson } from "./psql.ts";
import { splitSearchRows } from "./search-rows.ts";
import type { BusinessRow, Category, Community, CountRow, DirectoryData, EventRow, ProfileRaw, SearchQuery, SearchResult, SearchRow, Tenant } from "./types.ts";

// DEVELOPMENT/TEST ONLY. Serves a snapshot exported from a seeded local database AS THE ANONYMOUS ROLE
// (`npm run fixtures`), so it shows exactly what the public could read. Never used in production (data.ts refuses).
type Snapshot = {
  tenants: (Tenant & { is_active: boolean })[]; tenant_domains: { domain: string; tenant_id: string }[];
  regions: { tenant_id: string; name: string; sort_order: number }[];
  categories: (Category & { tenant_id: string; is_active: boolean })[]; communities: (Community & { tenant_id: string; is_active: boolean })[];
  community_events: (EventRow & { tenant_id: string; status: string })[];
  public_placements: { tenant_id: string; business_id: string; slot_type: string; category_id: string | null; community_id: string | null }[];
  businesses: (BusinessRow & { tenant_id: string; status: string })[];
};

export function fixturesDirectory(path = join(process.cwd(), ".fixtures", "directory.json")): DirectoryData {
  if (!existsSync(path)) throw new Error(`No fixtures at ${path}. Seed a local database and run: npm run fixtures`);
  const s = JSON.parse(readFileSync(path, "utf8")) as Snapshot;
  const missing = ["tenants", "tenant_domains", "regions", "categories", "communities", "community_events", "public_placements", "businesses"].filter((k) => !Array.isArray((s as Record<string, unknown>)[k]));
  if (missing.length) throw new Error(`Fixtures are stale (missing: ${missing.join(", ")}). Re-run: npm run fixtures`);
  const active = (t: Snapshot["tenants"][number] | undefined) => (t && t.is_active ? (t as Tenant) : null);
  return {
    async tenantByHost(candidates) {
      const hit = candidates.map((c) => s.tenant_domains.find((d) => d.domain === c)).find(Boolean);
      return hit ? active(s.tenants.find((t) => t.id === hit.tenant_id)) : null;
    },
    async tenantBySlug(slug) { return active(s.tenants.find((t) => t.slug === slug)); },
    async regionName(id) { return s.regions.filter((r) => r.tenant_id === id).sort((a, b) => a.sort_order - b.sort_order)[0]?.name ?? null; },
    async categories(id) { return s.categories.filter((c) => c.tenant_id === id && c.is_active).sort((a, b) => a.sort_order - b.sort_order); },
    async communities(id) { return s.communities.filter((c) => c.tenant_id === id && c.is_active).sort((a, b) => a.sort_order - b.sort_order); },
    async upcomingEventRows(id, now) {
      const t = now.getTime();
      return s.community_events.filter((e) => e.tenant_id === id && e.status === "published"
        && (new Date(e.starts_at).getTime() >= t || (e.ends_at && new Date(e.ends_at).getTime() >= t) || e.rrule)).slice(0, 100);
    },
    // Runs the REAL public.search_businesses() as the anonymous role against the seeded local database, so dev and
    // production share one implementation. Values go in as psql variables (:'name' quotes them): never string-built.
    async searchBusinesses(id, q: SearchQuery): Promise<SearchResult> {
      const arr = (a: (string | number)[]) => (a.length ? `{${a.join(",")}}` : "");
      const rows = psqlJson<(SearchRow & { total_count: number | string })[]>(
        `select coalesce(jsonb_agg(t), '[]'::jsonb) from public.search_businesses(
          :'tenant'::uuid, :'q', nullif(:'comms', '')::uuid[], nullif(:'cats', '')::uuid[],
          :'verified'::boolean, :'featured'::boolean, :'deals'::boolean, :'quotes'::boolean,
          nullif(:'price', '')::smallint[], :'sort', :'lim'::int, :'off'::int,
          case when :'ids_set'::int = 1 then :'ids'::uuid[] else null end) t`,
        { tenant: id, q: q.q, comms: arr(q.communityIds), cats: arr(q.categoryIds), verified: String(q.verified), featured: String(q.featured),
          deals: String(q.deals), quotes: String(q.quotes), price: arr(q.price), sort: q.sort, lim: String(q.limit), off: String(q.offset),
          ids_set: q.ids === undefined ? "0" : "1", ids: `{${(q.ids ?? []).join(",")}}` });
      return splitSearchRows(rows);
    },
    async businessProfile(id, slug): Promise<ProfileRaw | null> {
      return psqlJson<ProfileRaw | null>("select public.business_profile(:'tenant'::uuid, :'slug')::text::jsonb", { tenant: id, slug });
    },
    async businessSlugs(id) { return s.businesses.filter((b) => b.tenant_id === id).map((b) => b.slug).sort(); },
    async counts(id): Promise<CountRow[]> {
      const rows = psqlJson<CountRow[]>("select coalesce(jsonb_agg(t), '[]'::jsonb) from public.directory_counts(:'tenant'::uuid) t", { tenant: id });
      return rows.map((x) => ({ ...x, n: Number(x.n) }));
    },
    async livePlacements(id, slot, scopeIds) {
      const col = slot === "category" ? "category_id" : "community_id";
      return [...new Set(s.public_placements.filter((p) => p.tenant_id === id && p.slot_type === slot && scopeIds.includes((p as Record<string, unknown>)[col] as string)).map((p) => p.business_id))];
    },
    async homepageFeatured(id) {
      const ids = new Set(s.public_placements.filter((p) => p.tenant_id === id && p.slot_type === "homepage").map((p) => p.business_id));
      return s.businesses.filter((b) => b.tenant_id === id && ids.has(b.id));
    },
  };
}
