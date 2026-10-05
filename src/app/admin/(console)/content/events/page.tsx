import type { Metadata } from "next";
import Link from "next/link";
import { formatStamp, label } from "@/lib/admin/format";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Events" };
type Row = { id: string; slug: string; title: string; status: string; starts_at: string; rrule: string | null };

export default async function EventList({ searchParams }: PageProps<"/admin/content/events">) {
  const staff = await requireArea("content");
  const sp = await searchParams;
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("community_events").select("id,slug,title,status,starts_at,rrule").eq("tenant_id", staff.tenant.id).order("starts_at", { ascending: false }).limit(200);
  if (error) throw new Error("Could not load events.");
  const rows = (data ?? []) as Row[], tz = staff.tenant.timezone;
  return (
    <>
      <p className="text-sm"><Link href="/admin/content" className="text-link underline">← Content</Link></p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold text-text">Events</h1>
        <Link href="/admin/content/events/new" className="rounded-button bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-hover">New event</Link>
      </div>
      {sp.deleted === "1" && <p role="status" className="mt-3 rounded-card bg-surface-muted p-3 text-sm font-medium text-green-800">Deleted.</p>}
      {rows.length === 0 ? <p className="mt-6 text-sm text-text-muted">No events yet.</p> : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="min-w-0 rounded-card bg-surface-card p-3 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/admin/content/events/${r.id}`} className="font-medium text-link underline [overflow-wrap:anywhere]">{r.title}</Link>
                <span className="rounded-button bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text">{label(r.status)}{r.rrule ? " · repeats" : ""}</span>
              </div>
              <p className="mt-1 text-xs text-text-muted">{formatStamp(r.starts_at, tz)} · /events/{r.slug}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
