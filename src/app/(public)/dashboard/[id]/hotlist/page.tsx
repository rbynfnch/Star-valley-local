import type { Metadata } from "next";
import Link from "next/link";
import { formatDay } from "@/lib/admin/format";
import { CATEGORIES, money } from "@/lib/hotlist/model";
import { requireOwnedBusiness } from "@/lib/owner/session";
import { createUserClient } from "@/lib/supabase/server";
import { OfferForm } from "../../OwnerForms";

export const metadata: Metadata = { title: "Hotlist" };
type Item = { id: string; slug: string; title: string; status: string; price_cents: number | null; original_cents: number | null; ends_at: string | null; reject_reason: string | null };
const WORDS: Record<string, string> = { pending: "Waiting for review", published: "On the Hotlist", rejected: "Not approved", archived: "Archived", draft: "Draft" };

export default async function OwnerHotlist({ params }: PageProps<"/dashboard/[id]/hotlist">) {
  const { id } = await params;
  const { business: b, tenant } = await requireOwnedBusiness(id, `/dashboard/${id}/hotlist`);
  const { data } = await (await createUserClient()).from("hotlist_items").select("id,slug,title,status,price_cents,original_cents,ends_at,reject_reason").eq("business_id", id).order("created_at", { ascending: false }).limit(30);
  const items = (data ?? []) as Item[];
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <p className="text-text-body">The Local Hotlist is a short, hand-picked list of the best offers in the valley. We pick offers locals will want: at least $10 or 20% off, a real end date, simple redemption. An editor reviews every offer before it goes live.</p>
        <p className="text-sm text-text-muted"><Link href="/hotlist/submit" className="font-semibold text-link underline">What makes the cut</Link></p>
      </div>
      {b.tier !== "enhanced" ? (
        <div className="rounded-card bg-surface-card p-6 shadow-card"><h2 className="font-heading text-xl font-semibold text-text">Hotlist offers are part of Enhanced</h2><p className="mt-2 text-text-body">Upgrade to submit an offer for the Hotlist.</p><p className="mt-3"><Link href={`/dashboard/${id}/plan`} className="rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover">See the plans</Link></p></div>
      ) : (
        <section aria-labelledby="offer-h" className="rounded-card bg-surface-card p-5 shadow-card">
          <h2 id="offer-h" className="font-heading text-xl font-semibold text-text">Submit an offer</h2>
          <p className="mb-4 mt-1 text-sm text-text-muted">We will add a photo from your listing, or ask you for one, before it goes live.</p>
          <OfferForm business={id} categories={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
        </section>
      )}
      <section aria-labelledby="mine-h" className="rounded-card bg-surface-card p-5 shadow-card">
        <h2 id="mine-h" className="font-heading text-xl font-semibold text-text">Your offers</h2>
        {items.length === 0 ? <p className="mt-2 text-sm text-text-body">Nothing submitted yet.</p> : (
          <ul className="mt-3 divide-y divide-slate-600/15">{items.map((i) => (
            <li key={i.id} className="py-2 text-sm">
              <p className="font-semibold text-text [overflow-wrap:anywhere]">{i.status === "published" ? <Link href={`/hotlist/${i.slug}`} className="text-link underline">{i.title}</Link> : i.title}</p>
              <p className="text-text-muted">{WORDS[i.status] ?? i.status}{i.price_cents !== null ? ` · ${money(i.price_cents)} (was ${money(i.original_cents)})` : ""}{i.ends_at ? ` · ends ${formatDay(i.ends_at, tenant.timezone)}` : ""}</p>
              {i.status === "rejected" && i.reject_reason && <p className="text-text-body">Why: {i.reject_reason}</p>}
            </li>))}</ul>
        )}
      </section>
    </div>
  );
}
