import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cols } from "./queries.ts";
import type { BusinessRow, Category, Community, DirectoryData, EventRow, Tenant } from "./types.ts";

// Production implementation: the anonymous (public) key only. Flat selects, no relationship embedding, so every
// query maps 1:1 to a table/columns the anon role can read (verified by anon-access.test.ts).
export function supabaseDirectory(url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY): DirectoryData {
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (or SVL_DATA_SOURCE=fixtures in development)");
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return (r.data ?? ([] as unknown)) as T;
  };

  const tenantById = async (id: string): Promise<Tenant | null> => {
    const r = await db.from("tenants").select(cols("tenants")).eq("id", id).eq("is_active", true).maybeSingle();
    if (r.error) throw new Error(`tenant: ${r.error.message}`);
    return (r.data as unknown as Tenant | null) ?? null;
  };

  return {
    async tenantByHost(candidates) {
      if (candidates.length === 0) return null;
      const rows = ok(await db.from("tenant_domains").select(cols("tenant_domains")).in("domain", candidates), "tenant_domains") as unknown as { domain: string; tenant_id: string }[];
      const hit = candidates.map((c) => rows.find((r) => r.domain === c)).find(Boolean);
      return hit ? tenantById(hit.tenant_id) : null;
    },
    async tenantBySlug(slug) {
      const r = await db.from("tenants").select(cols("tenants")).eq("slug", slug).eq("is_active", true).maybeSingle();
      if (r.error) throw new Error(`tenant: ${r.error.message}`);
      return (r.data as unknown as Tenant | null) ?? null;
    },
    async regionName(tenantId) {
      const rows = ok(await db.from("regions").select(cols("regions")).eq("tenant_id", tenantId).order("sort_order").limit(1), "regions") as unknown as { name: string }[];
      return rows[0]?.name ?? null;
    },
    async categories(tenantId) {
      return ok(await db.from("categories").select(cols("categories")).eq("tenant_id", tenantId).eq("is_active", true).order("sort_order"), "categories") as unknown as Category[];
    },
    async communities(tenantId) {
      return ok(await db.from("communities").select(cols("communities")).eq("tenant_id", tenantId).eq("is_active", true).order("sort_order"), "communities") as unknown as Community[];
    },
    async upcomingEventRows(tenantId, now) {
      const iso = now.toISOString().replace(/\.\d{3}Z$/, "Z");
      return ok(await db.from("community_events").select(cols("community_events")).eq("tenant_id", tenantId).eq("status", "published")
        .or(`starts_at.gte.${iso},ends_at.gte.${iso},rrule.not.is.null`).order("starts_at").limit(100), "community_events") as unknown as EventRow[];
    },
    async homepageFeatured(tenantId) {
      const placements = ok(await db.from("public_placements").select(cols("public_placements")).eq("tenant_id", tenantId).eq("slot_type", "homepage"), "public_placements") as unknown as { business_id: string }[];
      const ids = [...new Set(placements.map((p) => p.business_id))];
      if (ids.length === 0) return [];
      return ok(await db.from("businesses").select(cols("businesses")).eq("tenant_id", tenantId).in("id", ids), "businesses") as unknown as BusinessRow[];
    },
  };
}
