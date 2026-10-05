import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";
import { COMM_KINDS, OUTCOMES, isUuid } from "@/lib/admin/detail-input";
import { STAGES } from "@/lib/admin/list-params";
import { formatDay, formatStamp, label } from "@/lib/admin/format";
import { telHref } from "@/lib/format";
import { activityView, type Activity } from "@/lib/admin/activity-view";
import { EntryForm, StageForm } from "./Forms";
import { StatusForm } from "./StatusForm";
import { ClaimLinkCard, type ClaimOverview } from "./ClaimLinkCard";
import { ActivateListingForm, ActivatePlacementForm, EndButton, type Product } from "@/components/admin/BillingForms";
import { activateListing, activatePlacement, addToWaitlist, endListing, endPlacement } from "../../placements/actions";

export const metadata: Metadata = { title: "Business" };

type Src = "import" | "owner" | "admin";
interface Detail {
  business: Record<string, string | null> & { id: string; slug: string; name: string; status: string; verification_level: "none" | "green" | "gold" };
  provenance: { field: string; source: Src; updated_at: string }[];
  crm: { lead_stage: string; services_interest: string[]; next_action: string | null; next_action_at: string | null; lost_reason: string | null } | null;
  listing: { tier: string; status: string; source: string; starts_at: string; ends_at: string | null } | null;
  placements: { id: string; slot_type: string; scope: string | null; status: string; source: string; start_at: string; end_at: string }[];
  proofs: { kind: string; verified_at: string; revoked_at: string | null }[];
  owners: number;
  contacts: { id: string; name: string; role: string | null; email: string | null; phone: string | null; is_primary: boolean }[];
  opportunities: { id: string; service: string; stage: string; value_cents: number | null; expected_close: string | null }[];
  communications: { id: string; kind: string; outcome: string | null; subject: string | null; body: string | null; follow_up_at: string | null; occurred_at: string; by_me: boolean }[];
  indicators: { has_website: boolean; has_social: boolean; has_google_profile: boolean };
}
const SOURCE_WORDS: Record<Src, string> = { import: "Imported", owner: "Owner edited", admin: "Staff edited" };
const FIELDS: [string, string][] = [["name", "Name"], ["address_line1", "Street address"], ["city", "City"], ["postal_code", "ZIP"], ["phone", "Phone"], ["website", "Website"], ["email", "Email"], ["short_description", "Short description"], ["description", "Description"], ["hours_note", "Hours note"]];
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-card bg-surface-card p-4 shadow-card"><h2 className="font-heading text-lg font-semibold text-text">{title}</h2><div className="mt-3 text-sm">{children}</div></section>
);
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-text-subtle">{children}</p>;

export default async function BusinessDetail({ params, searchParams }: PageProps<"/admin/businesses/[id]">) {
  const staff = await requireArea("businesses");
  const { id } = await params;
  const saved = (await searchParams).saved === "1";
  if (!isUuid(id)) notFound();
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("admin_business_detail", { p_tenant: staff.tenant.id, p_business: id });
  if (error) throw new Error("Could not load this business.");
  if (!data) notFound();
  const d = data as Detail;
  const act = await supabase.rpc("admin_business_activity", { p_tenant: staff.tenant.id, p_business: id, p_days: 30 });      // a failure here only hides the card
  const perf = act.error || !act.data ? null : activityView(act.data as Activity);
  const co = await supabase.rpc("admin_claim_overview", { p_tenant: staff.tenant.id, p_business: id });      // a failure here only hides the card
  const claimInfo = co.error || !co.data ? null : (co.data as ClaimOverview);
  const [cats, coms, prods] = staff.role === "admin" ? await Promise.all([
    supabase.from("categories").select("id,name").eq("tenant_id", staff.tenant.id).eq("is_active", true).order("sort_order"),
    supabase.from("communities").select("id,name").eq("tenant_id", staff.tenant.id).order("sort_order"),
    supabase.from("tenant_products").select("code,name,kind,interval,amount_cents").eq("tenant_id", staff.tenant.id).eq("is_active", true).order("amount_cents"),
  ]) : [null, null, null];
  const b = d.business;
  const tz = staff.tenant.timezone;
  const src = new Map(d.provenance.map((p) => [p.field, p]));
  const published = b.status === "unclaimed" || b.status === "claimed";
  const tel = telHref(b.phone);
  const stage = d.crm?.lead_stage ?? "new";

  return (
    <>
      <p className="text-sm"><Link href="/admin/businesses" className="text-link underline">← Businesses</Link></p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-text [overflow-wrap:anywhere]">{b.name}</h1>
          <p className="text-sm text-text-muted">{[b.category, b.community].filter(Boolean).join(" · ") || "No category or community yet"} · {label(b.status)}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {tel && <a href={tel} className="rounded-button border border-slate-600 px-3 py-1.5 font-medium text-link">Call {b.phone}</a>}
          <Link href={`/admin/businesses/${b.id}/edit`} className="rounded-button bg-brand px-3 py-1.5 font-semibold text-brand-contrast hover:bg-brand-hover">Edit</Link>
          <Link href={`/admin/businesses/${b.id}/content`} className="rounded-button border border-slate-600 px-3 py-1.5 font-medium text-link">Edit content</Link>
          {published && <a href={`/business/${b.slug}`} target="_blank" rel="noopener" className="rounded-button border border-slate-600 px-3 py-1.5 font-medium text-link">View public page</a>}
        </div>
      </div>

      {saved && <p role="status" className="mt-4 rounded-card bg-surface-muted p-3 text-sm font-medium text-green-800">Changes saved.</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card title="Add to the log">
            <EntryForm business={b.id} kinds={COMM_KINDS.map((k) => ({ value: k, label: label(k) }))} outcomes={OUTCOMES.map((o) => ({ value: o, label: label(o) }))} />
          </Card>
          <Card title="Activity">
            {d.communications.length === 0 ? <Empty>Nothing logged yet.</Empty> : (
              <ol className="space-y-3">
                {d.communications.map((c) => (
                  <li key={c.id} className="border-l-2 border-slate-600/40 pl-3">
                    <p className="font-medium text-text [overflow-wrap:anywhere]">{label(c.kind)}{c.outcome ? ` · ${label(c.outcome)}` : ""}{c.subject ? ` · ${c.subject}` : ""}</p>
                    {c.body && <p className="mt-0.5 whitespace-pre-wrap text-text-body [overflow-wrap:anywhere]">{c.body}</p>}
                    <p className="mt-0.5 text-xs text-text-muted">{formatStamp(c.occurred_at, tz)}{c.by_me ? " · you" : ""}{c.follow_up_at ? ` · follow up ${formatDay(c.follow_up_at, tz)}` : ""}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card title="Profile data">
            <p className="mb-2 text-xs text-text-muted">The word beside each value says who last wrote it. A re-import never overwrites owner or staff edits.</p>
            <dl className="divide-y divide-slate-600/15">
              {FIELDS.map(([k, name]) => {
                const v = b[k]; const p = src.get(k);
                return (
                  <div key={k} className="grid grid-cols-3 gap-2 py-2">
                    <dt className="text-text-muted">{name}</dt>
                    <dd className="col-span-2 break-words text-text">{v ? v : <span className="text-text-subtle">Not set</span>}
                      {p && <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-body">{SOURCE_WORDS[p.source]} · {formatDay(p.updated_at, tz)}</span>}</dd>
                  </div>
                );
              })}
            </dl>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          {claimInfo && (
            <Card title="Claim link">
              <ClaimLinkCard business={b.id} overview={claimInfo} stamp={Object.fromEntries(claimInfo.invites.map((i, n) => [n, formatStamp(i.created_at, tz)]))} />
            </Card>
          )}
          <Card title="Listing performance (30 days)">
            {!perf ? <Empty>Not available right now.</Empty> : perf.empty ? <Empty>Nothing recorded yet. Views and taps are counted from the day tracking started; staff, owners and bots are not counted.</Empty> : (
              <>
                {perf.pitch && <p className="mb-3 rounded-card bg-surface-muted p-3 text-text">{perf.pitch}</p>}
                <dl className="space-y-1">
                  {perf.rows.map((r) => (
                    <div key={r.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <dt className="text-text-muted">{r.label}</dt>
                      <dd className="text-text"><strong>{r.count.toLocaleString("en-US")}</strong>{r.change && <span className="ml-2 text-xs text-text-muted">{r.change}</span>}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-x-3 border-t border-border pt-1"><dt className="text-text-muted">Different visitors</dt><dd className="text-text"><strong>{perf.visitors.toLocaleString("en-US")}</strong></dd></div>
                </dl>
                {perf.topSearches.length > 0 && (
                  <div className="mt-3">
                    <p className="font-medium text-text">Searches that showed it</p>
                    <ul className="mt-1 space-y-0.5 text-text-muted">{perf.topSearches.map((q) => <li key={q.query} className="[overflow-wrap:anywhere]">&ldquo;{q.query}&rdquo; · {q.n}</li>)}</ul>
                  </div>
                )}
              </>
            )}
          </Card>
          <Card title="Visibility">
            <p className="mb-2 text-text-body">{published ? "Live on the public site." : b.status === "archived" ? "Archived (not public)." : "Hidden prospect (not public)."}</p>
            <StatusForm business={b.id} status={b.status} />
          </Card>
          <Card title="Lead">
            <StageForm business={b.id} stage={stage} lostReason={d.crm?.lost_reason ?? null} stages={STAGES.map((s) => ({ value: s, label: label(s) }))} />
            {d.crm?.next_action && <p className="mt-3 text-text-body">Next: {d.crm.next_action}{d.crm.next_action_at ? ` (${formatDay(d.crm.next_action_at, tz)})` : ""}</p>}
            {d.crm && d.crm.services_interest.length > 0 && <p className="mt-2 text-text-body">Interested in: {d.crm.services_interest.map(label).join(", ")}</p>}
          </Card>
          <Card title="Verification and tier">
            <p>{b.verification_level === "none" ? "Not verified" : `${label(b.verification_level)} verified`}{b.verified_at ? ` · since ${formatDay(b.verified_at, tz)}` : ""}</p>
            {b.reverify_due_at && <p className="text-text-body">Re-verify by {formatDay(b.reverify_due_at, tz)}</p>}
            <p className="mt-1 text-text-body">{d.owners === 0 ? "Unclaimed (no owner)" : `${d.owners} owner${d.owners === 1 ? "" : "s"}`}{b.claimed_at ? ` · claimed ${formatDay(b.claimed_at, tz)}` : ""}</p>
            {d.proofs.length > 0 && <ul className="mt-2 list-disc pl-5 text-text-body">{d.proofs.map((p, i) => <li key={i}>{label(p.kind)} · {formatDay(p.verified_at, tz)}{p.revoked_at ? " (revoked)" : ""}</li>)}</ul>}
            <p className="mt-3 font-medium text-text">Listing</p>
            {d.listing ? <p className="text-text-body">{label(d.listing.tier)} · {label(d.listing.status)} · {label(d.listing.source)}{d.listing.ends_at ? ` · ends ${formatDay(d.listing.ends_at, tz)}` : ""}</p> : <Empty>Free listing (no paid listing).</Empty>}
          </Card>
          <Card title="Placements">
            {d.placements.length === 0 ? <Empty>None.</Empty> : (
              <ul className="space-y-2">{d.placements.map((p) => <li key={p.id}><span className="font-medium text-text">{label(p.slot_type)}{p.scope ? ` · ${p.scope}` : ""}</span><br /><span className="text-text-body">{label(p.status)} · {label(p.source)} · {formatDay(p.start_at, tz)} to {formatDay(p.end_at, tz)}</span></li>)}</ul>
            )}
          </Card>
          <Card title="Plan and placements">
            {staff.role !== "admin" ? <p className="text-text-muted">Only admins can activate or end plans and placements.</p> : !published ? <p className="text-text-muted">Publish this business first. Only public businesses can have a paid plan.</p> : (
              <div className="space-y-5">
                <section aria-labelledby="enh-h"><h3 id="enh-h" className="font-semibold text-text">Enhanced listing</h3>
                  <p className="mb-2 text-text-body">{d.listing && d.listing.status === "active" ? `Active${d.listing.ends_at ? `, ends ${formatDay(d.listing.ends_at, tz)}` : ", no end date"}.` : "Not active."}</p>
                  <ActivateListingForm action={activateListing} business={b.id} products={(prods?.data ?? []) as Product[]} running={!!d.listing && d.listing.status === "active"} />
                  {d.listing && d.listing.status === "active" && <div className="mt-2"><EndButton action={endListing} fields={{ business: b.id }} label="End Enhanced now" confirmLabel="End the Enhanced listing" /></div>}
                </section>
                <section aria-labelledby="feat-h" className="border-t border-slate-600/20 pt-4"><h3 id="feat-h" className="font-semibold text-text">Featured placement</h3>
                  <p className="mb-2 text-text-body">Needs a verified business{" "}{b.verification_level === "none" ? "(not verified yet)" : "(verified)"}; paid placements also need an active Enhanced listing.</p>
                  <ActivatePlacementForm action={activatePlacement} waitlistAction={addToWaitlist} business={b.id} products={(prods?.data ?? []) as Product[]} categories={cats?.data ?? []} communities={coms?.data ?? []} />
                </section>
                {d.placements.filter((p) => p.status === "active" && new Date(p.end_at) > new Date()).length > 0 && (
                  <section aria-labelledby="cur-h" className="border-t border-slate-600/20 pt-4"><h3 id="cur-h" className="font-semibold text-text">Current Featured spots</h3>
                    <ul className="mt-2 space-y-2">{d.placements.filter((p) => p.status === "active" && new Date(p.end_at) > new Date()).map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2"><span className="text-text-body">{label(p.slot_type)}{p.scope ? ` · ${p.scope}` : ""} · ends {formatDay(p.end_at, tz)}</span><EndButton action={endPlacement} fields={{ id: p.id, business: b.id }} label="End now" confirmLabel="End this placement" /></li>)}</ul>
                  </section>
                )}
              </div>
            )}
          </Card>
          <Card title="Marketing opportunities">
            <ul className="space-y-1">
              <li>{d.indicators.has_website ? "Has a website" : "No website listed: website opportunity"}</li>
              <li>{d.indicators.has_social ? "Has social links" : "No social links: social opportunity"}</li>
              <li>{d.indicators.has_google_profile ? "Google profile linked" : "No Google profile linked"}</li>
            </ul>
          </Card>
          <Card title="Contacts">
            {d.contacts.length === 0 ? <Empty>No contacts yet.</Empty> : (
              <ul className="space-y-2">{d.contacts.map((c) => <li key={c.id}><span className="font-medium text-text">{c.name}</span>{c.role ? ` · ${c.role}` : ""}{c.is_primary ? " · primary" : ""}<br />
                <span className="text-text-body">{c.phone ? <a className="text-link underline" href={telHref(c.phone) ?? undefined}>{c.phone}</a> : null}{c.phone && c.email ? " · " : ""}{c.email ?? ""}</span></li>)}</ul>
            )}
          </Card>
          <Card title="Opportunities">
            {d.opportunities.length === 0 ? <Empty>None yet.</Empty> : (
              <ul className="space-y-1">{d.opportunities.map((o) => <li key={o.id}>{label(o.service)} · {label(o.stage)}{o.value_cents != null ? ` · $${(o.value_cents / 100).toLocaleString("en-US")}` : ""}{o.expected_close ? ` · close ${o.expected_close}` : ""}</li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
