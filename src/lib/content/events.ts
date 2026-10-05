import { upcomingOccurrences, zonedToUtc, isSupportedRrule, type Occurrence } from "../events/recurrence.ts";
import type { Community, EventRow } from "../directory/types.ts";

// The /events pages: filters, date ranges in the tenant's timezone, recurring events expanded into dated occurrences,
// plus the schema.org Event markup and the calendar (.ics) file for one occurrence.
export const EVENT_RANGES = ["all", "today", "weekend", "month"] as const;
export type EventRange = (typeof EVENT_RANGES)[number];
export const EVENTS_PER_PAGE = 12;
export const EVENT_HORIZON_DAYS = 120;
const MAX_CARDS = 300;

export interface EventParams { range: EventRange; community: string | null; category: string | null; q: string; page: number }
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseEventParams(raw: Raw): EventParams {
  const r = one(raw.when), c = one(raw.community), k = one(raw.category), q = (one(raw.q) ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  const p = Number(one(raw.page));
  return {
    range: (EVENT_RANGES as readonly string[]).includes(r ?? "") ? (r as EventRange) : "all",
    community: c && SLUG.test(c) && c.length <= 80 ? c : null, category: k && SLUG.test(k) && k.length <= 80 ? k : null, q,
    page: Number.isInteger(p) && p >= 1 && p <= 1000 ? p : 1,
  };
}
export function eventsUrl(p: Partial<EventParams>): string {
  const sp = new URLSearchParams();
  if (p.range && p.range !== "all") sp.set("when", p.range);
  if (p.community) sp.set("community", p.community);
  if (p.category) sp.set("category", p.category);
  if (p.q) sp.set("q", p.q);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const s = sp.toString();
  return s ? `/events?${s}` : "/events";
}

// ---- local calendar arithmetic (tenant timezone)
type Local = { y: number; m: number; d: number; dow: number };
function local(instant: Date, tz: string): Local {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(instant)) if (p.type !== "literal") o[p.type] = p.value;
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day), dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday) };
}
const midnight = (l: { y: number; m: number; d: number }, plusDays: number, tz: string, h = 0) => {
  const u = new Date(Date.UTC(l.y, l.m - 1, l.d + plusDays));
  return zonedToUtc({ y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate(), h, mi: 0 }, tz);
};

/** [start, end) of a range. "Weekend" is Friday 5 PM to Monday 12 AM; if it is already on, it starts now. */
export function eventWindow(range: EventRange, now: Date, tz: string): { start: Date; end: Date } {
  const l = local(now, tz);
  if (range === "today") return { start: now, end: midnight(l, 1, tz) };
  if (range === "month") return { start: now, end: zonedToUtc({ y: l.m === 12 ? l.y + 1 : l.y, m: l.m === 12 ? 1 : l.m + 1, d: 1, h: 0, mi: 0 }, tz) };
  if (range === "weekend") {
    const toFri = l.dow === 6 ? -1 : l.dow === 0 ? -2 : 5 - l.dow;            // Sat/Sun belong to the weekend that started on the Friday before
    const fri = midnight(l, toFri, tz, 17);
    const end = midnight(l, toFri + 3, tz);
    return { start: new Date(Math.max(fri.getTime(), now.getTime())), end };
  }
  return { start: now, end: new Date(now.getTime() + EVENT_HORIZON_DAYS * 86400_000) };
}

const DAY_NAMES: Record<string, string> = { SU: "Sunday", MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday" };
/** "Every Saturday", "Every 2 weeks on Tuesday and Thursday", "Every day"; null for rules this site cannot expand. */
export function describeRrule(rrule: string | null): string | null {
  if (!rrule || !isSupportedRrule(rrule)) return null;
  const m = new Map(rrule.replace(/^RRULE:/i, "").split(";").map((p) => p.split("=") as [string, string]).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()]));
  const n = Number(m.get("INTERVAL") ?? "1"), freq = m.get("FREQ");
  const days = (m.get("BYDAY") ?? "").split(",").filter(Boolean).map((d) => DAY_NAMES[d]);
  const list = days.length <= 1 ? days.join("") : `${days.slice(0, -1).join(", ")} and ${days.at(-1)}`;
  if (freq === "DAILY") return n === 1 ? "Every day" : `Every ${n} days`;
  if (freq === "WEEKLY") return `${n === 1 ? "Every" : `Every ${n} weeks on`} ${list || (n === 1 ? "week" : "the same weekday")}`.replace(/^Every (\d+) weeks on (week|the same weekday)$/, "Every $1 weeks").replace(/^Every (?=[A-Z])/, "Every ");
  if (freq === "MONTHLY") return n === 1 ? "Every month on the same day" : `Every ${n} months on the same day`;
  return null;
}

export interface EventItem {
  key: string; slug: string; title: string; start: Date; end: Date | null; allDay: boolean;
  where: string | null; community: string | null; category: string | null; categoryColor: string | null; recurring: boolean; repeatText: string | null; description: string | null;
}
export interface EventList { items: EventItem[]; total: number; page: number; totalPages: number }

export function buildEventList(rows: EventRow[], communities: Community[], categories: { id: string; slug: string; name: string; color_token?: string | null }[], p: EventParams, now: Date, tz: string): EventList {
  const win = eventWindow(p.range, now, tz);
  const comm = p.community ? communities.find((c) => c.slug === p.community) : null;
  const cat = p.category ? categories.find((c) => c.slug === p.category) : null;
  const q = p.q.toLowerCase();
  const items: EventItem[] = [];
  if ((p.community && !comm) || (p.category && !cat)) return { items, total: 0, page: 1, totalPages: 1 };
  for (const r of rows) {
    if (comm && r.community_id !== comm.id) continue;
    if (cat && r.category_id !== cat.id) continue;
    const community = communities.find((c) => c.id === r.community_id)?.name ?? null;
    if (q && ![r.title, r.venue_name, community, r.description].some((t) => t && t.toLowerCase().includes(q))) continue;
    const category = categories.find((c) => c.id === r.category_id);
    for (const o of upcomingOccurrences(r, win.start, 60, tz)) {
      if (o.start.getTime() >= win.end.getTime()) break;
      items.push({
        key: `${r.id}:${o.start.toISOString()}`, slug: r.slug, title: r.title, start: o.start, end: o.end, allDay: r.all_day,
        where: [r.venue_name, community].filter(Boolean).join(", ") || null, community, category: category?.name ?? null, categoryColor: category?.color_token ?? null,
        recurring: !!r.rrule, repeatText: describeRrule(r.rrule), description: r.description ?? null,
      });
    }
  }
  items.sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title));
  const total = Math.min(items.length, MAX_CARDS);
  const totalPages = Math.max(1, Math.ceil(total / EVENTS_PER_PAGE));
  const page = Math.min(p.page, totalPages);
  return { items: items.slice(0, MAX_CARDS).slice((page - 1) * EVENTS_PER_PAGE, page * EVENTS_PER_PAGE), total, page, totalPages };
}

export const nextOccurrence = (r: EventRow, now: Date, tz: string): Occurrence | null => upcomingOccurrences(r, now, 1, tz)[0] ?? null;

// ---- schema.org Event (the next occurrence stands for a recurring event: search engines want one dated event)
export function eventJsonLd(o: { origin: string; path: string; title: string; description: string | null; start: Date; end: Date | null; allDay: boolean; venue: string | null; address: string | null; locality: string | null; region: string | null; organizer: string | null; url?: string | null; image: string | null }): object {
  const iso = (d: Date) => d.toISOString();
  return {
    "@context": "https://schema.org", "@type": "Event", "@id": `${o.origin}${o.path}#event`, name: o.title, url: `${o.origin}${o.path}`,
    startDate: iso(o.start), ...(o.end ? { endDate: iso(o.end) } : {}),
    eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(o.description ? { description: o.description } : {}),
    ...(o.venue || o.address || o.locality ? { location: { "@type": "Place", ...(o.venue ? { name: o.venue } : {}), address: { "@type": "PostalAddress", ...(o.address ? { streetAddress: o.address } : {}), ...(o.locality ? { addressLocality: o.locality } : {}), ...(o.region ? { addressRegion: o.region } : {}), addressCountry: "US" } } } : {}),
    ...(o.organizer ? { organizer: { "@type": "Organization", name: o.organizer } } : {}),
    ...(o.image ? { image: [o.image] } : {}),
  };
}

// ---- calendar file (RFC 5545). Text values are escaped and folded; a newline in a title can never start a new property.
const ics = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
function fold(line: string): string {
  const out: string[] = []; let cur = "", bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length === 0 ? 75 : 74)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function buildIcs(o: { uid: string; now: Date; tenantName: string; title: string; description: string | null; start: Date; end: Date | null; allDay: boolean; location: string | null; url: string; tz: string }): string {
  const day = (d: Date) => { const l = local(d, o.tz); return `${l.y}${String(l.m).padStart(2, "0")}${String(l.d).padStart(2, "0")}`; };
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${ics(o.tenantName)}//Events//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${o.uid.replace(/[^A-Za-z0-9@.:_-]/g, "")}`, `DTSTAMP:${stamp(o.now)}`,
    ...(o.allDay ? [`DTSTART;VALUE=DATE:${day(o.start)}`, `DTEND;VALUE=DATE:${(() => { const l = local(new Date((o.end ?? o.start).getTime()), o.tz); const u = new Date(Date.UTC(l.y, l.m - 1, l.d + 1)); return `${u.getUTCFullYear()}${String(u.getUTCMonth() + 1).padStart(2, "0")}${String(u.getUTCDate()).padStart(2, "0")}`; })()}`]
      : [`DTSTART:${stamp(o.start)}`, `DTEND:${stamp(o.end ?? new Date(o.start.getTime() + 3600_000))}`]),
    `SUMMARY:${ics(o.title)}`, ...(o.description ? [`DESCRIPTION:${ics(o.description)}`] : []), ...(o.location ? [`LOCATION:${ics(o.location)}`] : []),
    `URL:${o.url.replace(/[\r\n\s]/g, "")}`, "END:VEVENT", "END:VCALENDAR"];
  return lines.map(fold).join("\r\n") + "\r\n";
}
