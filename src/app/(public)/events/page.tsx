import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventRow } from "@/components/content/ContentCards";
import { Pagination } from "@/components/directory/Pagination";
import { ChipNav, PageHero } from "@/components/site/PageHero";
import { buildEventList, eventsUrl, parseEventParams } from "@/lib/content/events";
import { getDirectoryData } from "@/lib/directory/data";
import { socialMeta } from "@/lib/seo/meta";
import { getTenant } from "@/lib/tenant/resolve";

const TITLE = "Events in Star Valley", DESC = "Upcoming community events, fairs, markets, games and more.";
export async function generateMetadata(props: PageProps<"/events">): Promise<Metadata> {
  const p = parseEventParams(await props.searchParams);
  const filtered = p.range !== "all" || !!p.community || !!p.category || !!p.q;
  return {
    title: "Events", description: DESC, ...socialMeta({ title: TITLE, description: DESC, path: eventsUrl(filtered ? {} : { page: p.page }), siteName: (await getTenant())?.name ?? "" }),
    robots: filtered ? { index: false, follow: true } : undefined, alternates: { canonical: filtered ? "/events" : eventsUrl({ page: p.page }) },
  };
}

const RANGES = [["all", "All events"], ["today", "Today"], ["weekend", "This weekend"], ["month", "This month"]] as const;
const field = "mt-1 block w-full rounded-button border border-border bg-surface-card px-3 py-2 text-text";

export default async function Events(props: PageProps<"/events">) {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const p = parseEventParams(await props.searchParams);
  const data = getDirectoryData();
  const [rows, communities, categories] = await Promise.all([data.upcomingEventRows(tenant.id, new Date()), data.communities(tenant.id), data.eventCategories(tenant.id)]);
  const list = buildEventList(rows, communities, categories.map((c) => ({ ...c, color_token: null })), p, new Date(), tenant.timezone);
  const filtered = !!p.community || !!p.category || !!p.q;

  return (
    <main id="main">
      <PageHero id="events-heading" title="Events" intro="Markets, games, festivals and everything else happening around the valley.">
        <form action="/events" method="get" role="search" aria-label="Search events" className="flex max-w-2xl gap-2 rounded-card bg-surface-card p-2 shadow-card">
          {p.range !== "all" && <input type="hidden" name="when" value={p.range} />}
          <label htmlFor="ev-q" className="sr-only">Search events</label>
          <input id="ev-q" name="q" type="search" defaultValue={p.q} placeholder="Search events…" autoComplete="off" className="min-w-0 flex-1 rounded-button bg-transparent px-3 py-2 text-text" />
          <button type="submit" className="rounded-button bg-brand px-5 py-2.5 font-semibold text-brand-contrast hover:bg-brand-hover">Search</button>
        </form>
      </PageHero>
      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-8 sm:px-8">
        <ChipNav label="When" items={RANGES.map(([k, label]) => ({ href: eventsUrl({ ...p, range: k, page: 1 }), label, active: p.range === k }))} />
        <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
          <aside aria-label="Filters">
            <form action="/events" method="get" className="space-y-4 rounded-card bg-surface-card p-4 shadow-card">
              {p.range !== "all" && <input type="hidden" name="when" value={p.range} />}
              {p.q && <input type="hidden" name="q" value={p.q} />}
              <div><label htmlFor="ev-comm" className="text-sm font-medium text-text">Community</label>
                <select id="ev-comm" name="community" defaultValue={p.community ?? ""} className={field}><option value="">All communities</option>{communities.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div>
              <div><label htmlFor="ev-cat" className="text-sm font-medium text-text">Type of event</label>
                <select id="ev-cat" name="category" defaultValue={p.category ?? ""} className={field}><option value="">All types</option>{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div>
              <div className="flex flex-wrap items-center gap-3"><button type="submit" className="rounded-button bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-hover">Apply</button>
                {(filtered || p.range !== "all") && <Link href="/events" className="text-sm font-medium text-link underline">Clear</Link>}</div>
            </form>
            <p className="mt-4 text-sm text-text-muted">Hosting something? <Link href="/submit-event" className="font-semibold text-link underline">Submit an event</Link>.</p>
          </aside>
          <section aria-labelledby="events-results">
            <h2 id="events-results" className="sr-only">Event results</h2>
            <p role="status" className="mb-4 text-lg font-semibold text-text">{list.total === 0 ? "No events found" : list.total === 1 ? "1 event" : `${list.total} events`}</p>
            {list.items.length > 0 ? (
              <ul className="grid gap-3">{list.items.map((ev) => <EventRow key={ev.key} ev={ev} tz={tenant.timezone} />)}</ul>
            ) : (
              <div className="rounded-card bg-surface-muted p-8 text-center">
                <p className="font-heading text-xl font-bold">Nothing matches</p>
                <p className="mt-2 text-text-muted">Try another day range, community or word. <Link href="/events" className="font-semibold underline underline-offset-4">See all events</Link>.</p>
              </div>
            )}
            <Pagination current={list.page} totalPages={list.totalPages} hrefFor={(n) => eventsUrl({ ...p, page: n })} />
          </section>
        </div>
      </div>
    </main>
  );
}
