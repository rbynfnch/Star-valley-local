import { zonedToUtc } from "../events/recurrence.ts";
import { isUuid } from "./detail-input.ts";

// Parsers for the content editor forms. They give friendly messages and drop junk early; the database (set_business_*,
// save_deal, add_business_photo) enforces the same rules again.
type Res<T> = { ok: true; business: string; value: T } | { ok: false; error: string };
const str = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v : ""; };
const clean = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
const oneLine = (s: string) => clean(s).replace(/\s*\n\s*/g, " ");
const biz = (f: FormData) => { const b = str(f, "business"); return isUuid(b) ? b : null; };
const NO_BIZ = { ok: false, error: "Unknown business." } as const;

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const RANGES_PER_DAY = 3;

// ---- highlights and price level
export function parseHighlightsInput(f: FormData): Res<{ highlights: string[]; price_range: number | null }> {
  const business = biz(f); if (!business) return NO_BIZ;
  const lines = clean(str(f, "highlights")).split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 8) return { ok: false, error: "At most 8 highlights." };
  if (lines.some((l) => l.length > 40)) return { ok: false, error: "A highlight is limited to 40 characters." };
  const p = str(f, "price_range");
  if (p !== "" && !/^[0-3]$/.test(p)) return { ok: false, error: "Choose a price level from the list." };
  return { ok: true, business, value: { highlights: lines, price_range: p === "" ? null : Number(p) } };
}

// ---- hours: fields h<day>_<i>_o / h<day>_<i>_c, 24-hour HH:MM from <input type="time">
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
export function parseHoursInput(f: FormData): Res<{ day: number; opens: string; closes: string }[]> {
  const business = biz(f); if (!business) return NO_BIZ;
  const rows: { day: number; opens: string; closes: string }[] = [];
  for (let day = 0; day < 7; day++) {
    const mine: { opens: string; closes: string }[] = [];
    for (let i = 0; i < RANGES_PER_DAY; i++) {
      const o = str(f, `h${day}_${i}_o`).trim(), c = str(f, `h${day}_${i}_c`).trim();
      if (!o && !c) continue;
      if (!o || !c) return { ok: false, error: `${DAYS[day]}: give both an opening and a closing time, or clear both.` };
      if (!TIME.test(o) || !TIME.test(c)) return { ok: false, error: `${DAYS[day]}: times must look like 08:30.` };
      const [opens, closes] = [o.slice(0, 5), c.slice(0, 5)];
      if (closes <= opens) return { ok: false, error: `${DAYS[day]}: closing must be after opening (for late hours, end at 11:59 PM and start the next day at 12:00 AM).` };
      mine.push({ opens, closes });
    }
    mine.sort((a, b) => a.opens.localeCompare(b.opens));
    for (let i = 1; i < mine.length; i++) if (mine[i].opens < mine[i - 1].closes) return { ok: false, error: `${DAYS[day]}: two time ranges overlap.` };
    for (const m of mine) rows.push({ day, ...m });
  }
  return { ok: true, business, value: rows };
}

// ---- services: one per line
export function parseServicesInput(f: FormData): Res<string[]> {
  const business = biz(f); if (!business) return NO_BIZ;
  const seen = new Set<string>(), out: string[] = [];
  for (const raw of clean(str(f, "services")).split("\n")) {
    const s = raw.trim().replace(/^[-*•]\s*/, "");
    if (!s) continue;
    if (s.length > 100) return { ok: false, error: "A service name is limited to 100 characters." };
    if (seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase()); out.push(s);
  }
  if (out.length > 40) return { ok: false, error: "At most 40 services." };
  return { ok: true, business, value: out };
}

// ---- links: link_<kind> inputs, plus other_0..2
export const SOCIAL_KINDS = [
  { kind: "facebook", label: "Facebook", host: ["facebook.com", "fb.com", "fb.me"] },
  { kind: "instagram", label: "Instagram", host: ["instagram.com"] },
  { kind: "x", label: "X (Twitter)", host: ["x.com", "twitter.com"] },
  { kind: "youtube", label: "YouTube", host: ["youtube.com", "youtu.be"] },
  { kind: "linkedin", label: "LinkedIn", host: ["linkedin.com"] },
  { kind: "tiktok", label: "TikTok", host: ["tiktok.com"] },
  { kind: "google_business_profile", label: "Google Business Profile", host: null },
  { kind: "google_reviews", label: "Google reviews page", host: null },
] as const;
export const OTHER_LINKS = 3;
export function parseLinksInput(f: FormData): Res<{ kind: string; url: string }[]> {
  const business = biz(f); if (!business) return NO_BIZ;
  const out: { kind: string; url: string }[] = [];
  const check = (url: string, label: string, hosts: readonly string[] | null) => {
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 300) return `${label}: enter a full web address starting with http:// or https://.`;
    if (hosts) {
      const host = (/^[a-z]+:\/\/([^/?#:@]+)/i.exec(url)?.[1] ?? "").toLowerCase().replace(/^(www|m|mobile)\./, "");
      if (!hosts.includes(host)) return `${label}: that does not look like a ${label} address.`;
    }
    return null;
  };
  for (const s of SOCIAL_KINDS) {
    const url = oneLine(str(f, `link_${s.kind}`));
    if (!url) continue;
    const bad = check(url, s.label, s.host); if (bad) return { ok: false, error: bad };
    out.push({ kind: s.kind, url });
  }
  for (let i = 0; i < OTHER_LINKS; i++) {
    const url = oneLine(str(f, `other_${i}`));
    if (!url) continue;
    const bad = check(url, "Other link", null); if (bad) return { ok: false, error: bad };
    out.push({ kind: "other", url });
  }
  return { ok: true, business, value: out };
}

// ---- FAQs: faq_q_<i> / faq_a_<i>
export const MAX_FAQS = 20;
export function parseFaqsInput(f: FormData): Res<{ question: string; answer: string }[]> {
  const business = biz(f); if (!business) return NO_BIZ;
  const out: { question: string; answer: string }[] = [];
  for (let i = 0; i < MAX_FAQS; i++) {
    const q = oneLine(str(f, `faq_q_${i}`)), a = clean(str(f, `faq_a_${i}`));
    if (!q && !a) continue;
    if (!q || !a) return { ok: false, error: `Question ${i + 1}: write both the question and its answer, or clear both.` };
    if (q.length > 200) return { ok: false, error: `Question ${i + 1}: the question is limited to 200 characters.` };
    if (a.length > 1000) return { ok: false, error: `Question ${i + 1}: the answer is limited to 1000 characters.` };
    out.push({ question: q, answer: a });
  }
  return { ok: true, business, value: out };
}

// ---- service area: checkboxes named community / category
export function parseAreasInput(f: FormData): Res<{ communities: string[]; categories: string[] }> {
  const business = biz(f); if (!business) return NO_BIZ;
  const pick = (k: string) => [...new Set(f.getAll(k).filter((v): v is string => typeof v === "string"))];
  const communities = pick("community"), categories = pick("category");
  if ([...communities, ...categories].some((v) => !isUuid(v))) return { ok: false, error: "Choose from the lists." };
  if (communities.length > 20) return { ok: false, error: "At most 20 communities." };
  if (categories.length > 5) return { ok: false, error: "At most 5 extra categories." };
  return { ok: true, business, value: { communities: communities.map((v) => v.toLowerCase()), categories: categories.map((v) => v.toLowerCase()) } };
}

// ---- a deal. Dates are whole days in the tenant's timezone: starts at the start of its day, ends when the day after ends.
export interface DealInput { id: string | null; title: string; description: string | null; terms: string | null; type: "percent" | "amount" | "bogo" | "other"; value: number | null; status: "draft" | "published" | "archived"; startsAt: string | null; endsAt: string | null }
function dayStart(s: string, tz: string, plusDays = 0): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const chk = new Date(Date.UTC(y, mo - 1, d)); if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
  const n = new Date(Date.UTC(y, mo - 1, d + plusDays));
  return zonedToUtc({ y: n.getUTCFullYear(), m: n.getUTCMonth() + 1, d: n.getUTCDate(), h: 0, mi: 0 }, tz);
}
export function parseDealInput(f: FormData, tz: string): Res<DealInput> {
  const business = biz(f); if (!business) return NO_BIZ;
  const idRaw = str(f, "deal");
  if (idRaw && !isUuid(idRaw)) return { ok: false, error: "Unknown deal." };
  const title = oneLine(str(f, "title"));
  if (!title) return { ok: false, error: "Give the deal a title." };
  if (title.length > 120) return { ok: false, error: "The title is limited to 120 characters." };
  const description = clean(str(f, "description")), terms = clean(str(f, "terms"));
  if (description.length > 500 || terms.length > 500) return { ok: false, error: "Description and terms are limited to 500 characters each." };
  const type = str(f, "discount_type");
  if (!["percent", "amount", "bogo", "other"].includes(type)) return { ok: false, error: "Choose a deal type." };
  const status = str(f, "status");
  if (!["draft", "published", "archived"].includes(status)) return { ok: false, error: "Choose draft, published or archived." };
  let value: number | null = null;
  if (type === "percent" || type === "amount") {
    const raw = str(f, "discount_value").trim().replace(/^\$/, "").replace(/%$/, "");
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(raw)) return { ok: false, error: type === "percent" ? "Enter the percent off, like 15." : "Enter the dollars off, like 10 or 10.50." };
    value = Number(raw);
    if (type === "percent" && (value <= 0 || value > 100)) return { ok: false, error: "A percent discount must be between 0 and 100." };
    if (type === "amount" && (value <= 0 || value > 100000)) return { ok: false, error: "A dollar discount must be more than $0." };
  }
  let startsAt: Date | null = null, endsAt: Date | null = null;
  if (str(f, "starts")) { startsAt = dayStart(str(f, "starts"), tz); if (!startsAt) return { ok: false, error: "The start date is not a real date." }; }
  if (str(f, "ends")) { endsAt = dayStart(str(f, "ends"), tz, 1); if (!endsAt) return { ok: false, error: "The end date is not a real date." }; }
  if (endsAt && startsAt && endsAt <= startsAt) return { ok: false, error: "The deal must end after it starts." };
  return { ok: true, business, value: { id: idRaw || null, title, description: description || null, terms: terms || null, type: type as DealInput["type"], value, status: status as DealInput["status"], startsAt: startsAt?.toISOString() ?? null, endsAt: endsAt?.toISOString() ?? null } };
}

// ---- photos
export interface PhotoMeta { alt: string; caption: string | null; role: "logo" | "cover" | "gallery" }
export function parsePhotoMeta(f: FormData): Res<PhotoMeta & { photo: string | null }> {
  const business = biz(f); if (!business) return NO_BIZ;
  const photo = str(f, "photo");
  if (photo && !isUuid(photo)) return { ok: false, error: "Unknown photo." };
  const role = str(f, "role") || "gallery";
  if (!["logo", "cover", "gallery"].includes(role)) return { ok: false, error: "Choose logo, cover or gallery." };
  const alt = oneLine(str(f, "alt")), caption = oneLine(str(f, "caption"));
  if (alt.length > 200) return { ok: false, error: "Alt text is limited to 200 characters." };
  if (caption.length > 150) return { ok: false, error: "A caption is limited to 150 characters." };
  if (!alt && role !== "logo") return { ok: false, error: "Describe the photo for people who cannot see it (alt text)." };
  return { ok: true, business, value: { photo: photo || null, alt, caption: caption || null, role: role as PhotoMeta["role"] } };
}
