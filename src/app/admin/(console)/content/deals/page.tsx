import type { Metadata } from "next";
import Link from "next/link";
import { canAccess } from "@/lib/admin/access";
import { dealLive } from "@/lib/admin/editorial-view";
import { formatDay, label } from "@/lib/admin/format";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Deals" };
type Deal = { id: string; business_id: string; title: string; status: string; starts_at: string; ends_at: string | null };

export default async function DealList() {
  const staff = await requireArea("content");
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("deals").select("id,business_id,title,status,starts_at,ends_at").eq("tenant_id", staff.tenant.id).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error("Could not load deals.");
  const deals = (data ?? []) as Deal[];
  const ids = [...new Set(deals.map((d) => d.business_id))];
  const biz = ids.length ? (((await supabase.from("businesses").select("id,slug,name").in("id", ids)).data ?? []) as { id: string; slug: string; name: string }[]) : [];
  const canEdit = canAccess(staff.role, "businesses"), tz = staff.tenant.timezone;
  return (
    <>
      <p className="text-sm"><Link href="/admin/content" className="text-link underline">← Content</Link></p>
      <h1 className="mt-2 font-heading text-2xl font-semibold text-text">Deals</h1>
      <p className="mt-1 text-sm text-text-muted">Deals belong to businesses and are edited with the business{canEdit ? "" : " (ask sales staff to change one)"}. A deal shows on the public site only while it is published, in its dates, and the business has an active Enhanced listing.</p>
      {deals.length === 0 ? <p className="mt-6 text-sm text-text-muted">No deals yet.</p> : (
        <ul className="mt-4 space-y-2">
          {deals.map((d) => {
            const b = biz.find((x) => x.id === d.business_id);
            return (
              <li key={d.id} className="min-w-0 rounded-card bg-surface-card p-3 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-text [overflow-wrap:anywhere]">{d.title}</p>
                  <span className="rounded-button bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text">{dealLive(d) ? "Live" : label(d.status)}</span>
                </div>
                <p className="mt-1 text-xs text-text-muted [overflow-wrap:anywhere]">
                  {b ? (canEdit ? <Link href={`/admin/businesses/${b.id}/content`} className="font-medium text-link underline">{b.name}</Link> : b.name) : "A business"} · {formatDay(d.starts_at, tz)} to {d.ends_at ? formatDay(d.ends_at, tz) : "no end"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
