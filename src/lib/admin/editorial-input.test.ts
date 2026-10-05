import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRrule, dateField, localInstant, parseArticleInput, parseEventInput, repeatFromRrule, timeField } from "./editorial-input.ts";

const TZ = "America/Denver", ID = "3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b";
const form = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of ([] as string[]).concat(v)) f.append(k, x); return f; };
const ok = <T>(r: { ok: boolean; value?: T }) => { assert.equal(r.ok, true, JSON.stringify(r)); return (r as unknown as { value: T }).value; };
const err = (r: { ok: boolean }) => (r as unknown as { error: string }).error;
const ev = (o: Record<string, string | string[]> = {}) => form({ title: "Fair", start_date: "2026-10-17", start_time: "10:00", ...o });

test("dates and times: tenant-local to UTC and back, DST included", () => {
  assert.equal(localInstant("2026-10-17", "10:00", TZ)?.toISOString(), "2026-10-17T16:00:00.000Z");
  assert.equal(localInstant("2026-11-01", "12:00", TZ)?.toISOString(), "2026-11-01T19:00:00.000Z");        // after the clocks go back
  assert.equal(localInstant("2026-10-17", "", TZ)?.toISOString(), "2026-10-17T06:00:00.000Z"); assert.equal(localInstant("2026-10-17", "", TZ, true)?.toISOString(), "2026-10-18T05:59:00.000Z");
  for (const [d, t] of [["2026-02-30", "10:00"], ["17/10/2026", "10:00"], ["2026-10-17", "25:00"], ["2026-10-17", "9am"], ["", ""]]) assert.equal(localInstant(d, t, TZ), null, `${d} ${t}`);
  assert.equal(dateField("2026-10-17T16:00:00Z", TZ), "2026-10-17"); assert.equal(timeField("2026-10-17T16:00:00Z", TZ), "10:00"); assert.equal(timeField("2026-10-17T06:00:00Z", TZ), "00:00");
  assert.equal(dateField(null, TZ), ""); assert.equal(timeField("junk", TZ), "");
});
test("recurrence round-trips through the form's choices", () => {
  assert.equal(buildRrule({ freq: "none", interval: 1, days: [] }), null); assert.equal(buildRrule({ freq: "daily", interval: 1, days: ["MO"] }), "FREQ=DAILY");
  assert.equal(buildRrule({ freq: "weekly", interval: 2, days: ["SA", "TU"] }), "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SA"); assert.equal(buildRrule({ freq: "weekly", interval: 1, days: [] }), "FREQ=WEEKLY");
  assert.equal(buildRrule({ freq: "monthly", interval: 3, days: [] }), "FREQ=MONTHLY;INTERVAL=3");
  assert.deepEqual(repeatFromRrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SA"), { freq: "weekly", interval: 2, days: ["TU", "SA"] });
  assert.deepEqual(repeatFromRrule("FREQ=MONTHLY;BYSETPOS=1"), { freq: "none", interval: 1, days: [] }); assert.deepEqual(repeatFromRrule(null), { freq: "none", interval: 1, days: [] });
});
test("event: a timed event becomes UTC instants; no end means none; all-day spans local days", () => {
  const v = ok(parseEventInput(ev({ end_time: "14:30", community: ID, status: "published", organizer: "Valley-Plumbing" }), TZ));
  assert.equal(v.startsAt, "2026-10-17T16:00:00.000Z"); assert.equal(v.endsAt, "2026-10-17T20:30:00.000Z"); assert.equal(v.organizerSlug, "valley-plumbing"); assert.equal(v.community, ID);
  assert.equal(ok(parseEventInput(ev(), TZ)).endsAt, null);
  const d = ok(parseEventInput(form({ title: "Fair", all_day: "on", start_date: "2026-10-17", end_date: "2026-10-18" }), TZ));
  assert.equal(d.allDay, true); assert.equal(d.startsAt, "2026-10-17T06:00:00.000Z"); assert.equal(d.endsAt, "2026-10-19T05:59:00.000Z");
  assert.equal(ok(parseEventInput(form({ title: "Fair", all_day: "on", start_date: "2026-10-17" }), TZ)).endsAt, "2026-10-18T05:59:00.000Z");
});
test("event: recurrence and its end date", () => {
  const v = ok(parseEventInput(ev({ repeat: "weekly", repeat_interval: "2", repeat_days: ["SA", "TU"], repeat_until: "2026-12-31" }), TZ));
  assert.equal(v.rrule, "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SA"); assert.equal(v.until, "2027-01-01T06:59:00.000Z");
  assert.match(err(parseEventInput(ev({ repeat_until: "2026-12-31" }), TZ)), /how the event repeats/);
  assert.match(err(parseEventInput(ev({ repeat: "weekly", repeat_until: "2026-10-01" }), TZ)), /after the first date/);
  assert.equal(parseEventInput(ev({ repeat: "yearly" }), TZ).ok, false); assert.equal(parseEventInput(ev({ repeat: "weekly", repeat_interval: "0" }), TZ).ok, false); assert.equal(parseEventInput(ev({ repeat: "weekly", repeat_days: ["XX"] }), TZ).ok, false);
});
test("event: required fields and limits", () => {
  assert.match(err(parseEventInput(ev({ title: "  " }), TZ)), /title/); assert.match(err(parseEventInput(form({ title: "x" }), TZ)), /first day/);
  assert.match(err(parseEventInput(form({ title: "x", start_date: "2026-10-17" }), TZ)), /start time/);
  assert.match(err(parseEventInput(ev({ end_time: "09:00" }), TZ)), /cannot end before/); assert.match(err(parseEventInput(ev({ end_date: "2026-10-16" }), TZ)), /cannot end before/);
  for (const bad of [{ title: "x".repeat(151) }, { description: "d".repeat(3001) }, { venue: "v".repeat(151) }, { url: "javascript:alert(1)" }, { url: "https://a b.example" }, { status: "rejected" }, { community: "nope" }, { organizer: "Not A Slug!" }, { id: "x" }, { start_time: "99:99" }] as Record<string, string>[])
    assert.equal(parseEventInput(ev(bad), TZ).ok, false, JSON.stringify(bad));
});
const ar = (o: Record<string, string | string[]> = {}) => form({ title: "Ten Things", body: "Hello", ...o });
test("article: a draft with trimmed text, no slug, no time", () => {
  const v = ok(parseArticleInput(ar({ title: "  Ten\r\nThings ", slug: "", excerpt: " Hi ", author: " Pat ", category: ID }), TZ));
  assert.deepEqual([v.title, v.slug, v.excerpt, v.author, v.status, v.publishAt, v.featuredRank, v.category], ["Ten Things", null, "Hi", "Pat", "draft", null, null, ID]);
});
test("article: publish time is tenant-local (default 9 AM) and a scheduled article needs one", () => {
  assert.equal(ok(parseArticleInput(ar({ status: "scheduled", publish_date: "2026-10-20", publish_time: "08:30" }), TZ)).publishAt, "2026-10-20T14:30:00.000Z");
  assert.equal(ok(parseArticleInput(ar({ publish_date: "2026-10-20" }), TZ)).publishAt, "2026-10-20T15:00:00.000Z");
  assert.match(err(parseArticleInput(ar({ status: "scheduled" }), TZ)), /go live/); assert.equal(parseArticleInput(ar({ publish_date: "2026-13-01" }), TZ).ok, false);
});
test("article: slug, featured position, spotlight and limits", () => {
  assert.equal(ok(parseArticleInput(ar({ slug: "My-Slug", featured_rank: "3", spotlight: "Valley-Plumbing" }), TZ)).slug, "my-slug");
  for (const bad of [{ slug: "has spaces" }, { slug: "x".repeat(81) }, { featured_rank: "6" }, { featured_rank: "0" }, { spotlight: "Not A Slug!" }, { title: " " }, { title: "t".repeat(151) }, { excerpt: "e".repeat(301) }, { body: "b".repeat(50001) },
    { seo_title: "s".repeat(71) }, { seo_description: "s".repeat(201) }, { author: "a".repeat(81) }, { status: "live" }, { category: "nope" }, { id: "x" }] as Record<string, string>[]) assert.equal(parseArticleInput(ar(bad), TZ).ok, false, JSON.stringify(bad));
});
test("article: guide items are collected in order; blank rows skipped; a row without a title is refused", () => {
  const v = ok(parseArticleInput(ar({ item_title_0: " Hike ", item_body_0: "Go\r\nnow", item_title_2: "Shop", item_biz_2: "Main-Street-Gifts", item_title_1: "", item_body_1: "" }), TZ));
  assert.deepEqual(v.items, [{ title: "Hike", body: "Go\nnow", business_slug: "" }, { title: "Shop", body: "", business_slug: "main-street-gifts" }]);
  assert.match(err(parseArticleInput(ar({ item_body_3: "text only" }), TZ)), /item 4: add a title/);
  assert.match(err(parseArticleInput(ar({ item_title_0: "x", item_biz_0: "Bad Slug!" }), TZ)), /item 1/);
  assert.equal(parseArticleInput(ar({ item_title_0: "t".repeat(151) }), TZ).ok, false); assert.equal(parseArticleInput(ar({ item_title_0: "t", item_body_0: "b".repeat(2001) }), TZ).ok, false);
});
