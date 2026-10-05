import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/lib/admin/session";
import { buildOverview, type RawOverview } from "@/lib/admin/placements-view";
import { createUserClient } from "@/lib/supabase/server";
import { PlacementsBoard } from "./PlacementsBoard";

export const metadata: Metadata = { title: "Placements" };

export default async function PlacementsPage() {
  const staff = await requireArea("placements");
  const supabase = await createUserClient();
  const [ov, prods] = await Promise.all([
    supabase.rpc("admin_placements_overview", { p_tenant: staff.tenant.id }),
    supabase.from("tenant_products").select("code,name,kind,interval,amount_cents").eq("tenant_id", staff.tenant.id).eq("is_active", true).order("amount_cents"),
  ]);
  const view = buildOverview((ov.data ?? { slots: [], listings: [] }) as RawOverview, staff.tenant.timezone);
  const canEdit = staff.role === "admin";
  return (
    <>
      <h1 className="font-heading text-2xl font-semibold text-text">Placements</h1>
      <p className="mt-1 text-sm text-text-muted">Who holds each Featured spot, when it ends, and who is waiting. To sell one, open the business and use its Plan and placements card.{!canEdit && " Only admins can change placements."}</p>
      {ov.error && <p role="alert" className="mt-4 text-sm font-medium text-danger-text">Could not load the placements.</p>}

      <section aria-labelledby="exp-h" className="mt-6 rounded-card bg-surface-card p-4 shadow-card">
        <h2 id="exp-h" className="font-heading text-lg font-semibold text-text">Ending in the next 30 days</h2>
        {view.expiring.length === 0 ? <p className="mt-2 text-sm text-text-muted">Nothing ends soon.</p> : (
          <ul className="mt-2 divide-y divide-slate-600/15 text-sm">
            {view.expiring.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><Link href={`/admin/businesses/${e.businessId}`} className="font-medium text-link underline">{e.name}</Link> <span className="text-text-muted">· {e.kind}</span></span>
                <span className="text-text-body">{e.ends} ({e.daysLeft} {e.daysLeft === 1 ? "day" : "days"}){e.autoRenews ? " · renews itself" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PlacementsBoard slots={view.slots} products={(prods.data ?? []) as { code: string; name: string; kind: string; interval: string | null; amount_cents: number }[]} canEdit={canEdit} />

      <section aria-labelledby="enh-h" className="mt-6 rounded-card bg-surface-card p-4 shadow-card">
        <h2 id="enh-h" className="font-heading text-lg font-semibold text-text">Enhanced listings ({view.listings.length})</h2>
        {view.listings.length === 0 ? <p className="mt-2 text-sm text-text-muted">None yet.</p> : (
          <ul className="mt-2 divide-y divide-slate-600/15 text-sm">
            {view.listings.map((l) => <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2"><Link href={`/admin/businesses/${l.businessId}`} className="font-medium text-link underline [overflow-wrap:anywhere]">{l.name}</Link><span className="text-text-body">{l.source} · ends {l.ends}{l.autoRenews ? " · renews itself" : ""}</span></li>)}
          </ul>
        )}
      </section>
    </>
  );
}
