import { test } from "node:test";
import assert from "node:assert/strict";
import { claimable, dealFacts, dealState, money, remaining, shareText, timeLeft } from "./model.ts";
import { hotlistUrl, isFiltered, parseHotlistParams } from "./params.ts";

const now = new Date("2026-10-05T18:00:00Z");
const deal = (o: object = {}) => ({ kind: "deal" as const, ends_at: "2026-10-20T06:00:00Z", quantity: null, claimed_count: 0, ...o });

test("a pick has no state; a deal is active by default", () => {
  assert.equal(dealState({ ...deal(), kind: "pick" }, now), null);
  assert.equal(dealState(deal(), now), "active");
});
test("expired beats everything, sold out beats ending soon", () => {
  assert.equal(dealState(deal({ ends_at: "2026-10-05T17:59:00Z", quantity: 5, claimed_count: 5 }), now), "expired");
  assert.equal(dealState(deal({ ends_at: "2026-10-06T00:00:00Z", quantity: 5, claimed_count: 5 }), now), "sold_out");
  assert.equal(dealState(deal({ ends_at: "2026-10-06T00:00:00Z" }), now), "ending_soon");
  assert.equal(dealState(deal({ ends_at: "2026-10-07T18:00:01Z" }), now), "active");
});
test("limited when few are left: at most 3, or a quarter of the quantity", () => {
  assert.equal(dealState(deal({ quantity: 8, claimed_count: 5 }), now), "limited");
  assert.equal(dealState(deal({ quantity: 8, claimed_count: 4 }), now), "active");
  assert.equal(dealState(deal({ quantity: 100, claimed_count: 75 }), now), "limited");
  assert.equal(dealState(deal({ quantity: 100, claimed_count: 74 }), now), "active");
  assert.equal(dealState(deal({ quantity: 6, claimed_count: "4" }), now), "limited");
});
test("only live states can be claimed", () => {
  assert.deepEqual(["active", "limited", "ending_soon", "sold_out", "expired"].map((s) => claimable(s as never)), [true, true, true, false, false]);
  assert.equal(claimable(null), false);
  assert.equal(remaining({ quantity: 8, claimed_count: "6" }), 2); assert.equal(remaining({ quantity: 3, claimed_count: 9 }), 0); assert.equal(remaining({ quantity: null, claimed_count: 9 }), null);
});
test("money drops empty cents and keeps real ones", () => {
  assert.equal(money(2500), "$25"); assert.equal(money(2450), "$24.50"); assert.equal(money(123400), "$1,234"); assert.equal(money(null), ""); assert.equal(money(0), "$0");
});
test("deal facts say what you get, what you save and when it ends", () => {
  assert.deepEqual(dealFacts({ original_cents: 4000, price_cents: 2500, ends_at: "2026-10-20T06:00:00Z" }, "America/Denver"), { value: "$40 value", price: "$25", save: "Save $15", ends: "Ends Oct 19" });
  assert.equal(dealFacts({ original_cents: null, price_cents: null, ends_at: null }, "America/Denver"), null);
});
test("time left is counted in calendar days in the local zone", () => {
  assert.equal(timeLeft("2026-10-05T17:00:00Z", now, "America/Denver"), "Ended");
  assert.equal(timeLeft("2026-10-05T20:00:00Z", now, "America/Denver"), "2 hours left");
  assert.equal(timeLeft("2026-10-06T03:00:00Z", now, "America/Denver"), "Ends today");
  assert.equal(timeLeft("2026-10-06T20:00:00Z", now, "America/Denver"), "Ends tomorrow");
  assert.equal(timeLeft("2026-10-09T20:00:00Z", now, "America/Denver"), "4 days left");
  assert.equal(timeLeft(null, now, "America/Denver"), null);
});
test("share text names the offer and the price", () => {
  assert.match(shareText({ title: "Breakfast for two", business_name: "Creekside Cafe", kind: "deal", price_cents: 2400, original_cents: 3600 }), /\$24 \(\$36 value\)/);
  assert.doesNotMatch(shareText({ title: "Pie", business_name: "Diner", kind: "pick", price_cents: null, original_cents: null }), /\$/);
});

test("params: valid values pass, junk falls back", () => {
  const p = parseHotlistParams({ view: "deals", category: "eat_drink", q: "  lattes\n", town: "afton", price: "2500", sort: "ending", page: "2" });
  assert.deepEqual(p, { kind: "deal", category: "eat_drink", q: "lattes", town: "afton", maxPrice: 2500, sort: "ending", page: 2 });
  const j = parseHotlistParams({ view: "x", category: "'; drop", q: "a".repeat(300), town: "../x", price: "7", sort: "random", page: "-3" });
  assert.deepEqual(j, { kind: null, category: null, q: "a".repeat(100), town: null, maxPrice: null, sort: "newest", page: 1 });
  assert.equal(isFiltered(parseHotlistParams({})), false); assert.equal(isFiltered(parseHotlistParams({ category: "shop" })), true);
});
test("params round-trip through the URL", () => {
  const p = parseHotlistParams({ view: "picks", category: "places", q: "view", price: "5000", sort: "popular", page: "3" });
  const u = new URL("http://x" + hotlistUrl(p)); assert.deepEqual(parseHotlistParams(Object.fromEntries(u.searchParams)), p);
  assert.equal(hotlistUrl({}), "/hotlist");
});
