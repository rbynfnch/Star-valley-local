import Link from "next/link";
import { activityView, type Activity } from "@/lib/admin/activity-view";
import { formatDay } from "@/lib/admin/format";
import { nextSteps } from "@/lib/owner/checklist";
import { requireOwnedBusiness } from "@/lib/owner/session";
import { createUserClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/tenant/request-origin";

const Card = ({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) => (
  <section aria-labelledby={id} className="rounded-card bg-surface-card p-5 shadow-card"><h2 id={id} className="font-heading text-lg font-semibold text-text">{title}</h2><div className="mt-3 text-sm text-text-body">{children}</div></section>
);

export default async function Overview({ params }: PageProps<"/dashboard/[id]">) {
  const { id } = await params;
  const { business: b, tenant } = await requireOwnedBusiness(id, `/dashboard/${id}`);
  const supabase = await createUserClient(), tz = tenant.timezone;
  const [act, content, origin] = await Promise.all([
    supabase.rpc("owner_business_activity", { p_tenant: tenant.id, p_business: id, p_days: 30 }),
    supabase.rpc("business_content", { p_tenant: tenant.id, p_business: id }),
    requestOrigin(),
  ]);
  const perf = act.error || !act.data ? null : activityView(act.data as Activity);
  const c = (content.data ?? null) as { hours: unknown[]; photos: { role: string }[] } | null;
  const row = (await supabase.from("businesses").select("website,description").eq("id", id).maybeSingle()).data as { website: string | null; description: string | null } | null;
  const steps = nextSteps({ id, tier: b.tier, verification: b.verification_level, hasHours: (c?.hours.length ?? 0) > 0, hasLogo: !!c?.photos.some((p) => p.role === "logo"), hasCover: !!c?.photos.some((p) => p.role === "cover"),
    hasWebsite: !!row?.website, hasDescription: !!row?.description, postcardPending: b.has_postcard_pending, newLeads: b.new_leads });
  const todo = steps.filter((s) => !s.done);
  const verified = b.verification_level !== "none";
  const badgeUrl = origin ? `${origin}/badge/${b.slug}` : null;
  const profileUrl = origin ? `${origin}/business/${b.slug}` : null;
  const snippet = badgeUrl && profileUrl ? `<a href="${profileUrl}"><img src="${badgeUrl}" alt="Verified on ${tenant.name}" width="220" height="64"></a>` : null;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card title="Last 30 days" id="perf-h">
          {!perf || perf.empty ? <p>Nothing recorded yet. Views and taps are counted from the day tracking started; staff, owners and bots are not counted.</p> : (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {perf.rows.filter((r) => r.count > 0 || ["profile_view", "phone_click", "website_click", "directions_click"].includes(r.key)).map((r) => (
                <div key={r.key}><dt className="text-text-muted">{r.label}</dt><dd><span className="font-heading text-3xl font-bold text-text">{r.count.toLocaleString("en-US")}</span>{r.change && <span className="ml-2 text-xs text-text-muted">{r.change}</span>}</dd></div>
              ))}
            </dl>
          )}
          {perf && perf.topSearches.length > 0 && <p className="mt-4"><strong className="text-text">People found you searching for:</strong> {perf.topSearches.map((s) => s.query).join(", ")}</p>}
        </Card>
        <Card title="What to do next" id="next-h">
          {todo.length === 0 ? <p>Everything on the list is done. Nice work.</p> : (
            <ul className="space-y-2">{todo.map((s) => <li key={s.key}><Link href={s.href} className="font-semibold text-link underline underline-offset-4">{s.text}</Link></li>)}</ul>
          )}
        </Card>
      </div>
      <div className="space-y-5">
        <Card title="Verification" id="ver-h">
          <p className="font-semibold text-text">{b.verification_level === "gold" ? "Gold Verified" : b.verification_level === "green" ? "Verified" : "Not verified yet"}</p>
          {verified && b.reverify_due_at && <p className="mt-1">Re-verify by {formatDay(b.reverify_due_at, tz)}.</p>}
          {b.verification_level === "green" && <p className="mt-2">{b.has_postcard_pending ? <>A verification postcard is on its way. <Link href="/verify/postcard" className="font-semibold text-link underline">Enter its code</Link> when it arrives.</> : "Ask us for a postcard with a one-time code to earn Gold Verified."}</p>}
          {!verified && <p className="mt-2"><Link href="/list-your-business" className="font-semibold text-link underline">Verify your business</Link> by text message or email link.</p>}
        </Card>
        <Card title="Your plan" id="plan-h">
          <p className="font-semibold text-text">{b.tier === "enhanced" ? "Enhanced" : "Free"}{b.listing_ends_at ? ` · renews or ends ${formatDay(b.listing_ends_at, tz)}` : ""}</p>
          <p className="mt-2"><Link href={`/dashboard/${id}/plan`} className="font-semibold text-link underline">{b.tier === "enhanced" ? "Plan and billing" : "See what Enhanced adds"}</Link></p>
        </Card>
        {verified && snippet && (
          <Card title="Your verified badge" id="badge-h">
            <p>Show customers you are verified. Put this on your website; it links to your listing.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {badgeUrl && <img src={`/badge/${b.slug}`} alt={`Verified on ${tenant.name}`} width={220} height={64} className="mt-3 h-auto w-[220px]" />}
            <label htmlFor="embed" className="mt-3 block font-medium text-text">Embed code</label>
            <textarea id="embed" readOnly rows={3} value={snippet} className="mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-2 py-1.5 font-mono text-xs text-text" />
            <p className="mt-2"><a href={`/badge/${b.slug}?download=1`} className="font-semibold text-link underline">Download the badge (SVG)</a></p>
          </Card>
        )}
      </div>
    </div>
  );
}
