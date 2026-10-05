import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DealItem } from "@/components/content/ContentCards";
import { Pagination } from "@/components/directory/Pagination";
import { ChipNav, PageHero } from "@/components/site/PageHero";
import { TrackEvents } from "@/components/tracking/Tracker";
import { buildDealCards, dealsUrl, parseDealParams } from "@/lib/content/deals";
import { getDirectoryData } from "@/lib/directory/data";
import { socialMeta } from "@/lib/seo/meta";
import { getTenant } from "@/lib/tenant/resolve";

const DESC = "Local deals and offers from Star Valley businesses. Support local, save local.";
export async function generateMetadata(props: PageProps<"/deals">): Promise<Metadata> {
  const p = parseDealParams(await props.searchParams);
  const filtered = !!p.category || !!p.community;
  return { title: "Local Deals", description: DESC, ...socialMeta({ title: "Local Deals", description: DESC, path: dealsUrl(filtered ? {} : { page: p.page }), siteName: (await getTenant())?.name ?? "" }),
    robots: filtered ? { index: false, follow: true } : undefined, alternates: { canonical: filtered ? "/deals" : dealsUrl({ page: p.page }) } };
}

export default async function Deals(props: PageProps<"/deals">) {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const p = parseDealParams(await props.searchParams);
  const data = getDirectoryData();
  const deals = await data.liveDeals(tenant.id);
  const [businesses, communities, categories] = await Promise.all([data.businessesByIds(tenant.id, [...new Set(deals.map((d) => d.business_id))]), data.communities(tenant.id), data.categories(tenant.id)]);
  const r = buildDealCards(deals, businesses, communities, categories, p, new Date(), tenant.timezone);
  return (
    <main id="main">
      <PageHero id="deals-heading" title="Local Deals" intro="Support local. Save local." />
      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-8 sm:px-8">
        {r.tabs.length > 1 && <ChipNav label="Deal categories" items={r.tabs.map((t) => ({ href: dealsUrl({ ...p, category: t.slug, page: 1 }), label: t.name, count: t.count, active: p.category === t.slug }))} />}
        <p role="status" className="mb-4 text-lg font-semibold text-text">{r.total === 0 ? "No deals right now" : r.total === 1 ? "1 deal" : `${r.total} deals`}</p>
        {r.cards.length > 0 && <TrackEvents events={r.cards.slice(0, 24).map((d) => ({ type: "deal_view", business_id: d.businessId, deal_id: d.id, surface: "deals" }))} />}
        {r.cards.length > 0 ? (
          <><h2 className="sr-only">Current deals</h2><ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{r.cards.map((d) => <DealItem key={d.id} d={d} />)}</ul></>
        ) : (
          <div className="rounded-card bg-surface-muted p-8 text-center">
            <p className="font-heading text-xl font-bold">No deals match</p>
            <p className="mt-2 text-text-muted">Businesses on an Enhanced listing can post deals. <Link href="/deals" className="font-semibold underline underline-offset-4">See all deals</Link> or <Link href="/pricing" className="font-semibold underline underline-offset-4">see how listings work</Link>.</p>
          </div>
        )}
        <Pagination current={r.page} totalPages={r.totalPages} hrefFor={(n) => dealsUrl({ ...p, page: n })} />
      </div>
    </main>
  );
}
