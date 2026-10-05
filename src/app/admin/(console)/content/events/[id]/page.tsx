import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/admin/detail-input";
import { dateField, repeatFromRrule, timeField } from "@/lib/admin/editorial-input";
import { requireArea } from "@/lib/admin/session";
import { mediaBaseUrl } from "@/lib/media";
import { createUserClient } from "@/lib/supabase/server";
import { EventForm } from "../../EventForm";
import { CoverImage, DeleteButton } from "../../EditorialBits";

export const metadata: Metadata = { title: "Edit event" };
type E = { id: string; slug: string; title: string; description: string | null; status: string; community_id: string | null; category_id: string | null; venue_name: string | null; address: string | null; starts_at: string; ends_at: string | null; all_day: boolean; rrule: string | null; recurrence_until: string | null; url: string | null; organizer_business_id: string | null; image_media_id: string | null };

export default async function EditEvent({ params, searchParams }: PageProps<"/admin/content/events/[id]">) {
  const staff = await requireArea("content");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const created = (await searchParams).created === "1";
  const supabase = await createUserClient(), t = staff.tenant.id, tz = staff.tenant.timezone;
  const { data } = await supabase.from("community_events").select("id,slug,title,description,status,community_id,category_id,venue_name,address,starts_at,ends_at,all_day,rrule,recurrence_until,url,organizer_business_id,image_media_id").eq("tenant_id", t).eq("id", id).maybeSingle();
  if (!data) notFound();
  const e = data as E;
  const [comms, cats, img, org] = await Promise.all([
    supabase.from("communities").select("id,name").eq("tenant_id", t).order("sort_order"),
    supabase.from("event_categories").select("id,name").eq("tenant_id", t).order("sort_order"),
    e.image_media_id ? supabase.from("media_assets").select("storage_bucket,storage_path,alt_text").eq("id", e.image_media_id).maybeSingle() : Promise.resolve({ data: null }),
    e.organizer_business_id ? supabase.from("businesses").select("slug").eq("id", e.organizer_business_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const media = img.data as { storage_bucket: string; storage_path: string; alt_text: string | null } | null;
  // an all-day event ends at 23:59 local on its last day; show the date, not a time
  return (
    <>
      <p className="text-sm"><Link href="/admin/content/events" className="text-link underline">← Events</Link></p>
      <h1 className="mt-2 font-heading text-2xl font-semibold text-text [overflow-wrap:anywhere]">Edit event</h1>
      {created && <p role="status" className="mt-3 rounded-card bg-surface-muted p-3 text-sm font-medium text-green-800">Event created.</p>}
      <p className="mt-1 text-sm text-text-muted">{e.status === "published" ? <>Live at <Link href={`/events/${e.slug}`} className="font-medium text-link underline" target="_blank">/events/{e.slug}</Link></> : "Not visible to the public."}</p>
      <div className="mt-4 space-y-4">
        <div className="rounded-card bg-surface-card p-4 shadow-card">
          <EventForm communities={comms.data ?? []} categories={cats.data ?? []}
            v={{ id: e.id, title: e.title, description: e.description ?? "", community: e.community_id ?? "", category: e.category_id ?? "", venue: e.venue_name ?? "", address: e.address ?? "", start_date: dateField(e.starts_at, tz), start_time: e.all_day ? "" : timeField(e.starts_at, tz),
              end_date: dateField(e.ends_at, tz), end_time: e.all_day ? "" : timeField(e.ends_at, tz), all_day: e.all_day, repeat: repeatFromRrule(e.rrule), repeat_until: dateField(e.recurrence_until, tz), url: e.url ?? "",
              organizer: (org.data as { slug: string } | null)?.slug ?? "", status: e.status === "rejected" ? "pending" : e.status }} />
        </div>
        <CoverImage kind="event" id={e.id} mediaBase={mediaBaseUrl()} current={media ? { bucket: media.storage_bucket, path: media.storage_path, alt: media.alt_text } : null} />
        <div className="rounded-card bg-surface-card p-4 shadow-card"><DeleteButton kind="event" id={e.id} what="event" /><p className="mt-2 text-xs text-text-muted">Cancel a published event first; only an unpublished event can be deleted.</p></div>
      </div>
    </>
  );
}
