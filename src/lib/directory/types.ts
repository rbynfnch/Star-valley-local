export type Tenant = { id: string; slug: string; name: string; tagline: string | null; logo_path: string | null; theme: unknown; timezone: string };
export type Category = { id: string; slug: string; name: string; plural_name: string | null; description: string | null; color_token: string | null; parent_id: string | null; sort_order: number };
export type Community = { id: string; slug: string; name: string; state: string; sort_order: number };
export type EventRow = {
  id: string; slug: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean;
  community_id: string | null; category_id: string | null; venue_name: string | null;
  rrule: string | null; recurrence_until: string | null; exdates: string[];
};
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
  /** Businesses per category x community (see CountRow); drives which SEO hub pages exist. */
  counts(tenantId: string): Promise<CountRow[]>;
  /** Business ids with a LIVE placement in `slot` whose scope is one of `scopeIds` (category or community ids). */
  livePlacements(tenantId: string, slot: "category" | "community", scopeIds: string[]): Promise<string[]>;
}
