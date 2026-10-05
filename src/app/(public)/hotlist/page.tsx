import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HotlistLogo, FlameMark } from "@/components/hotlist/Flame";
import { HotlistCard, HottestPrimary, WeekRow } from "@/components/hotlist/HotlistCards";
import { Pagination } from "@/components/directory/Pagination";
import { getDirectoryData } from "@/lib/directory/data";
import { CATEGORIES } from "@/lib/hotlist/model";
import { PER_PAGE, PRICE_STEPS, SORTS, hotlistUrl, isFiltered, parseHotlistParams } from "@/lib/hotlist/params";
import { buildLanding, toCards } from "@/lib/hotlist/view";
import { mediaBaseUrl } from "@/lib/media";
import { socialMeta } from "@/lib/seo/meta";
import { getTenant } from "@/lib/tenant/resolve";

const TITLE = "Local Hotlist", DESC = "What's worth knowing right now in Star Valley: hand-picked deals, places to go and things worth doing.";
export async function generateMetadata(props: PageProps<"/hotlist">): Promise<Metadata> {
  const filtered = isFiltered(parseHotlistParams(await props.searchParams));
  return { title: TITLE, description: DESC, ...socialMeta({ title: TITLE, description: DESC, path: "/hotlist", siteName: (await getTenant())?.name ?? "" }),
    robots: filtered ? { index: false, follow: true } : undefined, alternates: { canonical: "/hotlist" } };
}

const field = "mt-1 block w-full rounded-button border border-border bg-surface-card px-3 py-2 text-text";
const section = "mx-auto w-full max-w-[var(--container-max)] px-4 py-10 sm:px-8";
const h2 = "font-heading text-3xl font-bold text-text";

export default async function Hotlist(props: PageProps<"/hotlist">) {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const p = parseHotlistParams(await props.searchParams);
  const filtered = isFiltered(p);
  const data = getDirectoryData();
  const now = new Date(), tz = tenant.timezone;
  const communities = await data.communities(tenant.id);
  const town = p.town ? communities.find((c) => c.slug === p.town) ?? null : null;
  const q = { kind: p.kind, category: p.category, q: p.q, communityId: town?.id ?? null, maxPriceCents: p.maxPrice, sort: p.sort };
  // Landing: everything live (the valley is small), arranged by the editors. Filtered: one page of results.
  const [result, features, counts] = await Promise.all([
    p.town && !town ? Promise.resolve({ rows: [], total: 0 }) : data.hotlistList(tenant.id, filtered ? { ...q, limit: PER_PAGE, offset: (p.page - 1) * PER_PAGE } : { ...q, limit: 50, offset: 0 }),
    filtered ? Promise.resolve([]) : data.hotlistFeatures(tenant.id),
    data.hotlistCategoryCounts(tenant.id),
  ]);
  const media = await data.mediaAssets(tenant.id, result.rows.map((r) => r.image_media_id).filter((x): x is string => !!x));
  const cards = toCards(result.rows, media, communities, mediaBaseUrl());
  const landing = filtered ? null : buildLanding(cards, features);
  const totalPages = Math.max(1, Math.ceil(result.total / PER_PAGE));
  const catCount = (c: string) => counts.filter((x) => x.category === c).reduce((n, x) => n + x.n, 0);
  const dealCount = counts.filter((x) => x.kind === "deal").reduce((n, x) => n + x.n, 0);
  const nav = [
    { label: "All", href: hotlistUrl({}), active: !p.category && !p.kind },
    { label: "Deals", href: hotlistUrl({ kind: "deal" }), active: p.kind === "deal" && !p.category, count: dealCount },
    ...CATEGORIES.map((c) => ({ label: c.label, href: hotlistUrl({ category: c.value }), active: p.category === c.value, count: catCount(c.value) })),
  ];
  const empty = result.rows.length === 0;

  return (
    <main id="main">
      <section aria-labelledby="hl-h" className="bg-surface-muted">
        <div className="mx-auto grid w-full max-w-[var(--container-max)] items-center gap-8 px-4 py-10 sm:px-8 md:grid-cols-5 md:py-14">
          <div className="space-y-5 md:col-span-3">
            <h1 id="hl-h" className="font-heading text-4xl font-bold leading-tight text-text md:text-6xl"><span className="sr-only">Local Hotlist: </span>What&apos;s worth knowing right now.</h1>
            <p className="max-w-xl text-lg text-text-body">A short, hand-picked list of the best deals, places and things to do in the valley this week. Nothing here gets in without an editor saying yes.</p>
            <p className="flex flex-wrap gap-3">
              <a href="#hotlist-results" className="rounded-button bg-brand px-6 py-3 font-semibold text-brand-contrast hover:bg-brand-hover">Explore the Hotlist</a>
              <Link href="/hotlist/submit" className="rounded-button border border-text px-6 py-3 font-semibold text-text hover:bg-surface-card">Submit a Hotlist offer</Link>
            </p>
          </div>
          <div className="order-first md:order-none md:col-span-2 md:justify-self-end"><HotlistLogo height={130} priority /></div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 pt-6 sm:px-8">
        <nav aria-label="Hotlist categories">
          <ul className="flex flex-wrap gap-2">
            {nav.map((i) => (
              <li key={i.label}>
                <Link href={i.href} aria-current={i.active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-pill border px-4 py-1.5 text-sm font-semibold ${i.active ? "border-transparent bg-surface-inverse text-text-on-inverse" : "border-border bg-surface-card text-text hover:bg-surface-muted"}`}>
                  {i.active && <FlameMark height={14} />}{i.label}{i.count !== undefined && <span className="font-normal opacity-80">{i.count}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <form action="/hotlist" method="get" role="search" aria-label="Search the Hotlist" className="mt-5 grid gap-3 rounded-card bg-surface-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-6">
          {p.category && <input type="hidden" name="category" value={p.category} />}
          <div className="sm:col-span-2 lg:col-span-2">
            <label htmlFor="hl-q" className="text-sm font-medium text-text">What are you looking for?</label>
            <input id="hl-q" name="q" type="search" defaultValue={p.q} autoComplete="off" placeholder="Tacos, fly fishing, a cabin…" className={field} />
          </div>
          <div><label htmlFor="hl-view" className="text-sm font-medium text-text">Offer type</label>
            <select id="hl-view" name="view" defaultValue={p.kind === "deal" ? "deals" : p.kind === "pick" ? "picks" : ""} className={field}><option value="">Deals and picks</option><option value="deals">Deals</option><option value="picks">Picks</option></select></div>
          <div><label htmlFor="hl-town" className="text-sm font-medium text-text">Town</label>
            <select id="hl-town" name="town" defaultValue={p.town ?? ""} className={field}><option value="">Whole valley</option>{communities.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div>
          <div><label htmlFor="hl-price" className="text-sm font-medium text-text">Price</label>
            <select id="hl-price" name="price" defaultValue={p.maxPrice ?? ""} className={field}><option value="">Any price</option>{PRICE_STEPS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
          <div><label htmlFor="hl-sort" className="text-sm font-medium text-text">Sort by</label>
            <select id="hl-sort" name="sort" defaultValue={p.sort} className={field}>{SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-6">
            <button type="submit" className="rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover">Search</button>
            {filtered && <Link href="/hotlist" className="text-sm font-medium text-link underline">Clear</Link>}
          </div>
        </form>
      </div>

      <div id="hotlist-results" tabIndex={-1} className="scroll-mt-4 focus:outline-none">
        {filtered ? (
          <div className={section}>
            <h2 className={h2}>{p.q ? `Results for “${p.q}”` : p.category ? CATEGORIES.find((c) => c.value === p.category)?.label : p.kind === "deal" ? "Deals" : p.kind === "pick" ? "Picks" : "The Hotlist"}</h2>
            <p role="status" className="mt-2 text-text-muted">{result.total === 0 ? "Nothing matches yet" : result.total === 1 ? "1 item" : `${result.total} items`}</p>
            {empty ? (
              <div className="mt-6 rounded-card bg-surface-muted p-8 text-center"><p className="font-heading text-xl font-bold">Nothing matches</p><p className="mt-2 text-text-muted">Try a different word or town, or <Link href="/hotlist" className="font-semibold underline underline-offset-4">see the whole Hotlist</Link>.</p></div>
            ) : (
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{cards.map((c, i) => <HotlistCard key={c.row.id} data={c} tz={tz} now={now} priority={i < 3} />)}</ul>
            )}
            <Pagination current={Math.min(p.page, totalPages)} totalPages={totalPages} hrefFor={(n) => hotlistUrl({ ...p, page: n })} />
          </div>
        ) : empty ? (
          <div className={section}><div className="rounded-card bg-surface-muted p-8 text-center"><p className="font-heading text-2xl font-bold">The next Hotlist is being put together</p><p className="mt-2 text-text-muted">Check back soon. In the meantime, <Link href="/events" className="font-semibold underline underline-offset-4">see what is on this week</Link>.</p></div></div>
        ) : landing && (
          <>
            {landing.hottest.length > 0 && (
              <section aria-labelledby="hot-h" className={section}>
                <h2 id="hot-h" className={h2}>The hottest right now</h2>
                <div className="mt-6 space-y-5">
                  <HottestPrimary data={landing.hottest[0]} tz={tz} now={now} />
                  {landing.hottest.length > 1 && <ul className="grid gap-5 sm:grid-cols-2">{landing.hottest.slice(1).map((c) => <HotlistCard key={c.row.id} data={c} tz={tz} now={now} />)}</ul>}
                </div>
              </section>
            )}
            {landing.deals.length > 0 && (
              <section aria-labelledby="deals-h" className="bg-surface-muted"><div className={section}>
                <div className="flex flex-wrap items-end justify-between gap-2"><h2 id="deals-h" className={h2}>Hot deals</h2><Link href={hotlistUrl({ kind: "deal" })} className="font-semibold text-link underline underline-offset-4">All deals</Link></div>
                <p className="mt-2 max-w-2xl text-text-muted">Real savings only. Claim a deal to get your code, then show it at the business.</p>
                <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{landing.deals.map((c) => <HotlistCard key={c.row.id} data={c} tz={tz} now={now} />)}</ul>
              </div></section>
            )}
            {landing.picks.length > 0 && (
              <section aria-labelledby="picks-h" className={section}>
                <div className="flex flex-wrap items-end justify-between gap-2"><h2 id="picks-h" className={h2}>Hotlist picks</h2><Link href={hotlistUrl({ kind: "pick" })} className="font-semibold text-link underline underline-offset-4">All picks</Link></div>
                <p className="mt-2 max-w-2xl text-text-muted">No discount, no catch: places and things our editors think you should know about.</p>
                <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{landing.picks.map((c) => <HotlistCard key={c.row.id} data={c} tz={tz} now={now} />)}</ul>
              </section>
            )}
            {landing.week.length > 0 && (
              <section aria-labelledby="week-h" className="bg-surface-muted"><div className={section}>
                <h2 id="week-h" className={h2}>On the Hotlist this week</h2>
                <ul className="mt-6 rounded-card bg-surface-card p-5 shadow-card">{landing.week.map((c) => <WeekRow key={c.row.id} data={c} tz={tz} />)}</ul>
              </div></section>
            )}
            {landing.business && (
              <section aria-labelledby="biz-h" className={section}>
                <h2 id="biz-h" className={h2}>Hotlist business</h2>
                <div className="mt-6 grid gap-5 md:grid-cols-5">
                  <div className="md:col-span-3"><ul><HotlistCard data={landing.business} tz={tz} now={now} /></ul></div>
                  <div className="flex flex-col justify-center gap-3 md:col-span-2">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-text"><FlameMark height={16} />Hotlist Featured</p>
                    <p className="font-heading text-2xl font-bold text-text">{landing.business.row.business_name}</p>
                    {landing.business.row.summary && <p className="text-text-body">{landing.business.row.summary}</p>}
                    <p><Link href={`/business/${landing.business.row.business_slug}`} className="font-semibold text-link underline underline-offset-4">See the business profile</Link></p>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
