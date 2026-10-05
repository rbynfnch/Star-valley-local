// The exact tables and columns the public site reads, in one place so a test can verify the anonymous database
// role is allowed to read every one of them (src/lib/directory/anon-access.test.ts).
export const PUBLIC_READS = {
  tenant_domains: ["domain", "tenant_id"],
  tenants: ["id", "slug", "name", "tagline", "logo_path", "theme", "timezone", "is_active"],
  regions: ["id", "tenant_id", "slug", "name", "sort_order"],
  categories: ["id", "tenant_id", "slug", "name", "plural_name", "description", "color_token", "parent_id", "sort_order", "is_active"],
  communities: ["id", "tenant_id", "slug", "name", "state", "sort_order", "is_active"],
  community_events: ["id", "tenant_id", "slug", "title", "starts_at", "ends_at", "all_day", "community_id", "category_id",
    "venue_name", "rrule", "recurrence_until", "exdates", "status", "description", "address", "url", "organizer_business_id", "image_media_id"],
  event_categories: ["id", "tenant_id", "slug", "name", "sort_order"],
  deals: ["id", "tenant_id", "business_id", "title", "description", "terms", "discount_type", "discount_value", "starts_at", "ends_at", "status"],
  articles: ["id", "tenant_id", "slug", "title", "excerpt", "body_md", "category_id", "author_id", "cover_media_id", "spotlight_business_id", "read_minutes",
    "featured_rank", "publish_at", "seo_title", "seo_description", "status", "audience"],
  article_items: ["id", "tenant_id", "article_id", "position", "title", "body", "business_id", "event_id"],
  article_categories: ["id", "tenant_id", "slug", "name", "color_token", "sort_order", "is_active"],
  authors: ["id", "tenant_id", "name", "bio"],
  media_assets: ["id", "tenant_id", "storage_bucket", "storage_path", "alt_text", "width", "height", "is_public"],
  tenant_products: ["tenant_id", "code", "name", "kind", "tier", "slot_type", "interval", "amount_cents", "payment_link_url", "is_active"],
  public_placements: ["tenant_id", "business_id", "slot_type", "category_id", "community_id"],
  businesses: ["id", "tenant_id", "slug", "name", "short_description", "home_community_id", "primary_category_id", "phone",
    "website", "address_line1", "city", "state", "postal_code", "verification_level", "status"],
} as const satisfies Record<string, readonly string[]>;

// RPC functions the public site calls (anon must be allowed to EXECUTE each; checked by anon-access.test.ts).
// Each entry: the SQL arguments to call it with, where $T is a tenant id.
export const PUBLIC_RPC = { search_businesses: "$T, null", directory_counts: "$T", business_profile: "$T, 'x'", placement_scarcity: "$T", list_articles: "$T, null, null, false, 1, 0", article_category_counts: "$T", hotlist_list: "$T", hotlist_detail: "$T, 'x'", hotlist_features_public: "$T", hotlist_category_counts: "$T" } as const satisfies Record<string, string>;

export const cols = (t: keyof typeof PUBLIC_READS): string => PUBLIC_READS[t].join(",");
