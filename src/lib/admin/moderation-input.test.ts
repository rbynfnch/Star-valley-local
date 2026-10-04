import { test } from "node:test";
import assert from "node:assert/strict";
import { modQuery, parseModParams, parseReviewInput } from "./moderation-input.ts";

const ID = "3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b";
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

test("params: defaults to pending, any kind, page 1; junk is dropped", () => {
  assert.deepEqual(parseModParams({}), { status: "pending", kind: null, page: 1 });
  assert.deepEqual(parseModParams({ status: "spam", kind: "event", page: "3" }), { status: "spam", kind: "event", page: 3 });
  assert.deepEqual(parseModParams({ status: "'; drop", kind: "claim", page: "-1" }), { status: "pending", kind: null, page: 1 });
  assert.equal(parseModParams({ page: "99999999" }).page, 10000);
  assert.equal(parseModParams({ kind: ["business", "event"] }).kind, "business");
});
test("modQuery omits defaults and round-trips", () => {
  assert.equal(modQuery({ status: "pending", kind: null, page: 1 }), "");
  const f = { status: "approved", kind: "update", page: 2 } as const;
  assert.deepEqual(parseModParams(Object.fromEntries(new URLSearchParams(modQuery(f)))), f);
  assert.equal(modQuery(f, { page: 1 }), "?status=approved&kind=update");
});
test("review input: valid actions, trimmed notes, flags are explicit 'yes' only", () => {
  assert.deepEqual(parseReviewInput(form({ id: ID, action: "approve", notes: "  fine  ", apply: "yes", force: "true" })), { ok: true, value: { id: ID, action: "approve", notes: "fine", apply: true, force: false } });
  assert.deepEqual(parseReviewInput(form({ id: ID, action: "spam" })), { ok: true, value: { id: ID, action: "spam", notes: null, apply: false, force: false } });
});
test("review input: bad id or action is refused; notes are capped and cleaned", () => {
  assert.equal(parseReviewInput(form({ id: "x", action: "approve" })).ok, false);
  assert.equal(parseReviewInput(form({ id: ID, action: "delete" })).ok, false);
  assert.equal(parseReviewInput(form({ id: ID })).ok, false);
  const r = parseReviewInput(form({ id: ID, action: "reject", notes: "a\u0000b" + "x".repeat(2000) }));
  assert.ok(r.ok && r.value.notes!.length === 1000 && !r.value.notes!.includes("\u0000"));
});
