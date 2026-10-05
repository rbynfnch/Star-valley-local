import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cols } from "./queries.ts";
import { splitSearchRows } from "./search-rows.ts";
import type { ArticleCategory, ArticleFull, ArticleItem, ArticleListRow, ArticleQuery, Author, BusinessRow, Category, Community, CountRow, DealRow, DirectoryData, EventCategory, EventRow, MediaRow, Product, ProfileRaw, Scarcity, SearchQuery, SearchResult, SearchRow, Tenant } from "./types.ts";

function withoutTotal<T extends { total_count: unknown }>(r: T): Omit<T, "total_count"> { const c = { ...r } as Partial<T>; Reflect.deleteProperty(c, "total_count"); return c as Omit<T, "total_count">; }
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
    async businessProfile(tenantId, slug): Promise<ProfileRaw | null> {
      const r = await db.rpc("business_profile", { p_tenant: tenantId, p_slug: slug });
      if (r.error) throw new Error(`business_profile: ${r.error.message}`);
      return (r.data as unknown as ProfileRaw | null) ?? null;
    },
    async businessSlugs(tenantId) {
      const out: string[] = [];
      for (let from = 0; from < 100_000; from += 1000) {                       // PostgREST returns at most 1000 rows per request
        const rows = ok(await db.from("businesses").select("slug").eq("tenant_id", tenantId).order("slug").range(from, from + 999), "businesses") as unknown as { slug: string }[];
        out.push(...rows.map((x) => x.slug));
        if (rows.length < 1000) break;
      }
      return out;
    },
    async products(tenantId): Promise<Product[]> {
      const rows = ok(await db.from("tenant_products").select(cols("tenant_products")).eq("tenant_id", tenantId).eq("is_active", true).order("amount_cents"), "tenant_products") as unknown as Product[];
      return rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
    },
    async scarcity(tenantId): Promise<Scarcity> {
      const r = await db.rpc("placement_scarcity", { p_tenant: tenantId });
      if (r.error) throw new Error(`placement_scarcity: ${r.error.message}`);
      return r.data as unknown as Scarcity;
    },
    async counts(tenantId): Promise<CountRow[]> {
      const r = await db.rpc("directory_counts", { p_tenant: tenantId });
      if (r.error) throw new Error(`directory_counts: ${r.error.message}`);
      return ((r.data ?? []) as unknown as { category_id: string | null; community_id: string | null; n: number | string }[]).map((x) => ({ ...x, n: Number(x.n) }));
    },
    async livePlacements(tenantId, slot, scopeIds) {
      if (scopeIds.length === 0) return [];                      // nothing to look up (and `in ()` would be an error)
      const col = slot === "category" ? "category_id" : "community_id";
      const rows = ok(await db.from("public_placements").select(cols("public_placements")).eq("tenant_id", tenantId).eq("slot_type", slot).in(col, scopeIds), "public_placements") as unknown as { business_id: string }[];
      return [...new Set(rows.map((r) => r.business_id))];
    },
    async eventBySlug(tenantId, slug) {
      const r = await db.from("community_events").select(cols("community_events")).eq("tenant_id", tenantId).eq("slug", slug).eq("status", "published").maybeSingle();
      if (r.error) throw new Error(`community_events: ${r.error.message}`);
      return (r.data as unknown as EventRow | null) ?? null;
    },
    async eventCategories(tenantId) {
      return ok(await db.from("event_categories").select(cols("event_categories")).eq("tenant_id", tenantId).order("sort_order"), "event_categories") as unknown as EventCategory[];
    },
    async liveDeals(tenantId) {
      return ok(await db.from("deals").select(cols("deals")).eq("tenant_id", tenantId).order("ends_at", { ascending: true, nullsFirst: false }).limit(200), "deals") as unknown as DealRow[];
    },
    async articleCategories(tenantId) {
      return ok(await db.from("article_categories").select(cols("article_categories")).eq("tenant_id", tenantId).eq("is_active", true).order("sort_order"), "article_categories") as unknown as ArticleCategory[];
    },
    async listArticles(tenantId, q: ArticleQuery) {
      const r = await db.rpc("list_articles", { p_tenant: tenantId, p_q: q.q || null, p_category: q.categoryId, p_featured: q.featured, p_limit: q.limit, p_offset: q.offset });
      if (r.error) throw new Error(`list_articles: ${r.error.message}`);
      const rows = (r.data ?? []) as unknown as (ArticleListRow & { total_count: number | string })[];
      return { rows: rows.map((r) => withoutTotal(r)), total: rows.length ? Number(rows[0].total_count) : 0 };
    },
    async articleCategoryCounts(tenantId) {
      const r = await db.rpc("article_category_counts", { p_tenant: tenantId });
      if (r.error) throw new Error(`article_category_counts: ${r.error.message}`);
      return ((r.data ?? []) as unknown as { category_id: string | null; n: number | string }[]).map((x) => ({ category_id: x.category_id, n: Number(x.n) }));
    },
    async articleBySlug(tenantId, slug) {
      const r = await db.from("articles").select(cols("articles")).eq("tenant_id", tenantId).eq("slug", slug).eq("audience", "public").maybeSingle();
      if (r.error) throw new Error(`articles: ${r.error.message}`);
      if (!r.data) return null;
      const a = r.data as unknown as ArticleFull & { status: string; publish_at: string };
      if (!["published", "scheduled"].includes(a.status) || new Date(a.publish_at).getTime() > Date.now()) return null;
      const items = ok(await db.from("article_items").select(cols("article_items")).eq("tenant_id", tenantId).eq("article_id", a.id).order("position"), "article_items") as unknown as ArticleItem[];
      return { article: a, items };
    },
    async articleSlugs(tenantId) {
      return ok(await db.from("articles").select("slug,publish_at").eq("tenant_id", tenantId).eq("audience", "public").in("status", ["published", "scheduled"]).lte("publish_at", new Date().toISOString()).order("publish_at", { ascending: false }).limit(5000), "articles") as unknown as { slug: string; publish_at: string }[];
    },
    async authors(tenantId, ids) {
      if (ids.length === 0) return [];
      return ok(await db.from("authors").select(cols("authors")).eq("tenant_id", tenantId).in("id", ids), "authors") as unknown as Author[];
    },
    async mediaAssets(tenantId, ids) {
      if (ids.length === 0) return [];
      const rows = ok(await db.from("media_assets").select(cols("media_assets")).eq("tenant_id", tenantId).eq("is_public", true).in("id", ids), "media_assets") as unknown as (MediaRow & { is_public: boolean })[];
      return rows.map((r) => { const m = { ...r } as Partial<typeof r>; Reflect.deleteProperty(m, "is_public"); return m as MediaRow; });
    },
    async businessesByIds(tenantId, ids) {
      if (ids.length === 0) return [];
      return ok(await db.from("businesses").select(cols("businesses")).eq("tenant_id", tenantId).in("id", ids), "businesses") as unknown as BusinessRow[];
    },
    async thingsToDoFeatured(tenantId) {
      const placements = ok(await db.from("public_placements").select(cols("public_placements")).eq("tenant_id", tenantId).eq("slot_type", "things_to_do"), "public_placements") as unknown as { business_id: string }[];
      const ids = [...new Set(placements.map((p) => p.business_id))];
      if (ids.length === 0) return [];
      return ok(await db.from("businesses").select(cols("businesses")).eq("tenant_id", tenantId).in("id", ids), "businesses") as unknown as BusinessRow[];
    },
    async searchBusinesses(tenantId, q: SearchQuery): Promise<SearchResult> {
      const r = await db.rpc("search_businesses", {
        p_tenant: tenantId, p_q: q.q || null,
        p_communities: q.communityIds.length ? q.communityIds : null, p_categories: q.categoryIds.length ? q.categoryIds : null,
        p_verified: q.verified, p_featured: q.featured, p_with_deals: q.deals, p_accepts_quotes: q.quotes,
        p_price: q.price.length ? q.price : null, p_sort: q.sort, p_limit: q.limit, p_offset: q.offset,
        p_ids: q.ids === undefined ? null : q.ids,     // an EMPTY list must stay [] (NULL would mean "no restriction")
      });
      if (r.error) throw new Error(`search_businesses: ${r.error.message}`);
      return splitSearchRows((r.data ?? []) as unknown as (SearchRow & { total_count: number | string })[]);
    },
  };
}
