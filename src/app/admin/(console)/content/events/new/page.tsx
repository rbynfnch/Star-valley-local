import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";
import { EventForm } from "../../EventForm";

export const metadata: Metadata = { title: "New event" };

export default async function NewEvent() {
  const staff = await requireArea("content");
  const supabase = await createUserClient();
  const [comms, cats] = await Promise.all([
    supabase.from("communities").select("id,name").eq("tenant_id", staff.tenant.id).order("sort_order"),
    supabase.from("event_categories").select("id,name").eq("tenant_id", staff.tenant.id).order("sort_order"),
  ]);
  return (
    <>
      <p className="text-sm"><Link href="/admin/content/events" className="text-link underline">← Events</Link></p>
      <h1 className="mt-2 font-heading text-2xl font-semibold text-text">New event</h1>
      <div className="mt-4 rounded-card bg-surface-card p-4 shadow-card">
        <EventForm communities={comms.data ?? []} categories={cats.data ?? []}
          v={{ id: null, title: "", description: "", community: "", category: "", venue: "", address: "", start_date: "", start_time: "10:00", end_date: "", end_time: "", all_day: false, repeat: { freq: "none", interval: 1, days: [] }, repeat_until: "", url: "", organizer: "", status: "published" }} />
      </div>
    </>
  );
}
