export type Tenant = { id: string; slug: string; name: string; tagline: string | null; logo_path: string | null; theme: unknown; timezone: string };
export type Category = { id: string; slug: string; name: string; description: string | null; color_token: string | null; parent_id: string | null; sort_order: number };
export type Community = { id: string; slug: string; name: string; sort_order: number };
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
};
export type SearchRow = BusinessRow & { price_range: number | null; live_placement: boolean; accepts_quotes: boolean; has_live_deal: boolean };
export type SearchResult = { rows: SearchRow[]; total: number };

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
}
