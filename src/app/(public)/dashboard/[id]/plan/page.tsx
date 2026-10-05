import type { Metadata } from "next";
import Link from "next/link";
import { formatDay } from "@/lib/admin/format";
import { dollars } from "@/lib/pricing/view";
import { requireOwnedBusiness } from "@/lib/owner/session";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Plan and billing" };
type Listing = { tier: string; status: string; source: string; starts_at: string; ends_at: string | null };
type Pay = { id: string; status: string; amount_cents: number; channel: string; created_at: string; notes: string | null };
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="rounded-card bg-surface-card p-5 shadow-card"><h2 className="font-heading text-lg font-semibold text-text">{title}</h2><div className="mt-3 space-y-2 text-sm text-text-body">{children}</div></section>;

export default async function Plan({ params }: PageProps<"/dashboard/[id]/plan">) {
  const { id } = await params;
  const { business: b, tenant } = await requireOwnedBusiness(id, `/dashboard/${id}/plan`);
  const supabase = await createUserClient(), tz = tenant.timezone;
  const [listings, pays, placements] = await Promise.all([
    supabase.from("listings").select("tier,status,source,starts_at,ends_at").eq("business_id", id).order("starts_at", { ascending: false }).limit(5),
    supabase.from("payments").select("id,status,amount_cents,channel,created_at,notes").eq("business_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("placements").select("slot_type,status,start_at,end_at,source").eq("business_id", id).order("start_at", { ascending: false }).limit(10),
  ]);
  const current = ((listings.data ?? []) as Listing[]).find((l) => l.status === "active");
  const payments = (pays.data ?? []) as Pay[];
  const spots = (placements.data ?? []) as { slot_type: string; status: string; start_at: string; end_at: string; source: string }[];
  const buy = `/pricing?business=${encodeURIComponent(b.slug)}`;
  return (
    <div className="grid max-w-4xl gap-5 md:grid-cols-2">
      <Card title="Your plan">
        <p className="font-heading text-2xl font-bold text-text">{b.tier === "enhanced" ? "Enhanced" : "Free"}</p>
        {current ? <p>{current.source === "founding_member" || current.source === "comp" ? "Included with your founding membership" : "Active"}{current.ends_at ? ` until ${formatDay(current.ends_at, tz)}` : ""}.</p> : <p>A Free listing has your name, category, community, address, phone, website, hours and a short description, with Call, Website and Directions buttons.</p>}
        <p><Link href={buy} className="inline-block rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover">{b.tier === "enhanced" ? "Plans, renewals and Featured spots" : "Upgrade to Enhanced"}</Link></p>
        {b.tier !== "enhanced" && <p>Enhanced adds more photos, services, social links, deals, a longer description, the Request a Quote button and your requests inbox.</p>}
      </Card>
      <Card title="Featured spots">
        {spots.length === 0 ? <p>You are not Featured. A Featured spot puts your business at the top of the homepage, a category, a community or Things to Do. It needs an Enhanced listing and a verified business, and spots are limited.</p> : (
          <ul className="space-y-1">{spots.map((s, i) => <li key={i}>{s.slot_type.replace(/_/g, " ")}: {s.status === "active" || s.status === "scheduled" ? `${formatDay(s.start_at, tz)} to ${formatDay(s.end_at, tz)}` : s.status}</li>)}</ul>
        )}
        <p><Link href={buy} className="font-semibold text-link underline">See what is available and join a waitlist</Link></p>
      </Card>
      <div className="md:col-span-2">
        <Card title="Payments">
          {payments.length === 0 ? <p>No payments yet.</p> : (
            <table className="w-full text-left"><caption className="sr-only">Your payments</caption><thead><tr className="text-text-muted"><th scope="col" className="py-1 font-medium">Date</th><th scope="col" className="py-1 font-medium">Amount</th><th scope="col" className="py-1 font-medium">Status</th></tr></thead>
              <tbody>{payments.map((p) => <tr key={p.id} className="border-t border-border"><td className="py-1.5">{formatDay(p.created_at, tz)}</td><td className="py-1.5">{dollars(p.amount_cents)}</td><td className="py-1.5">{p.status.replace(/_/g, " ")}{p.channel === "manual" ? " (recorded by us)" : ""}</td></tr>)}</tbody></table>
          )}
          <p className="pt-2 text-text-muted">To change or cancel your plan, or if a payment looks wrong, <Link href="/suggest-update" className="font-semibold text-link underline">get in touch</Link>. Self-serve cancellation and invoices are coming.</p>
        </Card>
      </div>
    </div>
  );
}
