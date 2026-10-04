import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDirectoryData } from "@/lib/directory/data";
import { parseSlug } from "@/lib/claim/input";
import { paymentLink, priceLabel, productFor, scopeRows, totalSpots, type ScopeRow } from "@/lib/pricing/view";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant/resolve";
import { WaitlistButton } from "./WaitlistButton";

export const metadata: Metadata = { title: "Plans and pricing", description: "Free, Enhanced and Featured listings, with live Featured availability." };

const Card = ({ title, price, children }: { title: string; price?: string; children: React.ReactNode }) => (
  <section className="rounded-card bg-surface-card p-5 shadow-card">
    <h2 className="font-heading text-xl font-semibold text-text">{title}</h2>
    {price && <p className="mt-1 text-lg font-semibold text-text">{price}</p>}
    <div className="mt-3 space-y-2 text-sm text-text-body">{children}</div>
  </section>
);
const Buy = ({ href, label }: { href: string | null; label: string }) => href
  ? <a href={href} rel="noopener" className="inline-block rounded-button bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-hover">{label}</a>
  : <p className="text-text-muted">Online checkout is not open yet.</p>;

export default async function PricingPage({ searchParams }: PageProps<"/pricing">) {
  const sp = await searchParams;
  const tenant = await getTenant();
  if (!tenant) notFound();
  const data = getDirectoryData();
  const [products, scarcity] = await Promise.all([data.products(tenant.id), data.scarcity(tenant.id)]);
  const enhancedMonthly = products.find((p) => p.kind === "listing" && p.interval === "month");
  const enhancedYearly = products.find((p) => p.kind === "listing" && p.interval === "year");
  const featured = productFor(products, "placement", "category");

  // Is a signed-in OWNER looking at their own business? Only then do purchase links carry their business id.
  const slug = parseSlug(typeof sp.business === "string" ? sp.business : undefined);
  const raw = slug ? await data.businessProfile(tenant.id, slug) : null;
  let owner: { id: string; slug: string; name: string; email: string | null; verified: boolean; enhanced: boolean; categoryId: string | null; communityId: string | null } | null = null;
  if (raw && authConfigured()) {
    const supabase = await createUserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: rows } = await supabase.from("business_owners").select("business_id").eq("business_id", raw.business.id).limit(1);
      if (rows && rows.length > 0) owner = { id: raw.business.id, slug: raw.business.slug, name: raw.business.name, email: user.email ?? null, verified: raw.business.verification_level !== "none", enhanced: raw.tier === "enhanced", categoryId: raw.business.primary_category_id, communityId: raw.business.home_community_id };
    }
  }
  const cats = scopeRows(scarcity.categories), coms = scopeRows(scarcity.communities);
  const top = totalSpots(scarcity);
  const buyHref = (url: string | null | undefined) => paymentLink(url, owner?.id, owner?.email);
  const claimHref = raw ? `/list-your-business?claim=${encodeURIComponent(raw.business.slug)}` : "/list-your-business";

  const slotLine = (label: string, row: { text: string; full: boolean }, slot: "homepage" | "category" | "community" | "things_to_do", scope?: string | null) => {
    const product = productFor(products, "placement", slot);
    return (
      <li key={`${slot}-${scope ?? ""}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-600/15 py-3">
        <div><p className="font-medium text-text">{label}</p><p className={row.full ? "text-sm font-semibold text-brand-text" : "text-sm text-text-body"}>{row.text}</p></div>
        {owner && owner.verified && owner.enhanced && (row.full
          ? <WaitlistButton business={owner.slug} slot={slot} scope={scope ?? undefined} label={label} />
          : <Buy href={buyHref(product?.payment_link_url)} label="Get this spot" />)}
      </li>
    );
  };
  const find = (rows: ScopeRow[], id: string | null) => rows.find((r) => r.id === id);

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
      <h1 className="font-heading text-3xl font-semibold text-text">Plans and pricing</h1>
      <p className="mt-3 max-w-2xl text-text-body">Every business can be listed for free. Enhanced gives a fuller profile. Featured puts a verified business in front of people browsing its category, community or the home page, and there is only room for a few.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card title="Free" price="$0">
          <p>Name, category, community, address, phone, website, hours and a short description, with Call, Website and Directions buttons.</p>
        </Card>
        <Card title="Enhanced" price={enhancedMonthly ? `${priceLabel(enhancedMonthly)}${enhancedYearly ? ` or ${priceLabel(enhancedYearly)}` : ""}` : undefined}>
          <p>A fuller profile: a longer description and highlights, more photos, a services list, social links, deals and a public email address.</p>
          <p className="text-text-muted">Coming soon: a Request a Quote button with a leads inbox.</p>
          {owner ? (
            <div className="flex flex-wrap gap-3 pt-1">
              {enhancedMonthly && <Buy href={buyHref(enhancedMonthly.payment_link_url)} label={`Monthly ${priceLabel(enhancedMonthly)}`} />}
              {enhancedYearly && <Buy href={buyHref(enhancedYearly.payment_link_url)} label={`Yearly ${priceLabel(enhancedYearly)}`} />}
            </div>
          ) : <p className="pt-1">To upgrade, <Link href={claimHref} className="font-semibold text-link underline">claim your business</Link> first, then come back here.</p>}
          {owner?.enhanced && <p role="status" className="font-medium text-green-800">{owner.name} already has Enhanced.</p>}
        </Card>
        <Card title="Featured" price={featured ? `${priceLabel(featured)} per spot` : undefined}>
          <p>A limited, rotating placement for verified businesses with an Enhanced listing. Spots are limited per category, community and the home page, and each one has a start and end date.</p>
          <p>Right now: {top.homepage.text.toLowerCase()} on the home page, {top.things_to_do.text.toLowerCase()} on Things to Do.</p>
        </Card>
      </div>

      <section className="mt-10" aria-labelledby="avail-h">
        <h2 id="avail-h" className="font-heading text-2xl font-semibold text-text">Featured availability</h2>
        <p className="mt-1 text-sm text-text-muted">Live counts. When a spot is full, a verified owner with an Enhanced listing can join the waitlist.</p>

        {owner && (
          <div className="mt-4 rounded-card bg-surface-card p-5 shadow-card">
            <h3 className="font-heading text-lg font-semibold text-text">Spots for {owner.name}</h3>
            {!owner.verified && <p className="mt-2 text-sm text-text-body">Featured is for verified businesses. <Link href={`/business/${owner.slug}`} className="font-semibold text-link underline">See your verification status</Link>.</p>}
            {owner.verified && !owner.enhanced && <p className="mt-2 text-sm text-text-body">Featured is added on top of an Enhanced listing. Upgrade to Enhanced above first.</p>}
            {owner.verified && owner.enhanced && (
              <ul className="mt-2">
                {find(cats, owner.categoryId) && slotLine(`In ${find(cats, owner.categoryId)!.name}`, find(cats, owner.categoryId)!, "category", owner.categoryId)}
                {find(coms, owner.communityId) && slotLine(`In ${find(coms, owner.communityId)!.name}`, find(coms, owner.communityId)!, "community", owner.communityId)}
                {slotLine("On the home page", top.homepage, "homepage")}
                {slotLine("On Things to Do", top.things_to_do, "things_to_do")}
              </ul>
            )}
          </div>
        )}

        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-heading text-lg font-semibold text-text">Categories</h3>
            <ul className="mt-2 divide-y divide-slate-600/15 text-sm">{cats.map((c) => <li key={c.id} className="flex justify-between gap-3 py-2"><span className="text-text">{c.name}</span><span className={c.full ? "font-semibold text-brand-text" : "text-text-body"}>{c.text}</span></li>)}</ul>
          </div>
          <div>
            <h3 className="font-heading text-lg font-semibold text-text">Communities and pages</h3>
            <ul className="mt-2 divide-y divide-slate-600/15 text-sm">
              <li className="flex justify-between gap-3 py-2"><span className="text-text">Home page</span><span className={top.homepage.full ? "font-semibold text-brand-text" : "text-text-body"}>{top.homepage.text}</span></li>
              <li className="flex justify-between gap-3 py-2"><span className="text-text">Things to Do</span><span className={top.things_to_do.full ? "font-semibold text-brand-text" : "text-text-body"}>{top.things_to_do.text}</span></li>
              {coms.map((c) => <li key={c.id} className="flex justify-between gap-3 py-2"><span className="text-text">{c.name}</span><span className={c.full ? "font-semibold text-brand-text" : "text-text-body"}>{c.text}</span></li>)}
            </ul>
          </div>
        </div>
      </section>
      <p className="mt-10 text-xs text-text-muted">Prices are per month or year as shown. A paid Featured spot is activated by our team after payment and runs for a set period, then ends automatically.</p>
    </main>
  );
}
