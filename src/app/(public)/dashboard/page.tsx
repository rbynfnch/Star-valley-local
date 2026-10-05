import Link from "next/link";
import { requireOwner } from "@/lib/owner/session";
import { formatDay } from "@/lib/admin/format";

const TIER = { free: "Free", enhanced: "Enhanced" } as const;
const VERIFY = { none: "Not verified yet", green: "Verified", gold: "Gold Verified" } as const;

export default async function Dashboard() {
  const ctx = await requireOwner("/dashboard");
  const tz = ctx.tenant.timezone;
  return (
    <>
      <h1 className="font-heading text-3xl font-bold text-text">Your businesses</h1>
      <p className="mt-1 text-text-muted">Signed in as {ctx.email}.</p>
      {ctx.businesses.length === 0 ? (
        <div className="mt-6 max-w-2xl space-y-3 rounded-card bg-surface-card p-6 shadow-card">
          <h2 className="font-heading text-xl font-semibold text-text">No business on this account yet</h2>
          <p className="text-text-body">Find your business in the directory and choose &ldquo;Claim this business&rdquo;. We confirm it is yours by text message or an emailed link, and then it appears here.</p>
          <p className="flex flex-wrap gap-3">
            <Link href="/businesses" className="rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover">Find your business</Link>
            <Link href="/suggest-business" className="rounded-button border border-slate-600 px-5 py-2 font-semibold text-text">Not listed? Suggest it</Link>
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-5 md:grid-cols-2">
          {ctx.businesses.map((b) => (
            <li key={b.id} className="flex flex-col gap-3 rounded-card bg-surface-card p-5 shadow-card">
              <div>
                <h2 className="font-heading text-xl font-bold text-text [overflow-wrap:anywhere]"><Link href={`/dashboard/${b.id}`} className="underline-offset-4 hover:underline">{b.name}</Link></h2>
                <p className="text-sm text-text-muted">{b.city ?? ""}</p>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-text-muted">Plan</dt><dd className="font-semibold text-text">{TIER[b.tier]}</dd></div>
                <div><dt className="text-text-muted">Verification</dt><dd className="font-semibold text-text">{VERIFY[b.verification_level]}</dd></div>
                <div><dt className="text-text-muted">New requests</dt><dd className="font-semibold text-text">{b.new_leads}</dd></div>
                {b.verified_at && <div><dt className="text-text-muted">Re-verify by</dt><dd className="font-semibold text-text">{formatDay(b.reverify_due_at, tz)}</dd></div>}
              </dl>
              <p className="mt-auto flex flex-wrap gap-3 text-sm">
                <Link href={`/dashboard/${b.id}`} className="rounded-button bg-brand px-4 py-2 font-semibold text-brand-contrast hover:bg-brand-hover">Open dashboard</Link>
                <Link href={`/business/${b.slug}`} className="rounded-button border border-slate-600 px-4 py-2 font-semibold text-text">View public page</Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
