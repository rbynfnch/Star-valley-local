import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleTile, EventRow } from "@/components/content/ContentCards";
import { BusinessCard } from "@/components/directory/BusinessCard";
import { PageHero } from "@/components/site/PageHero";
import { TrackEvents } from "@/components/tracking/Tracker";
import { toArticleCard, weekendLabel, type ArticleCtx } from "@/lib/content/articles";
import { buildEventList, eventWindow, eventsUrl, parseEventParams } from "@/lib/content/events";
import { getDirectoryData } from "@/lib/directory/data";
import { toBusinessCard } from "@/lib/directory/home";
import { rotateFeatured } from "@/lib/directory/rotation";
import { mediaBaseUrl } from "@/lib/media";
import { socialMeta } from "@/lib/seo/meta";
import { getTenant } from "@/lib/tenant/resolve";

const DESC = "What to do in Star Valley this weekend: events, weekend guides, and local favorites.";
export async function generateMetadata(): Promise<Metadata> {
  return { title: "Things to Do", description: DESC, alternates: { canonical: "/things-to-do" }, ...socialMeta({ title: "Things to Do in Star Valley", description: DESC, path: "/things-to-do", siteName: (await getTenant())?.name ?? "" }) };
}

const SLOT_VISIBLE = 6;                         // the Things to Do placement limit (CLAUDE.md §6); rotation shares them out when more are booked
export default async function ThingsToDo() {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const data = getDirectoryData(), now = new Date(), tz = tenant.timezone;
  const [rows, communities, evCats, cats, categories, featuredRows] = await Promise.all([
    data.upcomingEventRows(tenant.id, now), data.communities(tenant.id), data.eventCategories(tenant.id), data.articleCategories(tenant.id), data.categories(tenant.id), data.thingsToDoFeatured(tenant.id)]);
  const win = eventWindow("weekend", now, tz);
  const weekend = buildEventList(rows, communities, evCats.map((c) => ({ ...c, color_token: null })), parseEventParams({ when: "weekend" }), now, tz);
  const guideCat = cats.find((c) => c.slug === "things-to-do") ?? null;
  const guides = guideCat ? await data.listArticles(tenant.id, { q: "", categoryId: guideCat.id, featured: false, limit: 3, offset: 0 }) : { rows: [], total: 0 };
  const [authors, media] = await Promise.all([data.authors(tenant.id, [...new Set(guides.rows.map((a) => a.author_id).filter((x): x is string => !!x))]), data.mediaAssets(tenant.id, [...new Set(guides.rows.map((a) => a.cover_media_id).filter((x): x is string => !!x))])]);
  const ctx: ArticleCtx = { categories: cats, authors, media, mediaBase: mediaBaseUrl(), tz };
  const featured = rotateFeatured(featuredRows, SLOT_VISIBLE, `${tenant.id}:things_to_do`, now).map((b) => toBusinessCard(b, communities, categories));
  const label = weekendLabel(win.start, win.end, tz);

  return (
    <main id="main">
      <PageHero id="ttd-heading" eyebrow="Plan your weekend" title="Things to Do in Star Valley" intro={DESC} />
      <div className="mx-auto w-full max-w-[var(--container-max)] space-y-12 px-4 py-10 sm:px-8">
        <section aria-labelledby="weekend-events">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="weekend-events" className="font-heading text-2xl font-bold">This weekend <span className="text-text-muted">({label})</span></h2>
            <Link href={eventsUrl({ range: "weekend" })} className="font-semibold text-link underline underline-offset-4">All weekend events</Link>
          </div>
          {weekend.items.length > 0 ? <ul className="grid gap-3 md:grid-cols-2">{weekend.items.slice(0, 6).map((ev) => <EventRow key={ev.key} ev={ev} tz={tz} />)}</ul>
            : <p className="rounded-card bg-surface-muted p-6 text-text-body">Nothing is listed for this weekend yet. <Link href="/events" className="font-semibold underline underline-offset-4">Browse upcoming events</Link> or <Link href="/submit-event" className="font-semibold underline underline-offset-4">submit one</Link>.</p>}
        </section>

        {guides.rows.length > 0 && (
          <section aria-labelledby="weekend-guides">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="weekend-guides" className="font-heading text-2xl font-bold">Guides and ideas</h2>
              {guideCat && <Link href={`/articles?category=${guideCat.slug}`} className="font-semibold text-link underline underline-offset-4">All guides</Link>}
            </div>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{guides.rows.map((a, i) => <ArticleTile key={a.slug} a={toArticleCard(a, ctx)} priority={i === 0} />)}</ul>
          </section>
        )}

        {featured.length > 0 && (
          <section aria-labelledby="ttd-featured">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 id="ttd-featured" className="font-heading text-2xl font-bold">Featured places</h2><p className="text-sm text-text-muted">Featured listings are paid placements.</p></div>
            <TrackEvents events={featured.map((b) => ({ type: "search_appearance", business_id: b.id, surface: "things_to_do" }))} />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{featured.map((b) => <BusinessCard key={b.id} b={b} featured />)}</ul>
          </section>
        )}
      </div>
    </main>
  );
}
