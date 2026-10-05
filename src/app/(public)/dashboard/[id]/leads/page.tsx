import type { Metadata } from "next";
import Link from "next/link";
import { formatStamp } from "@/lib/admin/format";
import { telHref } from "@/lib/format";
import { requireOwnedBusiness } from "@/lib/owner/session";
import { createUserClient } from "@/lib/supabase/server";
import { LeadStatus } from "../../OwnerForms";

export const metadata: Metadata = { title: "Requests" };
type Lead = { id: string; name: string; email: string | null; phone: string | null; service_needed: string | null; message: string | null; status: string; created_at: string };

export default async function Leads({ params }: PageProps<"/dashboard/[id]/leads">) {
  const { id } = await params;
  const { business: b, tenant } = await requireOwnedBusiness(id, `/dashboard/${id}/leads`);
  const { data } = await (await createUserClient()).from("leads").select("id,name,email,phone,service_needed,message,status,created_at").eq("business_id", id).order("created_at", { ascending: false }).limit(100);
  const leads = (data ?? []) as Lead[];
  return (
    <div className="max-w-3xl space-y-4">
      {b.tier !== "enhanced" ? (
        <div className="rounded-card bg-surface-card p-6 shadow-card">
          <h2 className="font-heading text-xl font-semibold text-text">Requests are part of Enhanced</h2>
          <p className="mt-2 text-text-body">An Enhanced listing shows a Request a Quote button, and every request lands here and in your email. A Free listing shows Call, Website and Directions only, so there is no form whose messages you would not receive.</p>
          <p className="mt-3"><Link href={`/dashboard/${id}/plan`} className="rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover">See the plans</Link></p>
        </div>
      ) : leads.length === 0 ? (
        <p className="rounded-card bg-surface-card p-6 text-text-body shadow-card">No requests yet. When someone uses Request a Quote on your listing, it appears here.</p>
      ) : (
        <ul className="space-y-4">
          {leads.map((l) => {
            const tel = telHref(l.phone);
            return (
              <li key={l.id} className="space-y-2 rounded-card bg-surface-card p-5 shadow-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-heading text-lg font-bold text-text [overflow-wrap:anywhere]">{l.name}</h2>
                  <p className="text-sm text-text-muted">{formatStamp(l.created_at, tenant.timezone)}</p>
                </div>
                {l.service_needed && <p className="text-sm text-text-body"><strong className="text-text">Needs:</strong> {l.service_needed}</p>}
                {l.message && <p className="whitespace-pre-line text-text-body [overflow-wrap:anywhere]">{l.message}</p>}
                <p className="flex flex-wrap gap-3 text-sm">
                  {l.email && <a href={`mailto:${l.email}`} className="font-semibold text-link underline [overflow-wrap:anywhere]">{l.email}</a>}
                  {tel && <a href={tel} className="font-semibold text-link underline">{l.phone}</a>}
                </p>
                <LeadStatus business={id} lead={l.id} status={l.status} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
