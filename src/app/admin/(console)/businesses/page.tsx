import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";
import { PAGE_SIZE, STAGES, STATUSES, TIERS, parseListParams, toQuery, toRpcArgs } from "@/lib/admin/list-params";

export const metadata: Metadata = { title: "Businesses" };

interface Row {
  id: string; slug: string; name: string; status: string; phone: string | null; verification_level: "none" | "green" | "gold";
  community: string | null; category: string | null; lead_stage: string; tier: "free" | "enhanced"; featured: boolean;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-2 py-1.5 text-sm text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";

export default async function BusinessesPage({ searchParams }: PageProps<"/admin/businesses">) {
  const staff = await requireArea("businesses");
  const f = parseListParams(await searchParams);
  const supabase = await createUserClient();
  const [list, communities, categories] = await Promise.all([
    supabase.rpc("admin_list_businesses", toRpcArgs(staff.tenant.id, f)),
    supabase.from("communities").select("id,name").eq("tenant_id", staff.tenant.id).order("sort_order"),
    supabase.from("categories").select("id,name").eq("tenant_id", staff.tenant.id).eq("is_active", true).order("sort_order"),
  ]);
  const result = (list.data ?? { total: 0, rows: [] }) as { total: number; rows: Row[] };
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const filtered = toQuery({ ...f, page: 1 }) !== "";

  return (
    <>
      <h1 className="font-heading text-2xl font-semibold text-text">Businesses</h1>
      <form method="get" className="mt-4 grid grid-cols-2 gap-3 rounded-card bg-surface-card p-4 shadow-card md:grid-cols-4" aria-label="Filter businesses">
        <div className="col-span-2 md:col-span-4">
          <label htmlFor="q" className="text-sm font-medium text-text">Search name or phone</label>
          <input id="q" name="q" type="search" defaultValue={f.q ?? ""} maxLength={100} className={field} />
        </div>
        <div><label htmlFor="status" className="text-sm font-medium text-text">Status</label>
          <select id="status" name="status" defaultValue={f.status ?? ""} className={field}><option value="">Not archived</option>{STATUSES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></div>
        <div><label htmlFor="tier" className="text-sm font-medium text-text">Tier</label>
          <select id="tier" name="tier" defaultValue={f.tier ?? ""} className={field}><option value="">Any</option>{TIERS.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></div>
        <div><label htmlFor="community" className="text-sm font-medium text-text">Community</label>
          <select id="community" name="community" defaultValue={f.community ?? ""} className={field}><option value="">Any</option>{(communities.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label htmlFor="category" className="text-sm font-medium text-text">Category</label>
          <select id="category" name="category" defaultValue={f.category ?? ""} className={field}><option value="">Any</option>{(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label htmlFor="stage" className="text-sm font-medium text-text">Lead stage</label>
          <select id="stage" name="stage" defaultValue={f.stage ?? ""} className={field}><option value="">Any</option>{STAGES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></div>
        <div><label htmlFor="verified" className="text-sm font-medium text-text">Verified</label>
          <select id="verified" name="verified" defaultValue={f.verified === null ? "" : f.verified ? "yes" : "no"} className={field}><option value="">Any</option><option value="yes">Verified</option><option value="no">Not verified</option></select></div>
        <div className="col-span-2 flex items-end gap-3 md:col-span-2">
          <button type="submit" className="rounded-button bg-brand px-4 py-1.5 text-sm font-semibold text-brand-contrast hover:bg-brand-hover">Apply filters</button>
          {filtered && <Link href="/admin/businesses" className="text-sm font-medium text-link underline">Clear</Link>}
        </div>
      </form>

      {list.error && <p role="alert" className="mt-4 text-sm font-medium text-danger-text">Could not load businesses.</p>}
      <p className="mt-4 text-sm text-text-muted" aria-live="polite">{result.total} {result.total === 1 ? "business" : "businesses"}{filtered ? " match" : ""}</p>

      {result.rows.length === 0 && !list.error ? (
        <p className="mt-6 rounded-card bg-surface-card p-6 text-text-muted shadow-card">No businesses match these filters.</p>
      ) : (
        <>
          <ul className="mt-3 space-y-3 md:hidden">
            {result.rows.map((r) => (
              <li key={r.id} className="rounded-card bg-surface-card p-4 shadow-card">
                <p className="font-semibold text-text"><Link href={`/admin/businesses/${r.id}`} className="text-link underline">{r.name}</Link></p>
                <p className="text-sm text-text-muted">{[r.category, r.community].filter(Boolean).join(" · ") || "No category or community yet"}</p>
                <p className="mt-1 text-sm">{r.phone ? <a className="text-link underline" href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>{r.phone}</a> : <span className="text-text-subtle">No phone</span>}</p>
                <p className="mt-2 text-xs text-text-body">{cap(r.status)} · {r.verification_level === "none" ? "Not verified" : `${cap(r.verification_level)} verified`} · {cap(r.tier)}{r.featured ? " · Featured" : ""} · Lead: {cap(r.lead_stage)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-3 hidden overflow-x-auto rounded-card bg-surface-card shadow-card md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Businesses</caption>
              <thead className="border-b border-slate-600/30 text-text-muted"><tr>
                {["Name", "Category", "Community", "Status", "Verified", "Tier", "Lead stage", "Phone"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-600/10 last:border-0">
                    <th scope="row" className="px-3 py-2 font-semibold text-text"><Link href={`/admin/businesses/${r.id}`} className="text-link underline">{r.name}</Link></th>
                    <td className="px-3 py-2">{r.category ?? "–"}</td><td className="px-3 py-2">{r.community ?? "–"}</td>
                    <td className="px-3 py-2">{cap(r.status)}</td>
                    <td className="px-3 py-2">{r.verification_level === "none" ? "No" : cap(r.verification_level)}</td>
                    <td className="px-3 py-2">{cap(r.tier)}{r.featured ? " + Featured" : ""}</td>
                    <td className="px-3 py-2">{cap(r.lead_stage)}</td><td className="px-3 py-2 whitespace-nowrap">{r.phone ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          {f.page > 1 ? <Link rel="prev" href={`/admin/businesses${toQuery(f, f.page - 1)}`} className="font-medium text-link underline">Previous</Link> : <span />}
          <span className="text-text-muted">Page {Math.min(f.page, pages)} of {pages}</span>
          {f.page < pages ? <Link rel="next" href={`/admin/businesses${toQuery(f, f.page + 1)}`} className="font-medium text-link underline">Next</Link> : <span />}
        </nav>
      )}
    </>
  );
}
