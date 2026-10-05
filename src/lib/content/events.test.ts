import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEventList, buildIcs, describeRrule, eventJsonLd, eventsUrl, eventWindow, parseEventParams, EVENTS_PER_PAGE } from "./events.ts";
import type { Community, EventRow } from "../directory/types.ts";

const TZ = "America/Denver";
const communities: Community[] = [{ id: "c1", slug: "afton", name: "Afton", state: "WY", sort_order: 1 }, { id: "c2", slug: "alpine", name: "Alpine", state: "WY", sort_order: 2 }];
const cats = [{ id: "k1", slug: "food", name: "Food & Drink", color_token: "terracotta" }, { id: "k2", slug: "sports", name: "Sports", color_token: null }];
const ev = (o: Partial<EventRow> & { slug: string; starts_at: string }): EventRow => ({ id: o.slug, title: o.slug, ends_at: null, all_day: false, community_id: null, category_id: null, venue_name: null, rrule: null, recurrence_until: null, exdates: [], ...o });
// Wednesday 2026-10-07 12:00 in Denver (MDT, UTC-6)
const NOW = new Date("2026-10-07T18:00:00Z");

test("params: valid values are kept, junk falls back, pages are bounded", () => {
  assert.deepEqual(parseEventParams({ when: "weekend", community: "afton", category: "food", q: "  fair  ", page: "3" }), { range: "weekend", community: "afton", category: "food", q: "fair", page: 3 });
  assert.deepEqual(parseEventParams({ when: "tomorrow", community: "A B", category: "x".repeat(200), q: "a\u0000\n b", page: "-1" }), { range: "all", community: null, category: null, q: "a b", page: 1 });
  assert.equal(parseEventParams({ page: "99999" }).page, 1); assert.equal(parseEventParams({ page: ["2", "3"] }).page, 2); assert.equal(parseEventParams({ q: "x".repeat(500) }).q.length, 100);
});
test("eventsUrl omits defaults and encodes", () => {
  assert.equal(eventsUrl({}), "/events"); assert.equal(eventsUrl({ range: "all", page: 1 }), "/events");
  assert.equal(eventsUrl({ range: "weekend", community: "afton", q: "a&b", page: 2 }), "/events?when=weekend&community=afton&q=a%26b&page=2");
});
test("windows: today ends at local midnight; month ends at the first of next month; weekend is Fri 5 PM to Mon 12 AM", () => {
  assert.equal(eventWindow("today", NOW, TZ).end.toISOString(), "2026-10-08T06:00:00.000Z");
  assert.equal(eventWindow("month", NOW, TZ).end.toISOString(), "2026-11-01T06:00:00.000Z");
  const w = eventWindow("weekend", NOW, TZ);                                         // the coming Friday 2026-10-09
  assert.equal(w.start.toISOString(), "2026-10-09T23:00:00.000Z"); assert.equal(w.end.toISOString(), "2026-10-12T06:00:00.000Z");
  const sat = eventWindow("weekend", new Date("2026-10-10T18:00:00Z"), TZ);          // Saturday noon: already on, starts now
  assert.equal(sat.start.toISOString(), "2026-10-10T18:00:00.000Z"); assert.equal(sat.end.toISOString(), "2026-10-12T06:00:00.000Z");
  const sun = eventWindow("weekend", new Date("2026-10-11T18:00:00Z"), TZ); assert.equal(sun.end.toISOString(), "2026-10-12T06:00:00.000Z");
  assert.equal(eventWindow("month", new Date("2026-12-15T18:00:00Z"), TZ).end.toISOString(), "2027-01-01T07:00:00.000Z");   // December rolls the year
});
test("the weekend window follows DST (clocks go back on Nov 1)", () => {
  const w = eventWindow("weekend", new Date("2026-10-28T18:00:00Z"), TZ);            // Friday Oct 30, 5 PM MDT, to Monday Nov 2 00:00 MST
  assert.equal(w.start.toISOString(), "2026-10-30T23:00:00.000Z"); assert.equal(w.end.toISOString(), "2026-11-02T07:00:00.000Z");
});
test("rule text", () => {
  assert.equal(describeRrule("FREQ=WEEKLY;BYDAY=SA"), "Every Saturday"); assert.equal(describeRrule("FREQ=WEEKLY;BYDAY=TU,TH"), "Every Tuesday and Thursday");
  assert.equal(describeRrule("FREQ=WEEKLY;BYDAY=MO,WE,FR"), "Every Monday, Wednesday and Friday"); assert.equal(describeRrule("FREQ=DAILY"), "Every day");
  assert.equal(describeRrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=SA"), "Every 2 weeks on Saturday"); assert.equal(describeRrule("FREQ=WEEKLY"), "Every week");
  assert.equal(describeRrule("FREQ=MONTHLY"), "Every month on the same day"); assert.equal(describeRrule("FREQ=MONTHLY;BYSETPOS=1"), null); assert.equal(describeRrule(null), null);
});
test("the list expands recurring events into dated occurrences, sorted, within the range", () => {
  const rows = [ev({ slug: "market", starts_at: "2026-10-03T14:00:00Z", rrule: "FREQ=WEEKLY;BYDAY=SA", community_id: "c1", venue_name: "Square" }), ev({ slug: "fair", starts_at: "2026-10-17T16:00:00Z", community_id: "c2" })];
  const all = buildEventList(rows, communities, cats, parseEventParams({}), NOW, TZ);
  assert.equal(all.items[0].slug, "market"); assert.equal(all.items[0].start.toISOString(), "2026-10-10T14:00:00.000Z"); assert.equal(all.items[0].repeatText, "Every Saturday");
  assert.ok(all.total >= 15 && all.items.some((i) => i.slug === "fair"));
  const wk = buildEventList(rows, communities, cats, parseEventParams({ when: "weekend" }), NOW, TZ);
  assert.deepEqual(wk.items.map((i) => i.slug), ["market"]); assert.equal(wk.total, 1);
  assert.equal(buildEventList(rows, communities, cats, parseEventParams({ when: "today" }), NOW, TZ).total, 0);
});
test("filters: community, category, search; unknown slugs match nothing", () => {
  const rows = [ev({ slug: "a", title: "Pie Social", starts_at: "2026-10-12T18:00:00Z", community_id: "c1", category_id: "k1", venue_name: "Hall" }), ev({ slug: "b", title: "Game", starts_at: "2026-10-13T18:00:00Z", community_id: "c2", category_id: "k2", description: "bring a PIE" })];
  const f = (o: Record<string, string>) => buildEventList(rows, communities, cats, parseEventParams(o), NOW, TZ).items.map((i) => i.slug);
  assert.deepEqual(f({ community: "afton" }), ["a"]); assert.deepEqual(f({ category: "sports" }), ["b"]); assert.deepEqual(f({ q: "pie" }), ["a", "b"]); assert.deepEqual(f({ q: "hall" }), ["a"]);
  assert.deepEqual(f({ community: "nowhere" }), []); assert.deepEqual(f({ category: "nothing" }), []);
});
test("past events are not listed; an event in progress is", () => {
  const rows = [ev({ slug: "past", starts_at: "2026-10-01T18:00:00Z", ends_at: "2026-10-01T20:00:00Z" }), ev({ slug: "now", starts_at: "2026-10-07T16:00:00Z", ends_at: "2026-10-07T20:00:00Z" })];
  assert.deepEqual(buildEventList(rows, communities, cats, parseEventParams({}), NOW, TZ).items.map((i) => i.slug), ["now"]);
});
test("paging: 12 per page, page clamped, total counted", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ev({ slug: `e${i}`, starts_at: new Date(Date.UTC(2026, 9, 10 + i, 18)).toISOString() }));
  const p2 = buildEventList(rows, communities, cats, parseEventParams({ page: "2" }), NOW, TZ);
  assert.equal(p2.items.length, EVENTS_PER_PAGE); assert.equal(p2.items[0].slug, `e${EVENTS_PER_PAGE}`); assert.equal(p2.total, 30); assert.equal(p2.totalPages, 3);
  assert.equal(buildEventList(rows, communities, cats, parseEventParams({ page: "9" }), NOW, TZ).page, 3);
});
test("JSON-LD: a dated, scheduled, offline Event with place and organiser; nothing empty", () => {
  const j = eventJsonLd({ origin: "https://svl.example", path: "/events/fair", title: "Fair", description: "Pies", start: new Date("2026-10-17T16:00:00Z"), end: new Date("2026-10-17T22:00:00Z"), allDay: false, venue: "Park", address: "1 Main", locality: "Afton", region: "WY", organizer: "Town", url: null, image: null }) as Record<string, unknown>;
  assert.equal(j["@type"], "Event"); assert.equal(j.startDate, "2026-10-17T16:00:00.000Z"); assert.equal(j.eventStatus, "https://schema.org/EventScheduled");
  assert.equal((j.location as { name: string }).name, "Park"); assert.equal(j.image, undefined);
  const bare = eventJsonLd({ origin: "https://svl.example", path: "/events/x", title: "X", description: null, start: new Date("2026-10-17T16:00:00Z"), end: null, allDay: false, venue: null, address: null, locality: null, region: null, organizer: null, url: null, image: null }) as Record<string, unknown>;
  assert.equal(bare.location, undefined); assert.equal(bare.endDate, undefined); assert.equal(bare.organizer, undefined);
});
const icsOf = (o: Partial<Parameters<typeof buildIcs>[0]> = {}) => buildIcs({ uid: "fair@svl.example", now: new Date("2026-10-07T18:00:00Z"), tenantName: "Star Valley Local", title: "Fall Fair", description: "Pies, pumpkins; fun", start: new Date("2026-10-17T16:00:00Z"), end: new Date("2026-10-17T22:00:00Z"), allDay: false, location: "Park, Afton", url: "https://svl.example/events/fair", tz: TZ, ...o });
test("ICS: valid structure, CRLF, UTC times, escaped text", () => {
  const t = icsOf();
  assert.ok(t.startsWith("BEGIN:VCALENDAR\r\n") && t.endsWith("END:VCALENDAR\r\n")); assert.doesNotMatch(t.replace(/\r\n/g, ""), /[\r\n]/);
  assert.match(t, /DTSTART:20261017T160000Z\r\n/); assert.match(t, /DTEND:20261017T220000Z\r\n/); assert.match(t, /DESCRIPTION:Pies\\, pumpkins\; fun\r\n/); assert.match(t, /LOCATION:Park\\, Afton\r\n/); assert.match(t, /UID:fair@svl\.example\r\n/);
});
test("ICS: a newline or property name in text cannot inject a property; long lines fold at 75 bytes", () => {
  const t = icsOf({ title: "Fair\r\nATTENDEE:mailto:evil@x.test", description: "x".repeat(300) });
  assert.doesNotMatch(t, /\r\nATTENDEE:/); assert.match(t, /SUMMARY:Fair\\nATTENDEE:mailto:evil@x\.test/);
  for (const line of t.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line.slice(0, 30));
  assert.equal(icsOf({ uid: "a b\r\nX:y" }).includes("\r\nX:y"), false);
});
test("ICS: all-day events use dates in the tenant timezone, end exclusive; no end means one hour", () => {
  const t = icsOf({ allDay: true, start: new Date("2026-10-17T06:00:00Z"), end: new Date("2026-10-18T05:00:00Z") });
  assert.match(t, /DTSTART;VALUE=DATE:20261017\r\n/); assert.match(t, /DTEND;VALUE=DATE:20261018\r\n/);
  assert.match(icsOf({ end: null }), /DTEND:20261017T170000Z/);
});
