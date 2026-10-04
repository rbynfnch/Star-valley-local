import { test } from "node:test";
import assert from "node:assert/strict";
import { dollars, paymentLink, priceLabel, productFor, remainingText, scopeRows } from "./view.ts";
import type { Product } from "../directory/types.ts";

test("dollars and price labels", () => {
  assert.equal(dollars(1900), "$19"); assert.equal(dollars(19900), "$199"); assert.equal(dollars(1950), "$19.50"); assert.equal(dollars(123456), "$1,234.56");
  assert.equal(priceLabel({ amount_cents: 1900, interval: "month" }), "$19/mo"); assert.equal(priceLabel({ amount_cents: 19900, interval: "year" }), "$199/yr"); assert.equal(priceLabel({ amount_cents: 500, interval: null }), "$5");
});
test("remainingText: open, some left, one left, full, over-full", () => {
  assert.deepEqual(remainingText(3, 0), { remaining: 3, full: false, text: "3 of 3 spots open" });
  assert.equal(remainingText(3, 1).text, "2 of 3 spots left"); assert.equal(remainingText(3, 2).text, "1 of 3 spot left");
  assert.deepEqual(remainingText(3, 3), { remaining: 0, full: true, text: "Full" });
  assert.deepEqual(remainingText(3, 5), { remaining: 0, full: true, text: "Full" });
  assert.equal(remainingText(0, 0).full, true);
});
test("paymentLink adds the business id and email, keeps existing params, refuses non-https", () => {
  const id = "3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b";
  assert.equal(paymentLink("https://buy.stripe.com/test_abc", id), `https://buy.stripe.com/test_abc?client_reference_id=${id}`);
  assert.equal(paymentLink("https://buy.stripe.com/x?locale=en", id, "a@b.co"), `https://buy.stripe.com/x?locale=en&client_reference_id=${id}&prefilled_email=a%40b.co`);
  assert.equal(paymentLink("https://buy.stripe.com/x"), "https://buy.stripe.com/x");
  assert.equal(paymentLink("https://buy.stripe.com/x", "not-a-uuid", "bad"), "https://buy.stripe.com/x");
  for (const bad of ["http://buy.stripe.com/x", "javascript:alert(1)", "ftp://x", "not a url", "", null, undefined]) assert.equal(paymentLink(bad as string, id), null, String(bad));
});
test("productFor: listing ignores slot; placement matches the slot", () => {
  const ps = [{ code: "e", kind: "listing", slot_type: null }, { code: "f", kind: "placement", slot_type: "category" }, { code: "h", kind: "placement", slot_type: "homepage" }] as Product[];
  assert.equal(productFor(ps, "listing")?.code, "e"); assert.equal(productFor(ps, "placement", "category")?.code, "f"); assert.equal(productFor(ps, "placement", "homepage")?.code, "h"); assert.equal(productFor(ps, "placement", "community"), undefined);
});
test("scopeRows adds the text without changing the data", () => {
  const r = scopeRows([{ id: "a", slug: "plumbing", name: "Plumbers", max: 3, used: 1 }, { id: "b", slug: "x", name: "X", max: 3, used: 3 }]);
  assert.equal(r[0].text, "2 of 3 spots left"); assert.equal(r[1].full, true); assert.equal(r[0].name, "Plumbers");
});
