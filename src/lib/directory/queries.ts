// The exact tables and columns the public site reads, in one place so a test can verify the anonymous database
// role is allowed to read every one of them (src/lib/directory/anon-access.test.ts).
export const PUBLIC_READS = {
  tenant_domains: ["domain", "tenant_id"],
  tenants: ["id", "slug", "name", "tagline", "logo_path", "theme", "timezone", "is_active"],
  regions: ["id", "tenant_id", "slug", "name", "sort_order"],
  categories: ["id", "tenant_id", "slug", "name", "description", "color_token", "parent_id", "sort_order", "is_active"],
  communities: ["id", "tenant_id", "slug", "name", "sort_order", "is_active"],
  community_events: ["id", "tenant_id", "slug", "title", "starts_at", "ends_at", "all_day", "community_id", "category_id",
    "venue_name", "rrule", "recurrence_until", "exdates", "status"],
  public_placements: ["tenant_id", "business_id", "slot_type"],
  businesses: ["id", "tenant_id", "slug", "name", "short_description", "home_community_id", "primary_category_id", "phone",
    "website", "address_line1", "city", "state", "postal_code", "verification_level", "status"],
} as const satisfies Record<string, readonly string[]>;

// RPC functions the public site calls (anon must be allowed to EXECUTE each; checked by anon-access.test.ts).
export const PUBLIC_RPC = ["search_businesses"] as const;

export const cols = (t: keyof typeof PUBLIC_READS): string => PUBLIC_READS[t].join(",");
