// Structured hours -> display text and schema.org. The schema stores one row per open range per day (0 = Sunday);
// "no row" means closed OR unknown. We never say "open now" (CLAUDE.md §6), only what the hours are.

export type HourRow = { day_of_week: number; opens: string; closes: string };   // "08:00:00" style times, local to the business

export function formatClock(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]); const min = m[2];
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${h < 12 ? "AM" : "PM"}`;
}
const hhmm = (t: string) => /^(\d{1,2}):(\d{2})/.exec(t)?.slice(1, 3).map((x) => x.padStart(2, "0")).join(":") ?? t;

const ORDER = [1, 2, 3, 4, 5, 6, 0];                         // Monday first
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type HoursView = { kind: "unknown" } | { kind: "known"; groups: { label: string; text: string; closed: boolean }[] };

/** "Mon–Fri  8:00 AM – 5:00 PM" / "Sat–Sun  Closed". No rows at all = "unknown" (do NOT show every day as closed). */
export function groupHours(rows: HourRow[]): HoursView {
  if (rows.length === 0) return { kind: "unknown" };
  const perDay = new Map<number, string>();
  for (const d of ORDER) {
    const ranges = rows.filter((r) => r.day_of_week === d).sort((a, b) => a.opens.localeCompare(b.opens));
    perDay.set(d, ranges.length ? ranges.map((r) => `${formatClock(r.opens)} – ${formatClock(r.closes)}`).join(", ") : "Closed");
  }
  const groups: { days: number[]; text: string }[] = [];
  for (const d of ORDER) {
    const text = perDay.get(d)!;
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.days.push(d); else groups.push({ days: [d], text });
  }
  return { kind: "known", groups: groups.map((g) => ({
    label: g.days.length === 1 ? LONG[g.days[0]] : g.days.length === 2 ? `${SHORT[g.days[0]]} & ${SHORT[g.days[1]]}` : `${SHORT[g.days[0]]}–${SHORT[g.days[g.days.length - 1]]}`,
    text: g.text, closed: g.text === "Closed" })) };
}

/** schema.org openingHoursSpecification: days that share the same opens/closes are merged into one entry. */
export function openingHoursSpecification(rows: HourRow[]) {
  const byRange = new Map<string, { opens: string; closes: string; days: string[] }>();
  for (const d of ORDER) {
    for (const r of rows.filter((x) => x.day_of_week === d).sort((a, b) => a.opens.localeCompare(b.opens))) {
      const key = `${hhmm(r.opens)}-${hhmm(r.closes)}`;
      const e = byRange.get(key) ?? { opens: hhmm(r.opens), closes: hhmm(r.closes), days: [] };
      e.days.push(LONG[d]); byRange.set(key, e);
    }
  }
  return [...byRange.values()].map((e) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: e.days, opens: e.opens, closes: e.closes }));
}
