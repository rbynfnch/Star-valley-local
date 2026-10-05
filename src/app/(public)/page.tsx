import { FlameMark } from "@/components/hotlist/Flame";
import { HotlistCard } from "@/components/hotlist/HotlistCards";
import { buildLanding, toCards } from "@/lib/hotlist/view";
import { mediaBaseUrl } from "@/lib/media";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "@/components/icons";
import { BusinessCard } from "@/components/directory/BusinessCard";
import { TrackEvents } from "@/components/tracking/Tracker";
import { CategoryTile } from "@/components/directory/CategoryTile";
import { EventCard } from "@/components/directory/EventCard";
import { HeroSearch } from "@/components/directory/HeroSearch";
import { getDirectoryData } from "@/lib/directory/data";
import { buildEventCards, buildFeaturedCards, topLevelCategories } from "@/lib/directory/home";
import { jsonLdString, organizationJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import { normalizeHost } from "@/lib/tenant/host";
import { originFromRequest } from "@/lib/tenant/origin";
import { getTenant } from "@/lib/tenant/resolve";

export default async function Home() {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const data = getDirectoryData();
  const now = new Date();
  const [region, categories, communities, eventRows, featuredRows] = await Promise.all([
    data.regionName(tenant.id), data.categories(tenant.id), data.communities(tenant.id),
    data.upcomingEventRows(tenant.id, now), data.homepageFeatured(tenant.id),
  ]);
  const [hotRes, hotFeatures] = await Promise.all([
    data.hotlistList(tenant.id, { kind: null, category: null, q: "", communityId: null, maxPriceCents: null, sort: "newest", limit: 50, offset: 0 }), data.hotlistFeatures(tenant.id),
  ]);
  const hotMedia = await data.mediaAssets(tenant.id, hotRes.rows.map((r) => r.image_media_id).filter((x): x is string => !!x));
  const hotLanding = buildLanding(toCards(hotRes.rows, hotMedia, communities, mediaBaseUrl()), hotFeatures);
  const hotPicks = (hotLanding.hottest.length > 0 ? hotLanding.hottest : hotLanding.deals).slice(0, 3);
  const tiles = topLevelCategories(categories);
  const events = buildEventCards(eventRows, communities, categories, now, tenant.timezone);
  const featured = buildFeaturedCards(featuredRows, communities, categories, tenant.id, now);

  const h = await headers();
  const host = normalizeHost(h.get("host")) ? h.get("host") : null;
  const origin = originFromRequest(host, h.get("x-forwarded-proto"), process.env.NODE_ENV === "production");

  return (
    <main id="main">
      {origin && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString([
          websiteJsonLd({ name: tenant.name, url: origin, description: tenant.tagline, searchUrlTemplate: `${origin}/businesses?q={search_term_string}` }),
          organizationJsonLd({ name: tenant.name, url: origin }),
        ]) }} />
      )}

      <section aria-labelledby="hero-heading" className="bg-[linear-gradient(115deg,var(--navy)_0%,var(--navy)_45%,var(--valley-blue)_100%)] text-text-on-inverse">
        <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-6 px-4 py-14 sm:px-8 sm:py-20">
          <h1 id="hero-heading" className="max-w-2xl font-heading text-4xl font-bold leading-tight text-text-on-inverse sm:text-5xl">
            Find Local. Discover More.{region && <> Support {region}.</>}
          </h1>
          <p className="max-w-xl text-lg text-text-on-inverse">Your go-to guide for local businesses, events, the Hotlist, and everything {region ?? "our community"} has to offer.</p>
          <HeroSearch communities={communities.map((c) => ({ slug: c.slug, name: c.name }))} />
        </div>
      </section>

      <div className="mx-auto w-full max-w-[var(--container-max)] space-y-14 px-4 pt-10 sm:px-8">
        {tiles.length > 0 && (
          <section aria-labelledby="cat-heading">
            <h2 id="cat-heading" className="mb-4 text-2xl font-bold">Browse by category</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {tiles.map((c) => <li key={c.id} className="contents"><CategoryTile slug={c.slug} name={c.name} description={c.description} colorToken={c.color_token} /></li>)}
            </ul>
          </section>
        )}

        {featured.length > 0 && <TrackEvents events={featured.slice(0, 12).map((b) => ({ type: "search_appearance", business_id: b.id, surface: "home" }))} />}
        {featured.length > 0 && (
          <section aria-labelledby="featured-heading">
            <h2 id="featured-heading" className="mb-4 text-2xl font-bold">Featured local businesses</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((b) => <BusinessCard key={b.id} b={b} featured />)}
            </ul>
          </section>
        )}

        {hotPicks.length > 0 && (
          <section aria-labelledby="hotlist-heading">
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 id="hotlist-heading" className="flex items-center gap-2 text-2xl font-bold"><FlameMark height={26} />On the Hotlist</h2>
              <Link href="/hotlist" className="inline-flex items-center gap-1 font-semibold">See the full Hotlist <ArrowRightIcon /></Link>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{hotPicks.map((c) => <HotlistCard key={c.row.id} data={c} tz={tenant.timezone} now={now} />)}</ul>
          </section>
        )}

        {events.length > 0 && (
          <section aria-labelledby="events-heading">
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 id="events-heading" className="text-2xl font-bold">What&apos;s happening{region ? ` in ${region}` : ""}</h2>
              <Link href="/events" className="inline-flex items-center gap-1 font-semibold">View all events <ArrowRightIcon /></Link>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {events.map((e) => <EventCard key={e.key} ev={e} tz={tenant.timezone} />)}
            </ul>
          </section>
        )}

        <section aria-labelledby="browse-heading" className="rounded-card bg-surface-muted p-8 text-center">
          <h2 id="browse-heading" className="text-2xl font-bold">Looking for something specific?</h2>
          <p className="mx-auto mt-2 max-w-md text-text-muted">From plumbers to photographers, find exactly what you need{region ? ` in ${region}` : ""}.</p>
          <Link href="/businesses" className="mt-5 inline-flex items-center gap-2 rounded-button bg-brand px-5 py-2.5 font-semibold text-brand-contrast hover:bg-brand-hover">Browse all businesses <ArrowRightIcon /></Link>
        </section>
      </div>
    </main>
  );
}
