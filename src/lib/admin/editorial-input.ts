import { zonedToUtc, isSupportedRrule } from "../events/recurrence.ts";
import { isUuid } from "./detail-input.ts";

// Parsers for the article and event forms. Friendly messages here; save_article / save_event enforce the same rules again.
type Res<T> = { ok: true; value: T } | { ok: false; error: string };
const str = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v : ""; };
const clean = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
const oneLine = (s: string) => clean(s).replace(/\s+/g, " ");
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
export const WEEKDAYS = [["MO", "Monday"], ["TU", "Tuesday"], ["WE", "Wednesday"], ["TH", "Thursday"], ["FR", "Friday"], ["SA", "Saturday"], ["SU", "Sunday"]] as const;

// ---- dates and times in the tenant's timezone
function ymd(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const chk = new Date(Date.UTC(y, mo - 1, d));
  return chk.getUTCFullYear() === y && chk.getUTCMonth() === mo - 1 && chk.getUTCDate() === d ? { y, m: mo, d } : null;
}
function hm(s: string): { h: number; mi: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(s);
  return m ? { h: Number(m[1]), mi: Number(m[2]) } : null;
}
/** A date (YYYY-MM-DD) and optional time (HH:MM) as an instant in `tz`. Without a time: the start of the day, or 23:59 when `endOfDay`. */
export function localInstant(date: string, time: string, tz: string, endOfDay = false): Date | null {
  const d = ymd(date.trim());
  if (!d) return null;
  const t = time.trim() ? hm(time.trim()) : endOfDay ? { h: 23, mi: 59 } : { h: 0, mi: 0 };
  return t ? zonedToUtc({ ...d, ...t }, tz) : null;
}
const parts = (iso: string | null | undefined, tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", ...o }).formatToParts(new Date(iso ?? ""));
const pick = (p: Intl.DateTimeFormatPart[], t: string) => p.find((x) => x.type === t)?.value ?? "";
export function dateField(iso: string | null | undefined, tz: string): string {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return "";
  const p = parts(iso, tz, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${pick(p, "year")}-${pick(p, "month")}-${pick(p, "day")}`;
}
export function timeField(iso: string | null | undefined, tz: string): string {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return "";
  const p = parts(iso, tz, { hour: "2-digit", minute: "2-digit" });
  return `${pick(p, "hour")}:${pick(p, "minute")}`;
}

// ---- recurrence: the form's few choices <-> an RRULE the site can expand
export interface Repeat { freq: "none" | "daily" | "weekly" | "monthly"; interval: number; days: string[] }
export function buildRrule(r: Repeat): string | null {
  if (r.freq === "none") return null;
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  const days = WEEKDAYS.map(([d]) => d).filter((d) => r.days.includes(d));       // canonical Monday-first order
  if (r.freq === "weekly" && days.length) parts.push(`BYDAY=${days.join(",")}`);
  return parts.join(";");
}
export function repeatFromRrule(rrule: string | null | undefined): Repeat {
  if (!rrule || !isSupportedRrule(rrule)) return { freq: "none", interval: 1, days: [] };
  const m = new Map(rrule.replace(/^RRULE:/i, "").split(";").map((p) => p.split("=") as [string, string]).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()]));
  const freq = ({ DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly" } as const)[m.get("FREQ") as "DAILY"] ?? "none";
  return { freq, interval: Number(m.get("INTERVAL") ?? "1"), days: (m.get("BYDAY") ?? "").split(",").filter((d) => (DAYS as readonly string[]).includes(d)) };
}

// ---- events
export interface EventInput {
  id: string | null; title: string; description: string | null; community: string | null; category: string | null; venue: string | null; address: string | null;
  startsAt: string; endsAt: string | null; allDay: boolean; rrule: string | null; until: string | null; url: string | null; organizerSlug: string | null; status: "published" | "cancelled" | "pending";
}
export function parseEventInput(f: FormData, tz: string): Res<EventInput> {
  const id = str(f, "id");
  if (id && !isUuid(id)) return { ok: false, error: "Unknown event." };
  const title = oneLine(str(f, "title"));
  if (!title) return { ok: false, error: "Give the event a title." };
  if (title.length > 150) return { ok: false, error: "The title is limited to 150 characters." };
  const description = clean(str(f, "description"));
  if (description.length > 3000) return { ok: false, error: "The description is limited to 3000 characters." };
  const venue = oneLine(str(f, "venue")), address = oneLine(str(f, "address"));
  if (venue.length > 150 || address.length > 200) return { ok: false, error: "The venue is limited to 150 characters and the address to 200." };
  const allDay = f.get("all_day") === "on";
  const startDate = str(f, "start_date");
  if (!startDate) return { ok: false, error: "Choose the first day." };
  if (!allDay && !str(f, "start_time")) return { ok: false, error: "Choose a start time, or mark the event all day." };
  const start = localInstant(startDate, allDay ? "" : str(f, "start_time"), tz);
  if (!start) return { ok: false, error: "The start date or time is not valid." };
  let end: Date | null = null;
  const endDate = str(f, "end_date") || (str(f, "end_time") || allDay ? startDate : "");
  if (endDate) {
    end = localInstant(endDate, allDay ? "" : str(f, "end_time"), tz, true);
    if (!end) return { ok: false, error: "The end date or time is not valid." };
    if (end.getTime() < start.getTime()) return { ok: false, error: "The event cannot end before it starts." };
  }
  const freq = str(f, "repeat") || "none";
  if (!["none", "daily", "weekly", "monthly"].includes(freq)) return { ok: false, error: "Choose how the event repeats." };
  const intervalRaw = str(f, "repeat_interval").trim();
  const interval = intervalRaw === "" ? 1 : Number(intervalRaw);
  if (!Number.isInteger(interval) || interval < 1 || interval > 52) return { ok: false, error: "Repeat every 1 to 52." };
  const days = f.getAll("repeat_days").filter((d): d is string => typeof d === "string");
  if (days.some((d) => !WEEKDAYS.some(([w]) => w === d))) return { ok: false, error: "Choose days from the list." };
  const rrule = buildRrule({ freq: freq as Repeat["freq"], interval, days });
  let until: Date | null = null;
  if (str(f, "repeat_until")) {
    if (!rrule) return { ok: false, error: "Choose how the event repeats, or clear the repeat end date." };
    until = localInstant(str(f, "repeat_until"), "", tz, true);
    if (!until) return { ok: false, error: "The repeat end date is not valid." };
    if (until.getTime() < start.getTime()) return { ok: false, error: "The repeat end date must come after the first date." };
  }
  const url = oneLine(str(f, "url"));
  if (url && (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 300)) return { ok: false, error: "The website must be a full address starting with http:// or https://." };
  const community = str(f, "community"), category = str(f, "category");
  if ((community && !isUuid(community)) || (category && !isUuid(category))) return { ok: false, error: "Choose from the lists." };
  const organizer = oneLine(str(f, "organizer")).toLowerCase();
  if (organizer && !SLUG.test(organizer)) return { ok: false, error: "The organizer is a business's web address name, like valley-plumbing." };
  const status = str(f, "status") || "published";
  if (!["published", "cancelled", "pending"].includes(status)) return { ok: false, error: "Choose published, cancelled or pending." };
  return { ok: true, value: { id: id || null, title, description: description || null, community: community.toLowerCase() || null, category: category.toLowerCase() || null, venue: venue || null, address: address || null,
    startsAt: start.toISOString(), endsAt: end?.toISOString() ?? null, allDay, rrule, until: until?.toISOString() ?? null, url: url || null, organizerSlug: organizer || null, status: status as EventInput["status"] } };
}

// ---- articles
export const MAX_ITEMS = 25;
export interface ArticleInput {
  id: string | null; title: string; slug: string | null; excerpt: string | null; body: string; category: string | null; author: string | null; status: "draft" | "scheduled" | "published" | "archived";
  publishAt: string | null; featuredRank: number | null; seoTitle: string | null; seoDescription: string | null; spotlightSlug: string | null; items: { title: string; body: string; business_slug: string }[];
}
export function parseArticleInput(f: FormData, tz: string): Res<ArticleInput> {
  const id = str(f, "id");
  if (id && !isUuid(id)) return { ok: false, error: "Unknown article." };
  const title = oneLine(str(f, "title"));
  if (!title) return { ok: false, error: "Give the article a title." };
  if (title.length > 150) return { ok: false, error: "The title is limited to 150 characters." };
  const slug = oneLine(str(f, "slug")).toLowerCase();
  if (slug && (!SLUG.test(slug) || slug.length > 80)) return { ok: false, error: "The web address can only use lowercase letters, numbers and hyphens." };
  const excerpt = oneLine(str(f, "excerpt")), body = clean(str(f, "body"));
  if (excerpt.length > 300) return { ok: false, error: "The summary is limited to 300 characters." };
  if (body.length > 50000) return { ok: false, error: "The article is limited to 50,000 characters." };
  const seoTitle = oneLine(str(f, "seo_title")), seoDescription = oneLine(str(f, "seo_description"));
  if (seoTitle.length > 70 || seoDescription.length > 200) return { ok: false, error: "The search title is limited to 70 characters and the search description to 200." };
  const author = oneLine(str(f, "author"));
  if (author.length > 80) return { ok: false, error: "The author name is limited to 80 characters." };
  const status = str(f, "status") || "draft";
  if (!["draft", "scheduled", "published", "archived"].includes(status)) return { ok: false, error: "Choose draft, scheduled, published or archived." };
  let publishAt: Date | null = null;
  if (str(f, "publish_date")) {
    publishAt = localInstant(str(f, "publish_date"), str(f, "publish_time") || "09:00", tz);
    if (!publishAt) return { ok: false, error: "The publish date or time is not valid." };
  }
  if (status === "scheduled" && !publishAt) return { ok: false, error: "Choose when the article should go live." };
  const rankRaw = str(f, "featured_rank");
  if (rankRaw && !/^[1-5]$/.test(rankRaw)) return { ok: false, error: "The featured position is 1 to 5." };
  const category = str(f, "category");
  if (category && !isUuid(category)) return { ok: false, error: "Choose a category from the list." };
  const spotlight = oneLine(str(f, "spotlight")).toLowerCase();
  if (spotlight && !SLUG.test(spotlight)) return { ok: false, error: "The spotlight is a business's web address name, like valley-plumbing." };
  const items: ArticleInput["items"] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const t = oneLine(str(f, `item_title_${i}`)), b = clean(str(f, `item_body_${i}`)), biz = oneLine(str(f, `item_biz_${i}`)).toLowerCase();
    if (!t && !b && !biz) continue;
    if (!t) return { ok: false, error: `Guide item ${i + 1}: add a title.` };
    if (t.length > 150 || b.length > 2000) return { ok: false, error: `Guide item ${i + 1}: the title is limited to 150 characters and the text to 2000.` };
    if (biz && !SLUG.test(biz)) return { ok: false, error: `Guide item ${i + 1}: the business is its web address name, like valley-plumbing.` };
    items.push({ title: t, body: b, business_slug: biz });
  }
  return { ok: true, value: { id: id || null, title, slug: slug || null, excerpt: excerpt || null, body, category: category.toLowerCase() || null, author: author || null, status: status as ArticleInput["status"],
    publishAt: publishAt?.toISOString() ?? null, featuredRank: rankRaw ? Number(rankRaw) : null, seoTitle: seoTitle || null, seoDescription: seoDescription || null, spotlightSlug: spotlight || null, items } };
}
