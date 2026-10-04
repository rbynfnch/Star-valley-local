// Everything the business profile page shows, built from the database payload (business_profile()).
// Pure and tested. The database already hides Enhanced-only content from Free listings; this builder ENFORCES THE SAME
// RULES AGAIN, so a leak in one layer is not a leak on the page. Rules from CLAUDE.md: no reviews or ratings (we
// store none), no distance, no "open now", the verification re-check date only once verified.
import { directionsHref, safeExternalUrl, telHref, websiteLabel } from "../format.ts";
import { mediaUrl } from "../media.ts";
import { groupHours, openingHoursSpecification, type HoursView } from "./hours.ts";
import { plural } from "./hub.ts";
import type { Category, Community, ProfileRaw, VerificationLevel } from "./types.ts";

export type ProfileContext = {
  tenantName: string; timezone: string; origin: string | null; mediaBase: string | null; region: string | null;
  communities: Community[]; categories: Category[];
};
export type PhotoView = { url: string; alt: string; width: number; height: number };
export type ProfileView = {
  slug: string; name: string; tier: "free" | "enhanced"; isEnhanced: boolean; featured: boolean; claimable: boolean;
  categoryName: string | null; communityName: string | null; state: string | null;
  shortDescription: string | null; description: string | null; highlights: string[];
  addressLines: string[]; phone: string | null; telHref: string | null; website: { href: string; label: string } | null; email: string | null;
  directionsHref: string | null; priceLabel: string | null;
  verification: { level: Exclude<VerificationLevel, "none">; label: string; verifiedText: string | null; reverifyText: string | null } | null;
  hours: HoursView; hoursRows: ProfileRaw["hours"]; hoursNote: string | null; serviceAreas: string[];
  services: string[]; social: { label: string; href: string }[]; googleReviewsHref: string | null;
  faqs: { question: string; answer: string }[];
  deals: { id: string; title: string; description: string | null; terms: string | null; badge: string | null; validText: string }[];
  logo: PhotoView | null; photos: PhotoView[];
  crumbs: { name: string; path: string }[];
  title: string; metaDescription: string; path: string;
  jsonLd: object[];
};

const SOCIAL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", x: "X", youtube: "YouTube", linkedin: "LinkedIn", tiktok: "TikTok", google_business_profile: "Google Business Profile" };

const fmt = (iso: string, tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).format(new Date(iso));

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).trimEnd().replace(/[,;:.\-–]+$/, "") + "…";
}

export function dealBadge(type: string, value: number | string | null): string | null {
  const n = value === null ? NaN : Number(value);
  if (type === "percent" && Number.isFinite(n)) return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, "")}% OFF`;
  if (type === "amount" && Number.isFinite(n)) return `$${Number.isInteger(n) ? n : n.toFixed(2)} OFF`;
  if (type === "bogo") return "BUY 1 GET 1";
  return null;
}

export function buildProfileView(raw: ProfileRaw, ctx: ProfileContext): ProfileView {
  const b = raw.business;
  const enhanced = raw.tier === "enhanced";                      // the ONLY switch for Enhanced-only content
  const community = ctx.communities.find((c) => c.id === b.home_community_id);
  const category = ctx.categories.find((c) => c.id === b.primary_category_id);
  const parent = category?.parent_id ? ctx.categories.find((c) => c.id === category.parent_id) : undefined;
  const path = `/business/${b.slug}`;
  const site = safeExternalUrl(b.website);
  const state = b.state ?? community?.state ?? null;

  // photos: Free = the logo plus ONE photo; Enhanced = all of them. Unsafe storage paths are dropped.
  const toPhoto = (p: ProfileRaw["photos"][number]): (PhotoView & { role: string }) | null => {
    const url = mediaUrl(ctx.mediaBase, p.bucket, p.path);
    return url ? { role: p.role, url, alt: p.alt?.trim() || `${b.name} photo`, width: p.width ?? 1200, height: p.height ?? 800 } : null;
  };
  const all = raw.photos.map(toPhoto).filter((p): p is PhotoView & { role: string } => p !== null);
  const logo = all.find((p) => p.role === "logo") ?? null;
  const rest = all.filter((p) => p.role !== "logo");
  const shown = enhanced ? rest : rest.slice(0, 1);

  const links = enhanced ? raw.links : [];
  const social: { label: string; href: string }[] = [];
  let googleReviewsHref: string | null = null;
  for (const l of links) {
    const href = safeExternalUrl(l.url);
    if (!href) continue;
    if (l.kind === "google_reviews") googleReviewsHref = href;       // a link OUT; we never store or show ratings
    else social.push({ label: SOCIAL[l.kind] ?? websiteLabel(href), href });
  }

  const verified = b.verification_level !== "none";
  const verification = verified ? {
    level: b.verification_level as "green" | "gold",
    label: b.verification_level === "gold" ? "Gold Verified" : "Verified",
    // CLAUDE.md §6: the re-verification date is shown only once verified
    verifiedText: b.verified_at ? `Last verified ${fmt(b.verified_at, ctx.timezone, { month: "long", year: "numeric" })}` : null,
    reverifyText: b.reverify_due_at ? `Re-verification due ${fmt(b.reverify_due_at, ctx.timezone, { month: "long", day: "numeric", year: "numeric" })}` : null,
  } : null;

  const serviceAreas = ctx.communities.filter((c) => raw.service_area_community_ids.includes(c.id) && c.id !== b.home_community_id).map((c) => c.name);
  const description = enhanced ? b.description : null;
  const faqs = enhanced ? raw.faqs : [];
  const where = community ? `${community.name}, ${state ?? community.state}` : (ctx.region ?? "");
  const metaDescription = truncate([b.short_description, `${b.name}${where ? ` in ${where}` : ""}: phone, address, hours and directions.`].filter(Boolean).join(" "), 160);
  const catPlural = category ? plural(category) : null;

  const view: ProfileView = {
    slug: b.slug, name: b.name, tier: raw.tier, isEnhanced: enhanced, featured: raw.live_placement, claimable: b.status === "unclaimed",
    categoryName: category?.name ?? null, communityName: community?.name ?? null, state,
    shortDescription: b.short_description, description, highlights: enhanced ? b.highlights : [],
    addressLines: [[b.address_line1, b.address_line2].filter(Boolean).join(", "), [[b.city, b.state].filter(Boolean).join(", "), b.postal_code].filter(Boolean).join(" ")].filter((l) => l.trim().length > 0),
    phone: b.phone, telHref: telHref(b.phone), website: site ? { href: site, label: websiteLabel(site) } : null, email: enhanced ? b.email : null,
    directionsHref: directionsHref(b),
    priceLabel: b.price_range === 0 ? "Free" : b.price_range && b.price_range >= 1 && b.price_range <= 3 ? "$".repeat(b.price_range) : null,
    verification, hours: groupHours(raw.hours), hoursRows: raw.hours, hoursNote: b.hours_note, serviceAreas,
    services: enhanced ? raw.services.map((s) => s.name) : [], social, googleReviewsHref, faqs,
    deals: enhanced ? raw.deals.map((d) => ({
      id: d.id, title: d.title, description: d.description, terms: d.terms, badge: dealBadge(d.discount_type, d.discount_value),
      validText: d.ends_at ? `Valid through ${fmt(d.ends_at, ctx.timezone, { month: "short", day: "numeric", year: "numeric" })}` : "Ongoing",
    })) : [],
    logo: logo && { url: logo.url, alt: logo.alt, width: logo.width, height: logo.height },
    photos: shown.map(({ url, alt, width, height }) => ({ url, alt, width, height })),
    crumbs: [
      { name: "Home", path: "/" }, { name: "Businesses", path: "/businesses" },
      ...(parent ? [{ name: plural(parent), path: `/categories/${parent.slug}` }] : []),
      ...(category ? [{ name: catPlural!, path: `/categories/${category.slug}` }] : []),
      { name: b.name, path },
    ],
    title: `${b.name}${category && community ? ` | ${category.name} in ${community.name}, ${state ?? community.state}` : ""}`,
    metaDescription, path, jsonLd: [],
  };
  view.jsonLd = profileJsonLd(view, ctx.origin, ctx.communities.filter((c) => c.id === b.home_community_id || raw.service_area_community_ids.includes(c.id)));
  return view;
}

/** schema.org LocalBusiness + BreadcrumbList (+ FAQPage for Enhanced). Never includes ratings, reviews or "open now". */
export function profileJsonLd(v: ProfileView, origin: string | null, served: Community[]): object[] {
  if (!origin) return [];
  const abs = (u: string) => (u.startsWith("/") ? origin + u : u);
  const images = [v.logo, ...v.photos].filter((p): p is PhotoView => p !== null).map((p) => abs(p.url));
  const tel = v.telHref?.replace(/^tel:/, "");
  const business = {
    "@context": "https://schema.org", "@type": "LocalBusiness", "@id": `${origin}${v.path}#business`, name: v.name, url: `${origin}${v.path}`,
    ...(v.description || v.shortDescription ? { description: v.description ?? v.shortDescription } : {}),
    ...(tel ? { telephone: tel } : {}),
    ...(v.addressLines.length ? { address: { "@type": "PostalAddress", streetAddress: v.addressLines[0], ...(v.addressLines[1] ? { addressLocality: v.addressLines[1].split(",")[0] } : {}), ...(v.state ? { addressRegion: v.state } : {}), addressCountry: "US" } } : {}),
    ...(v.hours.kind === "known" ? { openingHoursSpecification: openingHoursSpecification(v.hoursRows) } : {}),
    ...(v.priceLabel && v.priceLabel !== "Free" ? { priceRange: v.priceLabel } : {}),
    ...(images.length ? { image: images } : {}),
    ...(served.length ? { areaServed: served.map((c) => ({ "@type": "City", name: c.name })) } : {}),
    ...(v.social.length ? { sameAs: v.social.map((s) => s.href) } : {}),
    ...(v.services.length ? { hasOfferCatalog: { "@type": "OfferCatalog", name: "Services", itemListElement: v.services.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s } })) } } : {}),
  };
  const out: object[] = [business, {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: v.crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.path}` })),
  }];
  if (v.faqs.length) out.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: v.faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) });
  return out;
}
