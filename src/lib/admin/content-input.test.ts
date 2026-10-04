import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHighlightsInput, parseHoursInput, parseServicesInput, parseLinksInput, parseFaqsInput, parseAreasInput, parseDealInput, parsePhotoMeta } from "./content-input.ts";

const ID = "3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b", ID2 = "4f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b";
const form = (o: Record<string, string | string[]>) => { const f = new FormData(); f.set("business", ID); for (const [k, v] of Object.entries(o)) for (const x of ([] as string[]).concat(v)) f.append(k, x); return f; };
const err = (r: { ok: boolean }) => (r as unknown as { error: string }).error;
const val = <T>(r: { ok: boolean; value?: T }) => { assert.equal(r.ok, true, JSON.stringify(r)); return (r as unknown as { value: T }).value; };
const TZ = "America/Denver";

test("every parser refuses an unknown business", () => {
  const f = new FormData(); f.set("business", "nope");
  for (const p of [parseHighlightsInput, parseHoursInput, parseServicesInput, parseLinksInput, parseFaqsInput, parseAreasInput, parsePhotoMeta]) assert.equal(p(f).ok, false);
  assert.equal(parseDealInput(f, TZ).ok, false);
});

test("highlights: lines trimmed, blanks dropped, price level optional", () => {
  assert.deepEqual(val(parseHighlightsInput(form({ highlights: "  Family owned \r\n\r\n24-hour service", price_range: "2" }))), { highlights: ["Family owned", "24-hour service"], price_range: 2 });
  assert.deepEqual(val(parseHighlightsInput(form({ highlights: "", price_range: "" }))), { highlights: [], price_range: null });
  assert.equal(parseHighlightsInput(form({ highlights: "x".repeat(41) })).ok, false);
  assert.equal(parseHighlightsInput(form({ highlights: "1\n2\n3\n4\n5\n6\n7\n8\n9" })).ok, false);
  assert.equal(parseHighlightsInput(form({ highlights: "", price_range: "4" })).ok, false);
  assert.equal(parseHighlightsInput(form({ highlights: "", price_range: "-1" })).ok, false);
});

test("hours: ranges collected per day, empty rows skipped, sorted", () => {
  const r = val(parseHoursInput(form({ h1_0_o: "13:00", h1_0_c: "17:00", h1_1_o: "08:00", h1_1_c: "12:00", h0_0_o: "10:00:00", h0_0_c: "14:00" })));
  assert.deepEqual(r, [{ day: 0, opens: "10:00", closes: "14:00" }, { day: 1, opens: "08:00", closes: "12:00" }, { day: 1, opens: "13:00", closes: "17:00" }]);
  assert.deepEqual(val(parseHoursInput(form({}))), []);
});
test("hours: half-filled, malformed, backwards and overlapping rows are refused with the day named", () => {
  assert.match(err(parseHoursInput(form({ h2_0_o: "09:00" }))), /Tuesday.*both/);
  assert.match(err(parseHoursInput(form({ h3_0_o: "9am", h3_0_c: "10:00" }))), /Wednesday/);
  assert.match(err(parseHoursInput(form({ h4_0_o: "10:00", h4_0_c: "10:00" }))), /Thursday.*after/);
  assert.match(err(parseHoursInput(form({ h5_0_o: "10:00", h5_0_c: "09:00" }))), /Friday/);
  assert.match(err(parseHoursInput(form({ h6_0_o: "08:00", h6_0_c: "12:00", h6_1_o: "11:00", h6_1_c: "13:00" }))), /Saturday.*overlap/);
  assert.equal(parseHoursInput(form({ h6_0_o: "08:00", h6_0_c: "12:00", h6_1_o: "12:00", h6_1_c: "13:00" })).ok, true);
  assert.equal(parseHoursInput(form({ h0_0_o: "24:00", h0_0_c: "25:00" })).ok, false);
});

test("services: bullets stripped, blanks and case-insensitive duplicates dropped, first spelling kept", () => {
  assert.deepEqual(val(parseServicesInput(form({ services: "- Drain cleaning\r\n\r\n• Water heaters\ndrain CLEANING\n  Repipes  " }))), ["Drain cleaning", "Water heaters", "Repipes"]);
  assert.equal(parseServicesInput(form({ services: "a".repeat(101) })).ok, false);
  assert.equal(parseServicesInput(form({ services: Array.from({ length: 41 }, (_, i) => "s" + i).join("\n") })).ok, false);
});

test("links: social hosts checked, www/m accepted, other links free-form, order stable", () => {
  const r = val(parseLinksInput(form({ link_facebook: "https://www.facebook.com/x", link_instagram: "https://instagram.com/x", other_0: "https://menu.example/a", other_1: "  " })));
  assert.deepEqual(r, [{ kind: "facebook", url: "https://www.facebook.com/x" }, { kind: "instagram", url: "https://instagram.com/x" }, { kind: "other", url: "https://menu.example/a" }]);
  assert.match(err(parseLinksInput(form({ link_facebook: "https://evil.example/facebook.com" }))), /Facebook/);
  assert.match(err(parseLinksInput(form({ link_facebook: "https://notfacebook.com/x" }))), /Facebook/);
  assert.match(err(parseLinksInput(form({ link_instagram: "https://facebook.com/x" }))), /Instagram/);
  assert.match(err(parseLinksInput(form({ other_0: "javascript:alert(1)" }))), /Other link/);
  assert.match(err(parseLinksInput(form({ other_0: "example.com" }))), /http/);
  assert.equal(parseLinksInput(form({ link_google_reviews: "https://g.page/r/abc" })).ok, true);
  assert.equal(parseLinksInput(form({ other_0: "https://a.example/" + "x".repeat(300) })).ok, false);
});

test("faqs: blank rows skipped, half rows refused naming the row, limits", () => {
  assert.deepEqual(val(parseFaqsInput(form({ faq_q_0: " Free quotes? ", faq_a_0: "Yes.\r\nCall us.", faq_q_1: "", faq_a_1: "" }))), [{ question: "Free quotes?", answer: "Yes.\nCall us." }]);
  assert.match(err(parseFaqsInput(form({ faq_q_2: "Q" }))), /Question 3/);
  assert.match(err(parseFaqsInput(form({ faq_a_0: "A" }))), /Question 1/);
  assert.equal(parseFaqsInput(form({ faq_q_0: "q".repeat(201), faq_a_0: "a" })).ok, false);
  assert.equal(parseFaqsInput(form({ faq_q_0: "q", faq_a_0: "a".repeat(1001) })).ok, false);
});

test("areas: de-duplicated ids, junk and over-limit refused", () => {
  assert.deepEqual(val(parseAreasInput(form({ community: [ID, ID, ID2.toUpperCase()], category: [ID] }))), { communities: [ID, ID2], categories: [ID] });
  assert.deepEqual(val(parseAreasInput(form({}))), { communities: [], categories: [] });
  assert.equal(parseAreasInput(form({ community: "nope" })).ok, false);
  assert.equal(parseAreasInput(form({ category: Array.from({ length: 6 }, (_, i) => `4f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6${i}`) })).ok, false);
});

const deal = (o: Record<string, string>) => form({ title: "Ten off", discount_type: "other", status: "published", ...o });
test("deal: percent and dollars parsed, other types carry no value", () => {
  assert.equal(val(parseDealInput(deal({ discount_type: "percent", discount_value: "15%" }), TZ)).value, 15);
  assert.equal(val(parseDealInput(deal({ discount_type: "amount", discount_value: "$10.50" }), TZ)).value, 10.5);
  assert.equal(val(parseDealInput(deal({ discount_type: "bogo", discount_value: "99" }), TZ)).value, null);
  assert.equal(parseDealInput(deal({ discount_type: "percent", discount_value: "0" }), TZ).ok, false);
  assert.equal(parseDealInput(deal({ discount_type: "percent", discount_value: "101" }), TZ).ok, false);
  assert.equal(parseDealInput(deal({ discount_type: "percent", discount_value: "" }), TZ).ok, false);
  assert.equal(parseDealInput(deal({ discount_type: "amount", discount_value: "-5" }), TZ).ok, false);
  assert.equal(parseDealInput(deal({ discount_type: "amount", discount_value: "1.234" }), TZ).ok, false);
});
test("deal: dates are whole days in the tenant timezone (end is 'through' that day)", () => {
  const v = val(parseDealInput(deal({ starts: "2026-07-01", ends: "2026-07-03" }), TZ));
  assert.equal(v.startsAt, "2026-07-01T06:00:00.000Z");                         // MDT = UTC-6
  assert.equal(v.endsAt, "2026-07-04T06:00:00.000Z");
  assert.equal(val(parseDealInput(deal({}), TZ)).startsAt, null);
  assert.equal(val(parseDealInput(deal({}), TZ)).endsAt, null);
  assert.equal(parseDealInput(deal({ starts: "2026-07-05", ends: "2026-07-04" }), TZ).ok, false);
  assert.equal(parseDealInput(deal({ starts: "2026-02-30" }), TZ).ok, false);
  assert.equal(parseDealInput(deal({ ends: "07/04/2026" }), TZ).ok, false);
  assert.equal(parseDealInput(deal({ starts: "2026-07-04", ends: "2026-07-04" }), TZ).ok, true);
});
test("deal: title, lengths, enums, id", () => {
  assert.equal(parseDealInput(deal({ title: "  " }), TZ).ok, false);
  assert.equal(parseDealInput(deal({ title: "t".repeat(121) }), TZ).ok, false);
  assert.equal(parseDealInput(deal({ description: "d".repeat(501) }), TZ).ok, false);
  assert.equal(parseDealInput(deal({ terms: "d".repeat(501) }), TZ).ok, false);
  assert.equal(parseDealInput(deal({ status: "live" }), TZ).ok, false);
  assert.equal(parseDealInput(deal({ discount_type: "free" }), TZ).ok, false);
  assert.equal(val(parseDealInput(deal({ deal: ID2 }), TZ)).id, ID2);
  assert.equal(val(parseDealInput(deal({}), TZ)).id, null);
  assert.equal(parseDealInput(deal({ deal: "x" }), TZ).ok, false);
  assert.equal(val(parseDealInput(deal({ title: "A\r\nB" }), TZ)).title, "A B");
});

test("photo metadata: alt text required except for a logo; roles checked", () => {
  assert.deepEqual(val(parsePhotoMeta(form({ alt: " Front  ", caption: "", role: "cover" }))), { photo: null, alt: "Front", caption: null, role: "cover" });
  assert.equal(parsePhotoMeta(form({ alt: "", role: "gallery" })).ok, false);
  assert.equal(parsePhotoMeta(form({ alt: "", role: "logo" })).ok, true);
  assert.equal(parsePhotoMeta(form({ alt: "x", role: "banner" })).ok, false);
  assert.equal(parsePhotoMeta(form({ alt: "x".repeat(201) })).ok, false);
  assert.equal(parsePhotoMeta(form({ alt: "x", caption: "c".repeat(151) })).ok, false);
  assert.equal(val(parsePhotoMeta(form({ alt: "x", photo: ID }))).photo, ID);
  assert.equal(parsePhotoMeta(form({ alt: "x", photo: "zzz" })).ok, false);
});
