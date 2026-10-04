import { directionsHref, safeExternalUrl, telHref, websiteLabel } from "../format.ts";
import { upcomingOccurrences } from "../events/recurrence.ts";
import { rotateFeatured } from "./rotation.ts";
import type { BusinessRow, Category, Community, EventRow, VerificationLevel } from "./types.ts";

export const HOME_FEATURED_VISIBLE = 6;
export const HOME_EVENTS_VISIBLE = 4;

export type EventCardModel = {
  key: string; slug: string; title: string; start: Date; end: Date | null; allDay: boolean;
  where: string | null; recurring: boolean; categoryColor: string | null;
};
export type BusinessCardModel = {
  id: string; slug: string; name: string; description: string | null; communityName: string | null; categoryName: string | null;
  verification: { level: Exclude<VerificationLevel, "none">; label: string } | null;
  telHref: string | null; website: { href: string; label: string } | null; directionsHref: string | null;
};

export function verificationBadge(level: VerificationLevel) {
  if (level === "gold") return { level, label: "Gold Verified" } as const;
  if (level === "green") return { level, label: "Verified" } as const;
  return null;
}

/** Next occurrences across all events, soonest first. Recurring events contribute their next occurrence only. */
export function buildEventCards(rows: EventRow[], communities: Community[], categories: Category[], now: Date, tz: string, limit = HOME_EVENTS_VISIBLE): EventCardModel[] {
  const cards: EventCardModel[] = [];
  for (const r of rows) {
    const occ = upcomingOccurrences(r, now, 1, tz)[0];
    if (!occ) continue;
    const community = communities.find((c) => c.id === r.community_id)?.name ?? null;
    const category = categories.find((c) => c.id === r.category_id);
    cards.push({
      key: `${r.id}:${occ.start.toISOString()}`, slug: r.slug, title: r.title, start: occ.start, end: occ.end, allDay: r.all_day,
      where: [r.venue_name, community].filter(Boolean).join(", ") || null, recurring: !!r.rrule, categoryColor: category?.color_token ?? null,
    });
  }
  return cards.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, limit);
}

/** Cards for the businesses in the live homepage slot, rotated hourly. Rules: no ratings, no distance, no "open now". */
export function buildFeaturedCards(rows: BusinessRow[], communities: Community[], categories: Category[], tenantId: string, now: Date, visible = HOME_FEATURED_VISIBLE): BusinessCardModel[] {
  const chosen = rotateFeatured(rows, visible, `${tenantId}:homepage`, now);
  return chosen.map((b) => {
    const site = safeExternalUrl(b.website);
    return {
      id: b.id, slug: b.slug, name: b.name, description: b.short_description,
      communityName: communities.find((c) => c.id === b.home_community_id)?.name ?? null,
      categoryName: categories.find((c) => c.id === b.primary_category_id)?.name ?? null,
      verification: verificationBadge(b.verification_level),
      telHref: telHref(b.phone), website: site ? { href: site, label: websiteLabel(site) } : null, directionsHref: directionsHref(b),
    };
  });
}

export const topLevelCategories = (cats: Category[]) => cats.filter((c) => c.parent_id === null).sort((a, b) => a.sort_order - b.sort_order);
