export type Tenant = { id: string; slug: string; name: string; tagline: string | null; logo_path: string | null; theme: unknown; timezone: string };
export type Category = { id: string; slug: string; name: string; plural_name: string | null; description: string | null; color_token: string | null; parent_id: string | null; sort_order: number };
export type Community = { id: string; slug: string; name: string; state: string; sort_order: number };
export type EventRow = {
  id: string; slug: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean;
  community_id: string | null; category_id: string | null; venue_name: string | null;
  rrule: string | null; recurrence_until: string | null; exdates: string[];
  // only on rows read with the full column list (event pages); the listing pages do not need them
  description?: string | null; address?: string | null; url?: string | null; organizer_business_id?: string | null; image_media_id?: string | null;
};
export type EventCategory = { id: string; slug: string; name: string; sort_order: number };
export type DealRow = { id: string; business_id: string; title: string; description: string | null; terms: string | null; discount_type: "percent" | "amount" | "bogo" | "other"; discount_value: number | string | null; starts_at: string; ends_at: string | null };
export type ArticleListRow = { id: string; slug: string; title: string; excerpt: string | null; category_id: string | null; author_id: string | null; cover_media_id: string | null; read_minutes: number | null; featured_rank: number | null; publish_at: string };
export type ArticleFull = ArticleListRow & { body_md: string; spotlight_business_id: string | null; seo_title: string | null; seo_description: string | null };
export type ArticleItem = { position: number; title: string; body: string | null; business_id: string | null; event_id: string | null };
export type ArticleCategory = { id: string; slug: string; name: string; color_token: string | null; sort_order: number };
export type Author = { id: string; name: string; bio: string | null };
export type MediaRow = { id: string; storage_bucket: string; storage_path: string; alt_text: string | null; width: number | null; height: number | null };
export type ArticleQuery = { q: string; categoryId: string | null; featured: boolean; limit: number; offset: number };
export type VerificationLevel = "none" | "green" | "gold";
export type BusinessRow = {
  id: string; slug: string; name: string; short_description: string | null;
  home_community_id: string | null; primary_category_id: string | null;
  phone: string | null; website: string | null;
  address_line1: string | null; city: string | null; state: string | null; postal_code: string | null;
  verification_level: VerificationLevel;
};

export type SearchQuery = {
  q: string; communityIds: string[]; categoryIds: string[];
  verified: boolean; featured: boolean; deals: boolean; quotes: boolean;
  price: number[]; sort: "relevance" | "name"; limit: number; offset: number;
  /** Restrict to these businesses. `undefined` = no restriction; `[]` = match NOTHING (the database treats NULL as "no
   *  restriction", so an empty list must travel as an explicit empty array, never be dropped). */
  ids?: string[];
};
/** public.directory_counts(): null category/community means "all". A row exists only if at least one business matches. */
export type CountRow = { category_id: string | null; community_id: string | null; n: number };
export type SearchRow = BusinessRow & { price_range: number | null; live_placement: boolean; accepts_quotes: boolean; has_live_deal: boolean };
export type SearchResult = { rows: SearchRow[]; total: number };

/** public.business_profile(): what the profile page shows. Free-vs-Enhanced gating already happened in the database. */
/** A purchasable product (Enhanced listing, Featured placement). Read by anyone: it is what the pricing page shows. */
export type Product = { code: string; name: string; kind: "listing" | "placement"; tier: "free" | "enhanced" | null; slot_type: "homepage" | "category" | "community" | "things_to_do" | null; interval: "month" | "year" | null; amount_cents: number; payment_link_url: string | null };
/** public.placement_scarcity(): live inventory, aggregates only. */
export type ScarcityScope = { id: string; slug: string; name: string; max: number; used: number };
export type Scarcity = { homepage: { max: number; used: number }; things_to_do: { max: number; used: number }; categories: ScarcityScope[]; communities: ScarcityScope[] };

export type ProfileRaw = {
  tier: "free" | "enhanced";
  business: {
    id: string; slug: string; name: string; status: "unclaimed" | "claimed";
    short_description: string | null; description: string | null; highlights: string[]; hours_note: string | null; price_range: number | null;
    phone: string | null; website: string | null; email: string | null;
    address_line1: string | null; address_line2: string | null; city: string | null; state: string | null; postal_code: string | null;
    home_community_id: string | null; primary_category_id: string | null;
    verification_level: VerificationLevel; verified_at: string | null; reverify_due_at: string | null;
  };
  live_placement: boolean;
  hours: { day_of_week: number; opens: string; closes: string }[];
  service_area_community_ids: string[];
  category_ids: string[];
  photos: { role: "logo" | "cover" | "gallery"; caption: string | null; alt: string | null; bucket: string; path: string; width: number | null; height: number | null }[];
  services: { name: string }[];
  links: { kind: string; url: string }[];
  faqs: { question: string; answer: string }[];
  deals: { id: string; title: string; description: string | null; terms: string | null; discount_type: "percent" | "amount" | "bogo" | "other"; discount_value: number | string | null; ends_at: string | null }[];
};

// Everything the public pages read. Implemented by supabase.ts (production) and fixtures.ts (dev/test only).
// Methods return only what the anonymous role may read; the database (RLS + views) is the access policy.
/** One Local Hotlist item as the list function returns it (visible = published, started, business public, not ended). */
export interface HotlistListRow {
  id: string; slug: string; kind: "deal" | "pick"; category: "places" | "eat_drink" | "things_to_do" | "shop" | "new_notable";
  badge: "hot_deal" | "local_exclusive" | "limited_drop" | "hotlist_pick"; title: string; summary: string | null;
  business_id: string; business_name: string; business_slug: string; community_id: string | null; image_media_id: string | null;
  starts_at: string; ends_at: string | null; original_cents: number | null; price_cents: number | null; quantity: number | null;
  claimed_count: number | string; published_at: string | null;
}
/** hotlist_detail(): the same plus the long text; present even after an offer ends so shared links keep working. */
export interface HotlistDetailRaw extends HotlistListRow { body: string | null; redemption: string | null; terms: string | null }
export interface HotlistQuery { kind: "deal" | "pick" | null; category: string | null; q: string; communityId: string | null; maxPriceCents: number | null; sort: "newest" | "ending" | "popular"; limit: number; offset: number }
export interface HotlistFeatureRow { slot: "hottest" | "this_week" | "business"; position: number; item_id: string }

export interface DirectoryData {
  tenantByHost(candidates: string[]): Promise<Tenant | null>;
  tenantBySlug(slug: string): Promise<Tenant | null>;
  /** The tenant's first region name, e.g. "Star Valley" (used in headlines). */
  regionName(tenantId: string): Promise<string | null>;
  categories(tenantId: string): Promise<Category[]>;
  communities(tenantId: string): Promise<Community[]>;
  /** Published events that start in the future, are in progress, or recur. */
  upcomingEventRows(tenantId: string, now: Date): Promise<EventRow[]>;
  /** Businesses with a live homepage placement (from public_placements), in no particular order. */
  homepageFeatured(tenantId: string): Promise<BusinessRow[]>;
  /** public.search_businesses(): ranking, filters and paging happen in the database. `total` is the full match count. */
  searchBusinesses(tenantId: string, query: SearchQuery): Promise<SearchResult>;
  /** public.business_profile(): null when there is no PUBLIC business with that slug (prospect, archived, unknown, other tenant). */
  businessProfile(tenantId: string, slug: string): Promise<ProfileRaw | null>;
  /** Slugs of every public business (for the sitemap). */
  businessSlugs(tenantId: string): Promise<string[]>;
  /** Active products with their prices and Stripe Payment Link URLs (cheapest first within each kind). */
  products(tenantId: string): Promise<Product[]>;
  /** Live Featured inventory per slot and scope: "2 of 3 plumbing spots remaining". */
  scarcity(tenantId: string): Promise<Scarcity>;
  /** Businesses per category x community (see CountRow); drives which SEO hub pages exist. */
  counts(tenantId: string): Promise<CountRow[]>;
  /** Business ids with a LIVE placement in `slot` whose scope is one of `scopeIds` (category or community ids). */
  livePlacements(tenantId: string, slot: "category" | "community", scopeIds: string[]): Promise<string[]>;
  /** One published event by slug (null: unknown, unpublished or another tenant's), with every public column. */
  eventBySlug(tenantId: string, slug: string): Promise<EventRow | null>;
  eventCategories(tenantId: string): Promise<EventCategory[]>;
  /** Deals that are live right now (the database already applied: published, in date, business public and Enhanced). */
  liveDeals(tenantId: string): Promise<DealRow[]>;
  articleCategories(tenantId: string): Promise<ArticleCategory[]>;
  /** public.list_articles(): search, category, featured-only and paging happen in the database. */
  listArticles(tenantId: string, q: ArticleQuery): Promise<{ rows: ArticleListRow[]; total: number }>;
  articleCategoryCounts(tenantId: string): Promise<{ category_id: string | null; n: number }[]>;
  articleBySlug(tenantId: string, slug: string): Promise<{ article: ArticleFull; items: ArticleItem[] } | null>;
  articleSlugs(tenantId: string): Promise<{ slug: string; publish_at: string }[]>;
  authors(tenantId: string, ids: string[]): Promise<Author[]>;
  mediaAssets(tenantId: string, ids: string[]): Promise<MediaRow[]>;
  businessesByIds(tenantId: string, ids: string[]): Promise<BusinessRow[]>;
  hotlistList(tenantId: string, q: HotlistQuery): Promise<{ rows: HotlistListRow[]; total: number }>;
  hotlistDetail(tenantId: string, slug: string): Promise<HotlistDetailRaw | null>;
  hotlistFeatures(tenantId: string): Promise<HotlistFeatureRow[]>;
  hotlistCategoryCounts(tenantId: string): Promise<{ category: string; kind: string; n: number }[]>;
  /** Businesses with a live Things to Do placement. */
  thingsToDoFeatured(tenantId: string): Promise<BusinessRow[]>;
}
