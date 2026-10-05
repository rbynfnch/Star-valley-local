import type { Metadata } from "next";
import { requireArea } from "@/lib/admin/session";
import { formatDay } from "@/lib/admin/format";
import { createUserClient } from "@/lib/supabase/server";
import { BatchForm, VoidButton } from "./PostcardForms";

export const metadata: Metadata = { title: "Postcards" };
type Overview = { eligible: { id: string; name: string; city: string | null }[]; batches: { id: string; label: string; created_at: string; cards: { id: string; business: string; status: string; issued_at: string; redeemed_at: string | null }[] }[] };
const WORDS: Record<string, string> = { issued: "Waiting", redeemed: "Redeemed", void: "Voided", expired: "Expired" };

export default async function Postcards() {
  const staff = await requireArea("crm");
  const { data, error } = await (await createUserClient()).rpc("admin_postcard_overview", { p_tenant: staff.tenant.id });
  if (error) throw new Error("Could not load postcards.");
  const o = data as Overview, tz = staff.tenant.timezone;
  const card = "rounded-card bg-surface-card p-4 shadow-card";
  return (
    <>
      <h1 className="no-print font-heading text-2xl font-semibold text-text">Postcards</h1>
      <p className="no-print mt-1 text-sm text-text-muted">A mailed card with a one-time code is the extra proof that takes a Green listing to Gold. Only Green, claimed businesses can be sent one. Each code is valid for 90 days.</p>
      <div className="mt-6 space-y-6">
        <section aria-labelledby="new-h" className={card}>
          <h2 id="new-h" className="no-print font-heading text-lg font-semibold text-text">Make a batch</h2>
          <div className="mt-3"><BatchForm eligible={o.eligible} tenantName={staff.tenant.name} /></div>
        </section>
        <section aria-labelledby="past-h" className={`${card} no-print`}>
          <h2 id="past-h" className="font-heading text-lg font-semibold text-text">Recent batches</h2>
          {o.batches.length === 0 ? <p className="mt-2 text-sm text-text-subtle">No batches yet.</p> : o.batches.map((b) => (
            <div key={b.id} className="mt-4">
              <h3 className="font-semibold text-text">{b.label} <span className="font-normal text-text-muted">· {formatDay(b.created_at, tz)}</span></h3>
              <ul className="mt-1 divide-y divide-slate-600/15 text-sm">
                {b.cards.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span className="text-text [overflow-wrap:anywhere]">{c.business}</span>
                    <span className="text-text-muted">{WORDS[c.status] ?? c.status}{c.redeemed_at ? ` ${formatDay(c.redeemed_at, tz)}` : ""}{c.status === "issued" ? <> · <VoidButton id={c.id} /></> : null}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-4 text-xs text-text-muted">Codes are shown once, when the batch is made. If a card is lost or the codes were not printed, void it and make a new one.</p>
        </section>
      </div>
    </>
  );
}
