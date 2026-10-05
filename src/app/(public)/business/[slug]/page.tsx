import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { ActionButtons, CoverBanner, DealsCard, DetailsCard, FaqCard, Gallery, HoursCard, ServicesCard, VerificationCard } from "@/components/profile/Sections";
import { getDirectoryData } from "@/lib/directory/data";
import { buildProfileView, type ProfileView } from "@/lib/directory/profile";
import type { Tenant } from "@/lib/directory/types";
import { mediaBaseUrl } from "@/lib/media";
import { jsonLdString } from "@/lib/seo/jsonld";
import { socialMeta } from "@/lib/seo/meta";
import { TrackEvents } from "@/components/tracking/Tracker";
import { normalizeHost } from "@/lib/tenant/host";
import { originFromRequest } from "@/lib/tenant/origin";
import { getTenant } from "@/lib/tenant/resolve";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// One load shared by generateMetadata and the page. null = there is no PUBLIC business with this slug (unknown,
// prospect, archived, or another tenant's): the page is a 404.
const loadProfile = cache(async (tenant: Tenant, slug: string): Promise<ProfileView | null> => {
  if (!SLUG.test(slug)) return null;
  const data = getDirectoryData();
  const raw = await data.businessProfile(tenant.id, slug);
  if (!raw) return null;
  const [region, categories, communities] = await Promise.all([data.regionName(tenant.id), data.categories(tenant.id), data.communities(tenant.id)]);
  const h = await headers();
  const host = normalizeHost(h.get("host")) ? h.get("host") : null;
  const origin = originFromRequest(host, h.get("x-forwarded-proto"), process.env.NODE_ENV === "production");
  return buildProfileView(raw, { tenantName: tenant.name, timezone: tenant.timezone, origin, mediaBase: mediaBaseUrl(), region, categories, communities });
});

export async function generateMetadata(props: PageProps<"/business/[slug]">): Promise<Metadata> {
  const tenant = await getTenant();
  if (!tenant) return {};
  const v = await loadProfile(tenant, (await props.params).slug);
  if (!v) return {};
  return { title: v.title, description: v.metaDescription, alternates: { canonical: v.path }, ...socialMeta({ title: v.title, description: v.metaDescription, path: v.path, siteName: tenant.name, image: v.logo?.url ?? v.photos[0]?.url }) };
}

export default async function BusinessPage(props: PageProps<"/business/[slug]">) {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const v = await loadProfile(tenant, (await props.params).slug);
  if (!v) notFound();

  const cover = v.photos[0] ?? null;                         // Free: the one allowed photo; Enhanced: the first of the gallery
  const gallery = v.isEnhanced ? v.photos.slice(1) : [];
  const about = v.description ?? v.shortDescription;
  const tabs = [
    { id: "about", label: "Overview", show: true },
    { id: "services", label: "Services", show: v.services.length > 0 },
    { id: "photos", label: "Photos", show: gallery.length > 0 },
    { id: "deals", label: "Deals", show: v.deals.length > 0 },
    { id: "faqs", label: "FAQs", show: v.faqs.length > 0 },
  ].filter((t) => t.show);

  return (
    <main id="main">
      <TrackEvents events={[{ type: "profile_view", business_id: v.id, surface: "profile" }, ...v.deals.map((d) => ({ type: "deal_view", business_id: v.id, deal_id: d.id, surface: "profile" }))]} />
      {v.jsonLd.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(v.jsonLd) }} />}

      {cover && <CoverBanner photo={cover} />}
      <header className="border-b border-border bg-surface-inverse text-text-on-inverse">
        <div className="mx-auto w-full max-w-[var(--container-max)] space-y-4 px-4 py-6 sm:px-8">
          <Breadcrumbs crumbs={v.crumbs} />
          <div className="flex flex-wrap items-start gap-5">
            {v.logo && <div className="relative size-20 shrink-0 overflow-hidden rounded-card bg-white"><Image src={v.logo.url} alt={v.logo.alt} fill sizes="80px" className="object-contain p-1" /></div>}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {v.featured && <span className="rounded-chip bg-featured-bg px-2 py-0.5 text-xs font-bold text-on-light-accent">Featured</span>}
                {v.verification?.level === "gold" && <span className="rounded-chip bg-gold-bg px-2 py-0.5 text-xs font-bold text-on-light-accent">{v.verification.label}</span>}
                {v.verification?.level === "green" && <span className="rounded-chip bg-verified-bg px-2 py-0.5 text-xs font-bold text-verified-text">{v.verification.label}</span>}
              </div>
              <h1 className="font-heading text-3xl font-bold text-text-on-inverse sm:text-4xl">{v.name}</h1>
              <p className="text-text-on-inverse">{[v.categoryName, v.communityName && `${v.communityName}, ${v.state ?? ""}`.replace(/, $/, ""), v.priceLabel].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <ActionButtons v={v} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 sm:px-8">
        {tabs.length > 1 && (
          <nav aria-label="On this page" className="-mx-1 mt-4 overflow-x-auto">
            <ul className="flex gap-1 whitespace-nowrap">
              {tabs.map((t) => <li key={t.id}><a href={`#${t.id}`} className="inline-block rounded-button px-4 py-2 font-semibold text-text hover:bg-surface-muted">{t.label}</a></li>)}
            </ul>
          </nav>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            <section id="about" aria-labelledby="about-h" className="scroll-mt-6 rounded-card bg-surface-card p-5 shadow-card">
              <h2 id="about-h" className="mb-3 font-heading text-xl font-bold">About {v.name}</h2>
              {about ? <p className="whitespace-pre-line text-text-body">{about}</p> : <p className="text-text-muted">No description yet.</p>}
              {v.highlights.length > 0 && <ul className="mt-4 grid gap-1 sm:grid-cols-2">{v.highlights.map((h) => <li key={h} className="flex gap-2 text-text-body"><span aria-hidden="true" className="text-verified-solid">✓</span>{h}</li>)}</ul>}
            </section>
            {v.services.length > 0 && <ServicesCard services={v.services} />}
            {gallery.length > 0 && <Gallery photos={gallery} name={v.name} />}
            {v.deals.length > 0 && <DealsCard deals={v.deals} />}
            {v.faqs.length > 0 && <FaqCard faqs={v.faqs} />}
          </div>
          <aside aria-label="Business information" className="space-y-6">
            <DetailsCard v={v} />
            <HoursCard v={v} />
            <VerificationCard v={v} />
            <p className="px-1 text-sm text-text-muted">See something out of date? <Link href={`/suggest-update?business=${encodeURIComponent(v.slug)}`} className="font-semibold underline underline-offset-4">Suggest an update</Link>.</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
