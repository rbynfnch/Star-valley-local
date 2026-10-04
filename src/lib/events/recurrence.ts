// Expands recurring community events (community_events.rrule) into upcoming occurrences.
//
// Supports the common cases: FREQ=DAILY | WEEKLY (with BYDAY) | MONTHLY (same day of month), INTERVAL, COUNT-less,
// plus recurrence_until and exdates. Occurrences keep the SAME LOCAL TIME in the tenant's timezone across daylight
// saving changes. Anything else (BYSETPOS such as "first Saturday", BYMONTH, ...) is reported as unsupported and the
// caller shows only the event's own start. If those are needed, add the `rrule` library (ask first: new dependency).

export type RecurringEvent = {
  starts_at: string;
  ends_at: string | null;
  rrule: string | null;
  recurrence_until: string | null;
  exdates: string[];
};
export type Occurrence = { start: Date; end: Date | null };

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

type Parts = { y: number; m: number; d: number; h: number; mi: number };

function localParts(instant: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(instant)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, h: o.hour, mi: o.minute };
}

/** The instant at which the wall clock in `tz` reads y-m-d h:mi. (Two-pass offset fix handles DST.) */
export function zonedToUtc(p: Parts, tz: string): Date {
  let guess = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  for (let i = 0; i < 2; i++) {
    const seen = localParts(new Date(guess), tz);
    const seenMs = Date.UTC(seen.y, seen.m - 1, seen.d, seen.h, seen.mi);
    const wantMs = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess += wantMs - seenMs;
  }
  return new Date(guess);
}

function parseRule(rrule: string): Map<string, string> | null {
  const m = new Map<string, string>();
  for (const part of rrule.replace(/^RRULE:/i, "").split(";")) {
    const [k, v] = part.split("=");
    if (!k || v === undefined) return null;
    m.set(k.toUpperCase(), v.toUpperCase());
  }
  return m;
}

export function isSupportedRrule(rrule: string | null): boolean {
  if (!rrule) return true;
  const r = parseRule(rrule);
  if (!r) return false;
  const allowed = new Set(["FREQ", "BYDAY", "INTERVAL", "WKST"]);
  for (const k of r.keys()) if (!allowed.has(k)) return false;
  const freq = r.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") return false;
  if (r.has("BYDAY")) {
    if (freq !== "WEEKLY") return false;
    if (!r.get("BYDAY")!.split(",").every((d) => DAYS.includes(d))) return false;
  }
  const interval = r.get("INTERVAL");
  return interval === undefined || /^[1-9]\d{0,2}$/.test(interval);
}

/** Up to `count` occurrences starting at or after `from` (an occurrence still in progress counts). */
export function upcomingOccurrences(ev: RecurringEvent, from: Date, count: number, tz: string): Occurrence[] {
  const first = new Date(ev.starts_at);
  const duration = ev.ends_at ? new Date(ev.ends_at).getTime() - first.getTime() : null;
  const mk = (start: Date): Occurrence => ({ start, end: duration === null ? null : new Date(start.getTime() + duration) });
  const alive = (o: Occurrence) => (o.end ?? o.start).getTime() >= from.getTime();

  if (!ev.rrule || !isSupportedRrule(ev.rrule)) {
    const single = mk(first);
    return alive(single) ? [single] : [];
  }

  const rule = parseRule(ev.rrule)!;
  const freq = rule.get("FREQ")!;
  const interval = Number(rule.get("INTERVAL") ?? "1");
  const until = ev.recurrence_until ? new Date(ev.recurrence_until).getTime() : Infinity;
  const ex = new Set(ev.exdates.map((d) => new Date(d).getTime()));
  const base = localParts(first, tz);
  const baseDay = Date.UTC(base.y, base.m - 1, base.d);
  const wantedDays = freq === "WEEKLY"
    ? (rule.get("BYDAY")?.split(",").map((d) => DAYS.indexOf(d)) ?? [new Date(baseDay).getUTCDay()])
    : [];

  const out: Occurrence[] = [];
  const horizon = from.getTime() + 800 * 86_400_000;   // never scan more than ~2 years ahead
  for (let i = 0; i < 4000 && out.length < count; i++) {
    let dayMs: number | null = null;
    if (freq === "DAILY") dayMs = baseDay + i * interval * 86_400_000;
    else if (freq === "WEEKLY") {
      // every day, filtered to the wanted weekdays inside weeks that are a multiple of `interval` from the first week
      dayMs = baseDay + i * 86_400_000;
      const weeks = Math.floor((dayMs - (baseDay - new Date(baseDay).getUTCDay() * 86_400_000)) / (7 * 86_400_000));
      if (weeks % interval !== 0 || !wantedDays.includes(new Date(dayMs).getUTCDay())) dayMs = null;
    } else {
      const d = new Date(Date.UTC(base.y, base.m - 1 + i * interval, base.d));
      if (d.getUTCDate() === base.d) dayMs = d.getTime();        // skip months without that day (e.g. the 31st)
    }
    if (dayMs === null) continue;
    const d = new Date(dayMs);
    const start = zonedToUtc({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: base.h, mi: base.mi }, tz);
    if (start.getTime() < first.getTime()) continue;
    if (start.getTime() > until || start.getTime() > horizon) break;
    if (ex.has(start.getTime())) continue;
    const occ = mk(start);
    if (alive(occ)) out.push(occ);
  }
  return out;
}
