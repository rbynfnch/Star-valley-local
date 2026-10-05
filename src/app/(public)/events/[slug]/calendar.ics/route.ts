import { getDirectoryData } from "@/lib/directory/data";
import { buildIcs } from "@/lib/content/events";
import { plainExcerpt } from "@/lib/content/markdown";
import { upcomingOccurrences } from "@/lib/events/recurrence";
import { requestOrigin } from "@/lib/tenant/request-origin";
import { getTenant } from "@/lib/tenant/resolve";

export const dynamic = "force-dynamic";
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// A calendar file for the next date of one published event. 404 for anything else.
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const tenant = await getTenant();
  if (!tenant || !SLUG.test(slug)) return new Response("Not found", { status: 404 });
  const data = getDirectoryData();
  const ev = await data.eventBySlug(tenant.id, slug);
  const origin = await requestOrigin();
  const occ = ev ? upcomingOccurrences(ev, new Date(), 1, tenant.timezone)[0] : null;
  if (!ev || !occ || !origin) return new Response("Not found", { status: 404 });
  const communities = await data.communities(tenant.id);
  const community = communities.find((c) => c.id === ev.community_id)?.name ?? null;
  const body = buildIcs({
    uid: `${ev.id}-${occ.start.toISOString().slice(0, 10)}@${new URL(origin).host}`, now: new Date(), tenantName: tenant.name, title: ev.title,
    description: ev.description ? plainExcerpt(ev.description, 500) : null, start: occ.start, end: occ.end, allDay: ev.all_day,
    location: [ev.venue_name, ev.address, community].filter(Boolean).join(", ") || null, url: `${origin}/events/${ev.slug}`, tz: tenant.timezone,
  });
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${ev.slug}.ics"`, "cache-control": "public, max-age=600" } });
}
