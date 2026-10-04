import { test } from "node:test";
import assert from "node:assert/strict";
import { dollarsToCents, parseActivateListing, parseActivatePlacement } from "./billing-input.ts";

const ID = "3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b";
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const NOW = new Date("2026-10-04T12:00:00Z"); const TZ = "America/Denver";
const val = <T,>(r: { ok: true; value: T } | { ok: false; error: string }) => { assert.ok(r.ok, r.ok ? "" : r.error); return (r as { value: T }).value; };
const err = (r: { ok: boolean; error?: string }) => { assert.ok(!r.ok); return (r as { error: string }).error; };

test("dollarsToCents: normal amounts, formatting, and refusals", () => {
  assert.equal(dollarsToCents("19"), 1900); assert.equal(dollarsToCents("$49.00"), 4900); assert.equal(dollarsToCents(" 1,900.5 "), 190050); assert.equal(dollarsToCents("0.99"), 99);
  for (const bad of ["", "0", "0.00", "-5", "19.999", "abc", "1e3", "10001", "$", "19,99,0", "١٩"]) assert.equal(dollarsToCents(bad), null, bad);
  assert.equal(dollarsToCents("10000"), 1000000);
});
test("listing: months or end date; paid needs an amount; comps ignore any amount", () => {
  assert.deepEqual(val(parseActivateListing(form({ business: ID, term: "months", months: "12", source: "paid", amount: "$199", product: "enhanced_yearly", auto_renews: "yes", notes: " Stripe pi_123 " }), TZ, NOW)),
    { business: ID, term: { months: 12 }, source: "paid", amountCents: 19900, product: "enhanced_yearly", autoRenews: true, notes: "Stripe pi_123" });
  assert.deepEqual(val(parseActivateListing(form({ business: ID, term: "months", months: "3", source: "founding_member", amount: "500" }), TZ, NOW)).amountCents, null);
  assert.match(err(parseActivateListing(form({ business: ID, term: "months", months: "1", source: "paid" }), TZ, NOW)), /amount paid/);
  assert.match(err(parseActivateListing(form({ business: ID, term: "months", months: "1", source: "bogus" }), TZ, NOW)), /paid or a comp/);
  assert.equal(parseActivateListing(form({ business: "x", term: "months", months: "1", source: "manual" }), TZ, NOW).ok, false);
});
test("months: integers 1 to 36 only", () => { for (const m of ["0", "37", "1.5", "abc", "", "-1"]) assert.equal(parseActivateListing(form({ business: ID, term: "months", months: m, source: "manual" }), TZ, NOW).ok, false, m); assert.ok(parseActivateListing(form({ business: ID, term: "months", months: "36", source: "manual" }), TZ, NOW).ok); });
test("end date means 'through that day' in the tenant timezone", () => {
  // through Oct 31 -> ends at the start of Nov 1 Mountain (MDT, UTC-6) = 06:00Z
  assert.deepEqual(val(parseActivateListing(form({ business: ID, term: "date", end_date: "2026-10-31", source: "manual" }), TZ, NOW)).term, { endsAt: "2026-11-01T06:00:00.000Z" });
  // through Dec 31 -> Jan 1 00:00 Mountain (MST, UTC-7) = 07:00Z, across the year boundary
  assert.deepEqual(val(parseActivateListing(form({ business: ID, term: "date", end_date: "2026-12-31", source: "manual" }), TZ, NOW)).term, { endsAt: "2027-01-01T07:00:00.000Z" });
});
test("end date refusals: past, impossible, malformed, too far", () => {
  for (const d of ["2026-10-03", "2026-02-30", "10/31/2026", "", "2031-01-01"]) assert.equal(parseActivateListing(form({ business: ID, term: "date", end_date: d, source: "manual" }), TZ, NOW).ok, false, d);
  assert.equal(parseActivateListing(form({ business: ID, term: "date", end_date: "2026-10-04", source: "manual" }), TZ, NOW).ok, true);   // today still runs until tonight
});
test("placement: category and community need a scope; homepage and Things to Do ignore one", () => {
  assert.deepEqual(val(parseActivatePlacement(form({ business: ID, slot: "category", scope: ID, term: "months", months: "1", source: "paid", amount: "49" }), TZ, NOW)),
    { business: ID, slot: "category", scope: ID, waitlistId: null, term: { months: 1 }, source: "paid", amountCents: 4900, product: null, autoRenews: false, notes: null });
  assert.match(err(parseActivatePlacement(form({ business: ID, slot: "category", term: "months", months: "1", source: "manual" }), TZ, NOW)), /category/);
  assert.match(err(parseActivatePlacement(form({ business: ID, slot: "community", term: "months", months: "1", source: "manual" }), TZ, NOW)), /community/);
  assert.equal(val(parseActivatePlacement(form({ business: ID, slot: "homepage", scope: ID, term: "months", months: "1", source: "manual" }), TZ, NOW)).scope, null);
  assert.equal(parseActivatePlacement(form({ business: ID, slot: "nowhere", term: "months", months: "1", source: "manual" }), TZ, NOW).ok, false);
  assert.equal(parseActivatePlacement(form({ business: ID, slot: "category", scope: "x", term: "months", months: "1", source: "manual" }), TZ, NOW).ok, false);
});
test("placement from the waitlist: the entry decides business, slot and scope", () => {
  const v = val(parseActivatePlacement(form({ waitlist_id: ID, term: "months", months: "2", source: "founding_member" }), TZ, NOW));
  assert.equal(v.waitlistId, ID); assert.deepEqual(v.term, { months: 2 });
  assert.equal(parseActivatePlacement(form({ waitlist_id: "nope", term: "months", months: "2", source: "manual" }), TZ, NOW).ok, false);
});
test("product codes and notes are cleaned", () => {
  const v = val(parseActivateListing(form({ business: ID, term: "months", months: "1", source: "manual", product: "Bad Code!", notes: "a\u0000b" + "x".repeat(900) }), TZ, NOW));
  assert.equal(v.product, null); assert.ok(v.notes!.length === 500 && !v.notes!.includes("\u0000"));
});
