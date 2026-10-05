import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/lib/admin/session";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Content" };

export default async function ContentHub() {
  const staff = await requireArea("content");
  const supabase = await createUserClient();
  const count = async (table: string, filter?: [string, string]) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", staff.tenant.id);
    if (filter) q = q.eq(filter[0], filter[1]);
    const { count: n } = await q;
    return n ?? 0;
  };
  const [articles, drafts, events, pending, deals] = await Promise.all([count("articles"), count("articles", ["status", "draft"]), count("community_events"), count("community_events", ["status", "pending"]), count("deals")]);
  const card = "rounded-card bg-surface-card p-4 shadow-card hover:bg-surface-muted";
  return (
    <>
      <h1 className="font-heading text-2xl font-semibold text-text">Content</h1>
      <p className="mt-1 text-sm text-text-muted">Articles and guides, community events, and the deals businesses post.</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        <li><Link href="/admin/content/articles" className={`block ${card}`}><span className="font-heading text-lg font-semibold text-text">Articles</span><span className="mt-1 block text-sm text-text-muted">{articles} in all, {drafts} draft{drafts === 1 ? "" : "s"}</span></Link></li>
        <li><Link href="/admin/content/events" className={`block ${card}`}><span className="font-heading text-lg font-semibold text-text">Events</span><span className="mt-1 block text-sm text-text-muted">{events} in all, {pending} pending</span></Link></li>
        <li><Link href="/admin/content/deals" className={`block ${card}`}><span className="font-heading text-lg font-semibold text-text">Deals</span><span className="mt-1 block text-sm text-text-muted">{deals} from businesses</span></Link></li>
      </ul>
      <p className="mt-4 text-sm text-text-muted">Events sent in through the public form wait in <Link href="/admin/moderation" className="font-medium text-link underline">Moderation</Link> until someone approves them.</p>
    </>
  );
}
