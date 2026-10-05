import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { describeRrule, eventJsonLd } from "@/lib/content/events";
import { plainExcerpt } from "@/lib/content/markdown";
import { getDirectoryData } from "@/lib/directory/data";
import type { Tenant } from "@/lib/directory/types";
import { upcomingOccurrences } from "@/lib/events/recurrence";
import { formatEventDay, formatTimeRange, safeExternalUrl } from "@/lib/format";
import { mediaBaseUrl, mediaUrl } from "@/lib/media";
import { jsonLdString } from "@/lib/seo/jsonld";
import { socialMeta } from "@/lib/seo/meta";
import { requestOrigin } from "@/lib/tenant/request-origin";
import { getTenant } from "@/lib/tenant/resolve";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const load = cache(async (tenant: Tenant, slug: string) => {
  if (!SLUG.test(slug)) return null;
  const data = getDirectoryData();
  const ev = await data.eventBySlug(tenant.id, slug);
  if (!ev) return null;
  const [communities, categories, organizers, media] = await Promise.all([
    data.communities(tenant.id), data.eventCategories(tenant.id), ev.organizer_business_id ? data.businessesByIds(tenant.id, [ev.organizer_business_id]) : Promise.resolve([]),
    ev.image_media_id ? data.mediaAssets(tenant.id, [ev.image_media_id]) : Promise.resolve([]),
  ]);
  const now = new Date();
  const occ = upcomingOccurrences(ev, now, 6, tenant.timezone);
  const img = media[0] ? mediaUrl(mediaBaseUrl(), media[0].storage_bucket, media[0].storage_path) : null;
  return { ev, occ, ended: occ.length === 0, community: communities.find((c) => c.id === ev.community_id) ?? null, category: categories.find((c) => c.id === ev.category_id)?.name ?? null, organizer: organizers[0] ?? null, image: img ? { url: img, alt: media[0]?.alt_text?.trim() || "" } : null };
});

export async function generateMetadata(props: PageProps<"/events/[slug]">): Promise<Metadata> {
  const tenant = await getTenant(); if (!tenant) return {};
  const v = await load(tenant, (await props.params).slug); if (!v) return {};
  const first = v.occ[0];
  const when = first ? new Intl.DateTimeFormat("en-US", { timeZone: tenant.timezone, month: "short", day: "numeric" }).format(first.start) : null;
  const description = v.ev.description ? plainExcerpt(v.ev.description, 160) : `${v.ev.title}${when ? ` on ${when}` : ""}${v.ev.venue_name ? ` at ${v.ev.venue_name}` : ""}${v.community ? `, ${v.community.name}` : ""}.`;
  const path = `/events/${v.ev.slug}`;
  return { title: v.ev.title, description, alternates: { canonical: path }, robots: v.ended ? { index: false, follow: true } : undefined, ...socialMeta({ title: v.ev.title, description, path, siteName: tenant.name, image: v.image?.url }) };
}

export default async function EventPage(props: PageProps<"/events/[slug]">) {
  const tenant = await getTenant(); if (!tenant) notFound();
  const v = await load(tenant, (await props.params).slug); if (!v) notFound();
  const { ev, occ } = v, tz = tenant.timezone, first = occ[0], origin = await requestOrigin();
  const path = `/events/${ev.slug}`;
  const site = safeExternalUrl(ev.url);
  const crumbs = [{ name: "Home", path: "/" }, { name: "Events", path: "/events" }, { name: ev.title, path }];
  const repeat = describeRrule(ev.rrule);
  const jsonLd = origin && first ? [eventJsonLd({ origin, path, title: ev.title, description: ev.description ? plainExcerpt(ev.description, 300) : null, start: first.start, end: first.end, allDay: ev.all_day, venue: ev.venue_name ?? null, address: ev.address ?? null, locality: v.community?.name ?? null, region: v.community?.state ?? null, organizer: v.organizer?.name ?? null, image: v.image?.url ?? null }),
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.path}` })) }] : [];
  const day = first ? formatEventDay(first.start, tz) : null;
  return (
    <main id="main">
      {jsonLd.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />}
      <header className="bg-[linear-gradient(115deg,var(--navy-900)_0%,var(--navy-800)_55%,var(--lake-700)_100%)] text-text-on-inverse">
        <div className="mx-auto w-full max-w-[var(--container-max)] space-y-4 px-4 py-8 sm:px-8">
          <Breadcrumbs crumbs={crumbs} />
          <h1 className="font-heading text-4xl font-bold text-text-on-inverse [overflow-wrap:anywhere]">{ev.title}</h1>
          {v.category && <p className="text-text-on-inverse">{v.category}</p>}
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-[var(--container-max)] gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_20rem]">
        <article className="min-w-0 space-y-6">
          {v.ended && <p role="status" className="rounded-card bg-surface-muted p-4 font-semibold text-text">This event has ended. <Link href="/events" className="underline underline-offset-4">See upcoming events</Link>.</p>}
          {v.image && <div className="relative aspect-[16/9] overflow-hidden rounded-card bg-surface-muted"><Image src={v.image.url} alt={v.image.alt} fill sizes="(min-width: 1024px) 60vw, 100vw" priority className="object-cover" /></div>}
          {ev.description && <div className="space-y-3 whitespace-pre-line text-lg text-text-body [overflow-wrap:anywhere]">{ev.description}</div>}
          {occ.length > 1 && (
            <section aria-labelledby="next-dates">
              <h2 id="next-dates" className="font-heading text-xl font-bold">Upcoming dates</h2>
              <ul className="mt-2 space-y-1 text-text-body">{occ.map((o) => <li key={o.start.toISOString()}><time dateTime={o.start.toISOString()}>{new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(o.start)}, {formatTimeRange(o.start, o.end, tz, ev.all_day)}</time></li>)}</ul>
            </section>
          )}
        </article>
        <aside aria-label="Event details" className="space-y-4">
          <dl className="space-y-3 rounded-card bg-surface-card p-5 shadow-card">
            {first && day && <div><dt className="text-sm font-semibold text-text-muted">{v.ended ? "Last date" : "Next date"}</dt><dd className="text-text"><time dateTime={first.start.toISOString()}>{day.weekday}, {day.month} {day.day}</time><br />{formatTimeRange(first.start, first.end, tz, ev.all_day)}</dd></div>}
            {repeat && <div><dt className="text-sm font-semibold text-text-muted">Repeats</dt><dd className="text-text">{repeat}</dd></div>}
            {(ev.venue_name || ev.address || v.community) && <div><dt className="text-sm font-semibold text-text-muted">Where</dt><dd className="text-text [overflow-wrap:anywhere]">{[ev.venue_name, ev.address, v.community?.name].filter(Boolean).join(", ")}</dd></div>}
            {v.organizer && <div><dt className="text-sm font-semibold text-text-muted">Hosted by</dt><dd><Link href={`/business/${v.organizer.slug}`} className="font-semibold text-link underline">{v.organizer.name}</Link></dd></div>}
          </dl>
          <p className="flex flex-wrap gap-2">
            {!v.ended && <a href={`${path}/calendar.ics`} className="rounded-button bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-hover">Add to calendar</a>}
            {site && <a href={site} target="_blank" rel="nofollow noopener noreferrer" className="rounded-button border border-border bg-surface-card px-4 py-2 text-sm font-semibold text-text hover:bg-surface-muted">Event website<span className="sr-only"> (opens in a new tab)</span></a>}
          </p>
        </aside>
      </div>
    </main>
  );
}
