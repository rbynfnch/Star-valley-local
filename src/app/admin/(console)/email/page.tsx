import type { Metadata } from "next";
import { requireArea } from "@/lib/admin/session";
import { formatStamp, label } from "@/lib/admin/format";
import { createUserClient } from "@/lib/supabase/server";
import { RetryButton } from "./RetryButton";

export const metadata: Metadata = { title: "Email queue" };

type Row = { id: string; kind: string; status: string; recipient_email: string; business_id: string | null; business_name: string | null; attempts: number; last_error: string | null; created_at: string; send_after: string; sent_at: string | null };
type Queue = { counts: { queued: number; failed: number; sent_7d: number; cancelled_7d: number }; rows: Row[] };
const STATUS: Record<string, string> = { queued: "Waiting to send", sending: "Sending", sent: "Sent", failed: "Failed", cancelled: "Cancelled" };

export default async function EmailQueue() {
  const staff = await requireArea("crm");
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("admin_email_queue", { p_tenant: staff.tenant.id });
  if (error || !data) throw new Error("Could not load the email queue.");
  const q = data as Queue, tz = staff.tenant.timezone;
  const stat = (n: number, t: string, warn = false) => <div className="rounded-card bg-surface-card p-3 shadow-card"><p className={`font-heading text-2xl font-semibold ${warn && n > 0 ? "text-brand-text" : "text-text"}`}>{n}</p><p className="text-sm text-text-muted">{t}</p></div>;
  return (
    <>
      <h1 className="font-heading text-2xl font-semibold text-text">Email queue</h1>
      <p className="mt-1 text-sm text-text-muted">Service notices to business owners (renewals, re-verification) and staff alerts. Failed emails stay here until someone retries them.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat(q.counts.failed, "Failed", true)}{stat(q.counts.queued, "Waiting or sending")}{stat(q.counts.sent_7d, "Sent in 7 days")}{stat(q.counts.cancelled_7d, "Cancelled in 7 days")}
      </div>
      {q.rows.length === 0 ? <p className="mt-6 text-sm text-text-muted">Nothing has been queued yet.</p> : (
        <ul className="mt-4 space-y-2">
          {q.rows.map((r) => (
            <li key={r.id} className="min-w-0 rounded-card bg-surface-card p-3 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-text [overflow-wrap:anywhere]">{label(r.kind)}{r.business_name ? ` · ${r.business_name}` : ""}</p>
                  <p className="text-sm text-text-muted [overflow-wrap:anywhere]">To {r.recipient_email}</p>
                </div>
                <span className={`rounded-button px-2 py-0.5 text-xs font-semibold ${r.status === "failed" ? "bg-brand-text text-white" : "bg-surface-muted text-text"}`}>{STATUS[r.status] ?? r.status}</span>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {r.status === "sent" ? `Sent ${formatStamp(r.sent_at, tz)}` : r.status === "queued" ? `Due ${formatStamp(r.send_after, tz)}` : `Queued ${formatStamp(r.created_at, tz)}`}
                {r.attempts > 0 ? ` · ${r.attempts} attempt${r.attempts === 1 ? "" : "s"}` : ""}
              </p>
              {r.last_error && <p className="mt-1 text-sm text-text [overflow-wrap:anywhere]">{r.last_error}</p>}
              {r.status === "failed" && <div className="mt-2"><RetryButton id={r.id} /></div>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
