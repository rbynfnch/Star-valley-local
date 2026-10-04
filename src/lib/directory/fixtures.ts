import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BusinessRow, Category, Community, DirectoryData, EventRow, Tenant } from "./types.ts";

// DEVELOPMENT/TEST ONLY. Serves a snapshot exported from a seeded local database AS THE ANONYMOUS ROLE
// (`npm run fixtures`), so it shows exactly what the public could read. Never used in production (data.ts refuses).
type Snapshot = {
  tenants: (Tenant & { is_active: boolean })[]; tenant_domains: { domain: string; tenant_id: string }[];
  regions: { tenant_id: string; name: string; sort_order: number }[];
  categories: (Category & { tenant_id: string; is_active: boolean })[]; communities: (Community & { tenant_id: string; is_active: boolean })[];
  community_events: (EventRow & { tenant_id: string; status: string })[];
  public_placements: { tenant_id: string; business_id: string; slot_type: string }[];
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
    async homepageFeatured(id) {
      const ids = new Set(s.public_placements.filter((p) => p.tenant_id === id && p.slot_type === "homepage").map((p) => p.business_id));
      return s.businesses.filter((b) => b.tenant_id === id && ids.has(b.id));
    },
  };
}
