import { test } from "node:test";
import assert from "node:assert/strict";
import { centsToDollars, dollarsToCents, parseFeatureIds, parseHotlistInput } from "./hotlist-input.ts";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const base = { kind: "deal", business: "sample-creekside-cafe", status: "draft", title: "Breakfast for two", category: "eat_drink", badge: "hot_deal", original: "36", price: "24", quantity: "40", code_prefix: "cafe24", redemption: "Show the code.", end_date: "2026-10-31", start_date: "2026-10-05" };

test("dollars become cents; junk is refused", () => {
  assert.equal(dollarsToCents("$1,200"), 120000); assert.equal(dollarsToCents("24.50"), 2450); assert.equal(dollarsToCents("25"), 2500);
  for (const bad of ["", "-5", "2.505", "abc", "1e3", "99999999"]) assert.equal(dollarsToCents(bad), null, bad);
  assert.equal(centsToDollars(2450), "24.50"); assert.equal(centsToDollars(2500), "25"); assert.equal(centsToDollars(null), "");
});
test("a deal parses with cents, an upper-case prefix and an end at the next local midnight", () => {
  const r = parseHotlistInput(fd(base), "America/Denver");
  assert.ok(r.ok); if (!r.ok) return;
  assert.equal(r.value.fields.original_cents, 3600); assert.equal(r.value.fields.price_cents, 2400); assert.equal(r.value.fields.quantity, 40); assert.equal(r.value.fields.code_prefix, "CAFE24");
  assert.equal(r.value.fields.ends_at, "2026-11-01T06:00:00.000Z");             // through Oct 31 = midnight starting Nov 1 (MDT, UTC-6... DST ended Nov 1 02:00, so 06:00Z is Nov 1 00:00 MDT)
  assert.equal(r.value.fields.starts_at, "2026-10-05T06:00:00.000Z");
});
test("a pick carries the pick badge and no price", () => {
  const r = parseHotlistInput(fd({ ...base, kind: "pick", badge: "hot_deal", original: "", price: "" }), "America/Denver");
  assert.ok(r.ok); if (!r.ok) return;
  assert.equal(r.value.fields.badge, "hotlist_pick"); assert.ok(!("price_cents" in r.value.fields));
});
test("friendly errors for the common mistakes", () => {
  assert.match((parseHotlistInput(fd({ ...base, business: "Not A Slug" }), "America/Denver") as { error: string }).error, /web address name/);
  assert.match((parseHotlistInput(fd({ ...base, price: "abc" }), "America/Denver") as { error: string }).error, /in dollars/);
  assert.match((parseHotlistInput(fd({ ...base, title: "x" }), "America/Denver") as { error: string }).error, /too short/);
  assert.match((parseHotlistInput(fd({ ...base, quantity: "0" }), "America/Denver") as { error: string }).error, /quantity/);
  assert.match((parseHotlistInput(fd({ ...base, end_date: "2026-02-30" }), "America/Denver") as { error: string }).error, /end date/);
  assert.match((parseHotlistInput(fd({ ...base, id: "nope" }), "America/Denver") as { error: string }).error, /Unknown item/);
});
test("blank quantity means unlimited; an unknown status falls back to draft", () => {
  const r = parseHotlistInput(fd({ ...base, quantity: "", status: "weird" }), "America/Denver");
  assert.ok(r.ok); if (r.ok) { assert.equal(r.value.fields.quantity, null); assert.equal(r.value.status, "draft"); }
});
test("feature ids: limits, blanks and duplicates", () => {
  const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
  assert.deepEqual(parseFeatureIds(fd({ item_1: a, item_2: "", item_3: b }), "hottest"), { ok: true, value: [a, b] });
  assert.equal(parseFeatureIds(fd({ item_1: a, item_2: a }), "hottest").ok, false);
  assert.equal(parseFeatureIds(fd({ item_1: "x" }), "business").ok, false);
  assert.deepEqual(parseFeatureIds(fd({ item_1: a, item_2: b }), "business"), { ok: true, value: [a] });          // the one-item slot ignores extras
});
