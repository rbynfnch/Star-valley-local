import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { GetDeal, Pass } from "@/components/hotlist/GetDeal";
import { Badge, Facts, HotlistCard, StateTag } from "@/components/hotlist/HotlistCards";
import { ShareButtons } from "@/components/hotlist/ShareButtons";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { plainExcerpt, renderMarkdown } from "@/lib/content/markdown";
import { getDirectoryData } from "@/lib/directory/data";
import type { Tenant } from "@/lib/directory/types";
import { directionsHref, safeExternalUrl, telHref, websiteLabel } from "@/lib/format";
import { STATE_LABELS, categoryLabel, claimable, dealState, endDay, money, remaining, shareText, timeLeft } from "@/lib/hotlist/model";
import { toCards } from "@/lib/hotlist/view";
import { mediaBaseUrl, mediaUrl } from "@/lib/media";
import { jsonLdString } from "@/lib/seo/jsonld";
import { socialMeta } from "@/lib/seo/meta";
import { createServiceClient } from "@/lib/supabase/service";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/tenant/request-origin";
import { getTenant } from "@/lib/tenant/resolve";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const load = cache(async (tenant: Tenant, slug: string) => {
  if (!SLUG.test(slug) || slug.length > 120) return null;
  const data = getDirectoryData();
  const item = await data.hotlistDetail(tenant.id, slug);
  if (!item) return null;
  const media = item.image_media_id ? await data.mediaAssets(tenant.id, [item.image_media_id]) : [];
  const url = media[0] ? mediaUrl(mediaBaseUrl(), media[0].storage_bucket, media[0].storage_path) : null;
  return { item, image: media[0] && url ? { url, alt: media[0].alt_text ?? "" } : null };
});

export async function generateMetadata(props: PageProps<"/hotlist/[slug]">): Promise<Metadata> {
  const tenant = await getTenant(); if (!tenant) return {};
  const v = await load(tenant, (await props.params).slug); if (!v) return {};
  const { item } = v, path = `/hotlist/${item.slug}`;
  const ended = dealState(item, new Date()) === "expired";
  const description = item.summary ?? (item.body ? plainExcerpt(item.body, 160) : `${item.title} at ${item.business_name}.`);
  const title = item.kind === "deal" && item.price_cents !== null ? `${item.title}: ${money(item.price_cents)}` : item.title;
  return { title, description, alternates: { canonical: path }, robots: ended ? { index: false, follow: true } : undefined, ...socialMeta({ title, description, path, siteName: tenant.name, image: v.image?.url }) };
}

export default async function HotlistItem(props: PageProps<"/hotlist/[slug]">) {
  const tenant = await getTenant(); if (!tenant) notFound();
  const slug = (await props.params).slug;
  const v = await load(tenant, slug); if (!v) notFound();
  const { item } = v, tz = tenant.timezone, now = new Date(), origin = await requestOrigin();
  const path = `/hotlist/${item.slug}`;
  const data = getDirectoryData();
  const state = dealState(item, now), left = remaining(item);
  const row = { ...item };
  const [profile, communities, related] = await Promise.all([
    data.businessProfile(tenant.id, item.business_slug), data.communities(tenant.id),
    data.hotlistList(tenant.id, { kind: null, category: item.category, q: "", communityId: null, maxPriceCents: null, sort: "newest", limit: 5, offset: 0 }),
  ]);
  const town = communities.find((c) => c.id === item.community_id)?.name ?? null;
  const rel = related.rows.filter((r) => r.id !== item.id).slice(0, 3);
  const relMedia = await data.mediaAssets(tenant.id, rel.map((r) => r.image_media_id).filter((x): x is string => !!x));
  const relCards = toCards(rel, relMedia, communities, mediaBaseUrl());

  // The account's own code, if it has claimed this deal (shown again on any visit while signed in).
  let userId: string | null = null, emailOk = false;
  if (authConfigured()) { const u = (await (await createUserClient()).auth.getUser()).data.user; userId = u?.id ?? null; emailOk = !!u?.email_confirmed_at; }
  const mine = userId && item.kind === "deal" ? ((await createServiceClient().rpc("hotlist_my_claim", { p_tenant: tenant.id, p_item: item.id, p_user: userId })).data as { code: string; redeemed: boolean } | null) : null;

  const b = profile?.business;
  const site = b ? safeExternalUrl(b.website) : null, tel = b ? telHref(b.phone) : null, dir = b ? directionsHref(b) : null;
  const endsText = item.ends_at ? `Ends ${endDay(item.ends_at, tz)}${timeLeft(item.ends_at, now, tz) ? ` · ${timeLeft(item.ends_at, now, tz)}` : ""}` : null;
  const crumbs = [{ name: "Home", path: "/" }, { name: "Hotlist", path: "/hotlist" }, { name: item.title, path }];
  const url = origin ? `${origin}${path}` : path;
  const jsonLd = origin ? [
    ...(item.kind === "deal" && item.price_cents !== null ? [{ "@context": "https://schema.org", "@type": "Offer", name: item.title, url, description: item.summary ?? undefined, price: (item.price_cents / 100).toFixed(2), priceCurrency: "USD",
      availability: state === "sold_out" || state === "expired" ? "https://schema.org/SoldOut" : "https://schema.org/InStock", ...(item.ends_at ? { priceValidUntil: item.ends_at } : {}), seller: { "@type": "LocalBusiness", name: item.business_name, url: `${origin}/business/${item.business_slug}` } }] : []),
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.path}` })) },
  ] : [];
  const signIn = `/account/sign-in?next=${encodeURIComponent(path)}`;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  return (
    <main id="main">
      {jsonLd.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />}
      <header className="bg-surface-inverse">
        <div className="mx-auto w-full max-w-[var(--container-max)] space-y-3 px-4 py-6 sm:px-8"><Breadcrumbs crumbs={crumbs} /></div>
      </header>
      <div className="relative aspect-[16/7] max-h-[32rem] w-full bg-surface-muted">
        {v.image && <Image src={v.image.url} alt={v.image.alt} fill sizes="100vw" priority className="object-cover" />}
      </div>
      <div className="mx-auto grid w-full max-w-[var(--container-max)] gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_22rem]">
        <article className="min-w-0 space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2"><Badge badge={item.badge} /><StateTag state={state === "limited" ? "limited" : state === "active" ? null : state} left={left} /></div>
            <h1 className="font-heading text-4xl font-bold leading-tight text-text [overflow-wrap:anywhere] md:text-5xl">{item.title}</h1>
            <p className="text-lg text-text-muted">
              <Link href={`/business/${item.business_slug}`} className="font-semibold text-link underline underline-offset-4">{item.business_name}</Link>
              {[categoryLabel(item.category), town].filter(Boolean).length > 0 && <> · {[categoryLabel(item.category), town].filter(Boolean).join(" · ")}</>}
            </p>
            {item.summary && <p className="text-xl text-text-body [overflow-wrap:anywhere]">{item.summary}</p>}
          </div>
          {item.body && <div className="space-y-3 text-lg text-text-body [overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: renderMarkdown(item.body) }} />}
          {item.kind === "deal" && (
            <section aria-labelledby="redeem-h" className="space-y-2 rounded-card bg-surface-muted p-5">
              <h2 id="redeem-h" className="font-heading text-xl font-bold text-text">How to redeem</h2>
              {item.redemption && <p className="text-text-body [overflow-wrap:anywhere]">{item.redemption}</p>}
              <p className="text-text-body">You pay the Hotlist price to {item.business_name} when you redeem. Nothing is charged on this site.</p>
              {item.terms && <><h3 className="pt-2 font-semibold text-text">Terms</h3><p className="text-sm text-text-body [overflow-wrap:anywhere]">{item.terms}</p></>}
            </section>
          )}
          <section aria-labelledby="share-h" className="space-y-2"><h2 id="share-h" className="font-heading text-xl font-bold text-text">Share</h2>
            <ShareButtons url={url} title={item.title} text={shareText({ ...row })} /></section>
        </article>
        <aside aria-label="Get this offer" className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          {item.kind === "deal" ? (
            <div className="space-y-4 rounded-card bg-surface-card p-5 shadow-card">
              <Facts row={{ ...item, claimed_count: item.claimed_count }} tz={tz} now={now} large />
              {state === "limited" && left !== null && <p className="text-sm font-semibold text-text">Only {left} left.</p>}
              {mine ? <Pass code={mine.code} business={item.business_name} redemption={item.redemption} endsText={endsText} redeemed={mine.redeemed} />
                : claimable(state) ? (userId && !emailOk
                    ? <p role="status" className="text-text-body">Confirm your email address (we sent a link when you signed up) to get this deal.</p>
                    : <GetDeal slug={item.slug} business={item.business_name} redemption={item.redemption} endsText={endsText} siteKey={siteKey} signedIn={!!userId} signInHref={signIn} />)
                : <p role="status" className="font-semibold text-text">{state ? STATE_LABELS[state] : ""}. <Link href="/hotlist" className="underline underline-offset-4">See what is on the Hotlist now</Link>.</p>}
            </div>
          ) : (
            <p className="rounded-card bg-surface-muted p-5 text-text-body">A Hotlist Pick is a recommendation from our editors. There is nothing to claim: just go.</p>
          )}
          <div className="space-y-3 rounded-card bg-surface-card p-5 shadow-card">
            <h2 className="font-heading text-xl font-bold text-text">{item.business_name}</h2>
            {b && <p className="text-text-body [overflow-wrap:anywhere]">{[b.address_line1, b.city, b.state].filter(Boolean).join(", ")}</p>}
            <p className="flex flex-wrap gap-2 text-sm">
              {tel && <a href={tel} data-track="phone_click" data-business={item.business_id} className="rounded-button border border-slate-600 px-3 py-1.5 font-semibold text-text">Call</a>}
              {site && <a href={site} data-track="website_click" data-business={item.business_id} target="_blank" rel="nofollow noopener noreferrer" className="rounded-button border border-slate-600 px-3 py-1.5 font-semibold text-text">{b ? websiteLabel(site) : "Website"}</a>}
              {dir && <a href={dir} data-track="directions_click" data-business={item.business_id} target="_blank" rel="noopener noreferrer" className="rounded-button border border-slate-600 px-3 py-1.5 font-semibold text-text">Directions</a>}
            </p>
            <p><Link href={`/business/${item.business_slug}`} className="font-semibold text-link underline underline-offset-4">View the business profile</Link></p>
          </div>
        </aside>
      </div>
      {relCards.length > 0 && (
        <section aria-labelledby="rel-h" className="bg-surface-muted"><div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-10 sm:px-8">
          <h2 id="rel-h" className="font-heading text-3xl font-bold text-text">More from the Hotlist</h2>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{relCards.map((c) => <HotlistCard key={c.row.id} data={c} tz={tz} now={now} />)}</ul>
        </div></section>
      )}
    </main>
  );
}
