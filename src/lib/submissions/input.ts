import { zonedToUtc } from "../events/recurrence.ts";
import { normalizeWebsite } from "../import/plan.ts";
import { isUuid } from "../admin/detail-input.ts";

// Parse what the three public forms post into the payload the database function expects.
// Friendly messages here; submission_create validates everything again (strict whitelist, lengths, dates, caps).
type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
export type Contact = { name: string | null; email: string | null; phone: string | null };
export type Parsed = { payload: Record<string, unknown>; contact: Contact; business?: string };

const str = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v : ""; };
const clean = (s: string, max: number) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits = (s: string) => s.replace(/\D/g, "");

function contact(f: FormData, emailRequired: boolean): Ok<Contact> | Err {
  const name = clean(str(f, "your_name"), 100) || null;
  const email = clean(str(f, "your_email"), 254).toLowerCase() || null;
  const phone = clean(str(f, "your_phone"), 40) || null;
  if (emailRequired && !email) return { ok: false, error: "Please add your email so we can follow up if we have a question." };
  if (email && !EMAIL.test(email)) return { ok: false, error: "That email address does not look right." };
  if (phone && digits(phone).length < 7) return { ok: false, error: "That phone number looks incomplete." };
  return { ok: true, value: { name, email, phone } };
}
function website(f: FormData, k: string): Ok<string | null> | Err {
  const raw = clean(str(f, k), 300);
  if (!raw) return { ok: true, value: null };
  const w = normalizeWebsite(raw);
  return w ? { ok: true, value: w } : { ok: false, error: "The website address does not look right. Use something like example.com." };
}
const uuidOrNull = (f: FormData, k: string): Ok<string | null> | Err => {
  const v = str(f, k);
  if (!v) return { ok: true, value: null };
  return isUuid(v) ? { ok: true, value: v.toLowerCase() } : { ok: false, error: "Choose a community and category from the list." };
};
const drop = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));

export function parseUpdate(f: FormData): Ok<Parsed> | Err {
  const business = str(f, "business");
  if (!isUuid(business) && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(business)) return { ok: false, error: "Unknown business." };
  const site = website(f, "website"); if (!site.ok) return site;
  const c = contact(f, false); if (!c.ok) return c;
  const phone = clean(str(f, "phone"), 40);
  if (phone && digits(phone).length < 7) return { ok: false, error: "That phone number looks incomplete." };
  const fields = drop({ name: clean(str(f, "name"), 200), address_line1: clean(str(f, "address"), 200), city: clean(str(f, "city"), 100), phone, website: site.value, hours: clean(str(f, "hours"), 300) });
  const note = clean(str(f, "note"), 1000);
  const closed = str(f, "closed") === "yes";
  if (Object.keys(fields).length === 0 && !note && !closed) return { ok: false, error: "Tell us what should change." };
  return { ok: true, value: { payload: drop({ fields, note, closed: closed ? true : null }) as Record<string, unknown>, contact: c.value, business } };
}

export function parseBusiness(f: FormData): Ok<Parsed> | Err {
  const name = clean(str(f, "name"), 200);
  if (!name) return { ok: false, error: "What is the business called?" };
  const site = website(f, "website"); if (!site.ok) return site;
  const com = uuidOrNull(f, "community_id"); if (!com.ok) return com;
  const cat = uuidOrNull(f, "category_id"); if (!cat.ok) return cat;
  const c = contact(f, true); if (!c.ok) return c;
  const phone = clean(str(f, "phone"), 40);
  if (phone && digits(phone).length < 7) return { ok: false, error: "The business phone number looks incomplete." };
  return { ok: true, value: { contact: c.value, payload: drop({ name, address_line1: clean(str(f, "address"), 200), city: clean(str(f, "city"), 100), phone, website: site.value,
    category_text: clean(str(f, "category_text"), 100), category_id: cat.value, community_id: com.value, description: clean(str(f, "description"), 500), note: clean(str(f, "note"), 1000) }) } };
}

/** Date "YYYY-MM-DD" + optional time "HH:MM" read as wall-clock time in the tenant's timezone. */
function when(date: string, time: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date); if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const chk = new Date(Date.UTC(y, mo - 1, d)); if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
  let h = 0, mi = 0;
  if (time) { const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time); if (!t) return null; h = Number(t[1]); mi = Number(t[2]); }
  return zonedToUtc({ y, m: mo, d, h, mi }, tz);
}

export function parseEvent(f: FormData, tz: string, now = new Date()): Ok<Parsed> | Err {
  const title = clean(str(f, "title"), 200);
  if (!title) return { ok: false, error: "What is the event called?" };
  const allDay = str(f, "all_day") === "yes";
  const start = when(str(f, "start_date"), allDay ? "" : str(f, "start_time"), tz);
  if (!start) return { ok: false, error: "Enter a valid start date" + (allDay ? "." : " and time.") };
  if (!allDay && !str(f, "start_time")) return { ok: false, error: "Enter a start time, or tick \"All day\"." };
  if (start.getTime() < now.getTime() - 24 * 3600 * 1000) return { ok: false, error: "That start date has already passed." };
  if (start.getTime() > now.getTime() + 2 * 365 * 24 * 3600 * 1000) return { ok: false, error: "Events can be submitted up to two years ahead." };
  let end: Date | null = null;
  const endDate = str(f, "end_date"), endTime = str(f, "end_time");
  if (endDate || endTime) {
    end = when(endDate || str(f, "start_date"), allDay ? "" : endTime, tz);
    if (!end) return { ok: false, error: "The end date or time does not look right." };
    if (end.getTime() < start.getTime()) return { ok: false, error: "The event cannot end before it starts." };
  }
  const url = website(f, "url"); if (!url.ok) return { ok: false, error: "The event link does not look right. Use something like example.com/event." };
  const com = uuidOrNull(f, "community_id"); if (!com.ok) return com;
  const c = contact(f, true); if (!c.ok) return c;
  return { ok: true, value: { contact: c.value, payload: drop({ title, description: clean(str(f, "description"), 2000), starts_at: start.toISOString(), ends_at: end ? end.toISOString() : null,
    all_day: allDay ? true : null, venue_name: clean(str(f, "venue_name"), 200), address: clean(str(f, "address"), 200), community_id: com.value, url: url.value,
    organizer: clean(str(f, "organizer"), 200), note: clean(str(f, "note"), 1000) }) } };
}
