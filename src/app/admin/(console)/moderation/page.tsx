import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";
import { KINDS, MOD_PAGE_SIZE, STATUSES, modQuery, parseModParams } from "@/lib/admin/moderation-input";
import { KIND_LABEL, buildCard, type SubRow } from "@/lib/admin/moderation-view";
import { ModerationList } from "./ModerationList";

export const metadata: Metadata = { title: "Moderation" };
const STATUS_LABEL: Record<string, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected", spam: "Spam" };

export default async function ModerationPage({ searchParams }: PageProps<"/admin/moderation">) {
  const staff = await requireArea("moderation");
  const f = parseModParams(await searchParams);
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("admin_list_submissions", { p_tenant: staff.tenant.id, p_status: f.status, p_kind: f.kind, p_limit: MOD_PAGE_SIZE, p_offset: (f.page - 1) * MOD_PAGE_SIZE });
  const res = (data ?? { total: 0, pending_by_kind: {}, rows: [] }) as { total: number; pending_by_kind: Record<string, number>; rows: SubRow[] };
  const cards = res.rows.map((r) => buildCard(r, staff.role, staff.tenant.timezone));
  const pages = Math.max(1, Math.ceil(res.total / MOD_PAGE_SIZE));
  const link = "rounded-full border border-slate-600 px-3 py-1 text-sm";
  const on = "bg-surface-inverse text-white";
  return (
    <>
      <h1 className="font-heading text-2xl font-semibold text-text">Moderation</h1>
      <p className="mt-1 text-sm text-text-muted">Nothing a visitor sends is published or changed until you approve it.</p>
      <nav aria-label="Status" className="mt-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => <Link key={s} href={`/admin/moderation${modQuery(f, { status: s, page: 1 })}`} aria-current={f.status === s ? "page" : undefined} className={`${link} ${f.status === s ? on : "text-text"}`}>{STATUS_LABEL[s]}</Link>)}
      </nav>
      <nav aria-label="Type" className="mt-2 flex flex-wrap gap-2">
        <Link href={`/admin/moderation${modQuery(f, { kind: null, page: 1 })}`} aria-current={f.kind === null ? "page" : undefined} className={`${link} ${f.kind === null ? on : "text-text"}`}>All types</Link>
        {KINDS.map((k) => <Link key={k} href={`/admin/moderation${modQuery(f, { kind: k, page: 1 })}`} aria-current={f.kind === k ? "page" : undefined} className={`${link} ${f.kind === k ? on : "text-text"}`}>{KIND_LABEL[k]}{res.pending_by_kind[k] ? ` (${res.pending_by_kind[k]})` : ""}</Link>)}
      </nav>
      {error && <p role="alert" className="mt-4 text-sm font-medium text-brand-text">Could not load the queue.</p>}
      <p className="mt-4 text-sm text-text-muted" aria-live="polite">{res.total} {STATUS_LABEL[f.status].toLowerCase()}</p>
      {/* always mounted: the confirmation of the last review in the queue must outlive the list emptying */}
      {!error && <ModerationList cards={cards} empty={f.status === "pending" ? "Nothing waiting for review." : "Nothing here."} />}
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          {f.page > 1 ? <Link rel="prev" href={`/admin/moderation${modQuery(f, { page: f.page - 1 })}`} className="font-medium text-link underline">Previous</Link> : <span />}
          <span className="text-text-muted">Page {Math.min(f.page, pages)} of {pages}</span>
          {f.page < pages ? <Link rel="next" href={`/admin/moderation${modQuery(f, { page: f.page + 1 })}`} className="font-medium text-link underline">Next</Link> : <span />}
        </nav>
      )}
    </>
  );
}
