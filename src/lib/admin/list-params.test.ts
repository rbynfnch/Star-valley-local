import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListParams, toQuery, toRpcArgs, PAGE_SIZE } from "./list-params.ts";

const ID = "3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b";
test("defaults", () => {
  assert.deepEqual(parseListParams({}), { q: null, status: null, community: null, category: null, tier: null, stage: null, verified: null, page: 1 });
});
test("valid values pass through, ids are lower-cased", () => {
  const f = parseListParams({ q: "  roof ", status: "prospect", community: ID.toUpperCase(), category: ID, tier: "enhanced", stage: "interested", verified: "no", page: "3" });
  assert.deepEqual(f, { q: "roof", status: "prospect", community: ID, category: ID, tier: "enhanced", stage: "interested", verified: false, page: 3 });
});
test("anything unrecognised is dropped, not passed to the database", () => {
  const f = parseListParams({ status: "'; drop table x", community: "not-a-uuid", category: `${ID}'`, tier: "premium", stage: "won", verified: "maybe", page: "-4" });
  assert.deepEqual(f, { q: null, status: null, community: null, category: null, tier: null, stage: null, verified: null, page: 1 });
});
test("page is bounded; arrays take the first value; q is capped and control characters removed", () => {
  assert.equal(parseListParams({ page: "99999999" }).page, 10000);
  assert.equal(parseListParams({ page: "abc" }).page, 1);
  assert.equal(parseListParams({ status: ["claimed", "prospect"] }).status, "claimed");
  const q = parseListParams({ q: "a\u0000b\nc" + "x".repeat(300) }).q!;
  assert.ok(q.length <= 100 && !/[\u0000-\u001f]/.test(q));
});
test("rpc args: offset follows the page; a single status becomes an array", () => {
  const a = toRpcArgs("T", parseListParams({ status: "claimed", page: "3" }));
  assert.deepEqual(a.p_status, ["claimed"]); assert.equal(a.p_offset, 2 * PAGE_SIZE); assert.equal(a.p_limit, PAGE_SIZE);
  assert.equal(toRpcArgs("T", parseListParams({})).p_status, null);
});
test("toQuery round-trips and omits defaults", () => {
  assert.equal(toQuery(parseListParams({})), "");
  const f = parseListParams({ q: "a b", tier: "free", verified: "yes", page: "2" });
  assert.deepEqual(parseListParams(Object.fromEntries(new URLSearchParams(toQuery(f)))), f);
  assert.equal(toQuery(f, 1), "?q=a+b&tier=free&verified=yes");
});
