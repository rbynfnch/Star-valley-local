import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDealCards, dealsUrl, parseDealParams, DEALS_PER_PAGE } from "./deals.ts";
import type { BusinessRow, Category, Community, DealRow } from "../directory/types.ts";

const TZ = "America/Denver", NOW = new Date("2026-10-07T18:00:00Z");
const cat = (id: string, slug: string, parent: string | null, sort = 1): Category => ({ id, slug, name: slug.toUpperCase(), plural_name: null, description: null, color_token: null, parent_id: parent, sort_order: sort });
const categories = [cat("home", "home", null, 1), cat("plumb", "plumbing", "home", 2), cat("eat", "eat", null, 3), cat("shop", "shop", null, 4)];
const communities: Community[] = [{ id: "c1", slug: "afton", name: "Afton", state: "WY", sort_order: 1 }, { id: "c2", slug: "alpine", name: "Alpine", state: "WY", sort_order: 2 }];
const biz = (id: string, cat: string | null, comm: string | null): BusinessRow => ({ id, slug: id, name: id.toUpperCase(), short_description: null, home_community_id: comm, primary_category_id: cat, phone: null, website: null, address_line1: null, city: null, state: null, postal_code: null, verification_level: "none" });
const businesses = [biz("b1", "plumb", "c1"), biz("b2", "eat", "c2"), biz("b3", "eat", "c1")];
const deal = (id: string, business_id: string, ends: string | null, o: Partial<DealRow> = {}): DealRow => ({ id, business_id, title: id, description: null, terms: null, discount_type: "percent", discount_value: 20, starts_at: "2026-10-01T00:00:00Z", ends_at: ends, ...o });

test("params and URLs", () => {
  assert.deepEqual(parseDealParams({ category: "eat", community: "afton", page: "2" }), { category: "eat", community: "afton", page: 2 });
  assert.deepEqual(parseDealParams({ category: "E at", community: "x".repeat(99), page: "0" }), { category: null, community: null, page: 1 });
  assert.equal(dealsUrl({}), "/deals"); assert.equal(dealsUrl({ category: "eat", page: 3 }), "/deals?category=eat&page=3");
});
test("deals are ordered by the soonest end, no-end last; badge, dates and the business come through", () => {
  const r = buildDealCards([deal("d1", "b1", null), deal("d2", "b2", "2026-10-30T06:00:00Z"), deal("d3", "b3", "2026-10-09T06:00:00Z", { discount_type: "bogo", discount_value: null })], businesses, communities, categories, parseDealParams({}), NOW, TZ);
  assert.deepEqual(r.cards.map((c) => c.id), ["d3", "d2", "d1"]);
  assert.equal(r.cards[0].badge, "BUY 1 GET 1"); assert.equal(r.cards[0].validText, "Valid through Oct 8, 2026"); assert.equal(r.cards[0].endsSoon, true);
  assert.equal(r.cards[2].validText, "Ongoing"); assert.equal(r.cards[2].endsSoon, false); assert.equal(r.cards[1].businessName, "B2"); assert.equal(r.cards[1].communityName, "Alpine");
});
test("category tabs count by top-level category (children roll up); only non-empty tabs; filters work", () => {
  const ds = [deal("d1", "b1", null), deal("d2", "b2", null), deal("d3", "b3", null)];
  const all = buildDealCards(ds, businesses, communities, categories, parseDealParams({}), NOW, TZ);
  assert.deepEqual(all.tabs.map((t) => [t.slug, t.count]), [[null, 3], ["home", 1], ["eat", 2]]);
  assert.deepEqual(buildDealCards(ds, businesses, communities, categories, parseDealParams({ category: "home" }), NOW, TZ).cards.map((c) => c.id), ["d1"]);
  assert.deepEqual(buildDealCards(ds, businesses, communities, categories, parseDealParams({ category: "eat", community: "afton" }), NOW, TZ).cards.map((c) => c.id), ["d3"]);
  assert.equal(buildDealCards(ds, businesses, communities, categories, parseDealParams({ category: "nothing" }), NOW, TZ).total, 0);
  assert.equal(buildDealCards(ds, businesses, communities, categories, parseDealParams({ community: "nowhere" }), NOW, TZ).total, 0);
});
test("a deal whose business is not public, or that has just ended, is not shown", () => {
  const r = buildDealCards([deal("d1", "ghost", null), deal("d2", "b1", "2026-10-07T17:59:00Z"), deal("d3", "b1", "2026-10-07T18:01:00Z")], businesses, communities, categories, parseDealParams({}), NOW, TZ);
  assert.deepEqual(r.cards.map((c) => c.id), ["d3"]);
});
test("paging", () => {
  const ds = Array.from({ length: 30 }, (_, i) => deal(`d${String(i).padStart(2, "0")}`, "b1", `2026-11-${String(i + 1).padStart(2, "0")}T06:00:00Z`));
  const p = buildDealCards(ds, businesses, communities, categories, parseDealParams({ page: "3" }), NOW, TZ);
  assert.equal(p.cards.length, 30 - 2 * DEALS_PER_PAGE); assert.equal(p.totalPages, 3); assert.equal(buildDealCards(ds, businesses, communities, categories, parseDealParams({ page: "50" }), NOW, TZ).page, 3);
});
