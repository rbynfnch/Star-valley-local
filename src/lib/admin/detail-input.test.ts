import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommInput, parseStageInput, isUuid } from "./detail-input.ts";

const ID = "3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b";
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const NOW = new Date("2026-10-04T12:00:00Z");

test("isUuid", () => { assert.ok(isUuid(ID)); for (const b of ["", "x", ID + "'", null, 5, undefined]) assert.ok(!isUuid(b)); });
test("stage: valid, lost keeps a trimmed reason, others drop it", () => {
  assert.deepEqual(parseStageInput(form({ business: ID, stage: "lost", lost_reason: "  too pricey " })), { ok: true, value: { business: ID, stage: "lost", lostReason: "too pricey" } });
  assert.deepEqual(parseStageInput(form({ business: ID, stage: "client", lost_reason: "ignored" })), { ok: true, value: { business: ID, stage: "client", lostReason: null } });
});
test("stage: bad business or stage is refused", () => {
  assert.equal(parseStageInput(form({ business: "nope", stage: "new" })).ok, false);
  assert.equal(parseStageInput(form({ business: ID, stage: "won" })).ok, false);
  assert.equal(parseStageInput(form({ business: ID })).ok, false);
});
test("comm: a plain note", () => {
  const r = parseCommInput(form({ business: ID, kind: "note", body: " Called, no answer " }), "America/Denver", NOW);
  assert.deepEqual(r, { ok: true, value: { business: ID, kind: "note", subject: null, body: "Called, no answer", outcome: null, followUpAt: null } });
});
test("comm: a visit with an outcome needs no text; an outcome on a non-visit is refused", () => {
  assert.equal(parseCommInput(form({ business: ID, kind: "visit", outcome: "pitched" }), "America/Denver", NOW).ok, true);
  assert.equal(parseCommInput(form({ business: ID, kind: "call", outcome: "pitched" }), "America/Denver", NOW).ok, false);
  assert.equal(parseCommInput(form({ business: ID, kind: "visit", outcome: "flew_away" }), "America/Denver", NOW).ok, false);
});
test("comm: empty, unknown kind and bad business are refused", () => {
  assert.equal(parseCommInput(form({ business: ID, kind: "note", body: "   " }), "America/Denver", NOW).ok, false);
  assert.equal(parseCommInput(form({ business: ID, kind: "carrier_pigeon", body: "x" }), "America/Denver", NOW).ok, false);
  assert.equal(parseCommInput(form({ business: "x", kind: "note", body: "x" }), "America/Denver", NOW).ok, false);
});
test("comm: follow-up is 9:00 AM in the tenant's timezone (MDT = UTC-6; MST = UTC-7)", () => {
  const a = parseCommInput(form({ business: ID, kind: "note", body: "x", follow_up: "2026-10-10" }), "America/Denver", NOW);
  assert.equal(a.ok && a.value.followUpAt, "2026-10-10T15:00:00.000Z");
  const b = parseCommInput(form({ business: ID, kind: "note", body: "x", follow_up: "2026-12-10" }), "America/Denver", NOW);
  assert.equal(b.ok && b.value.followUpAt, "2026-12-10T16:00:00.000Z");
});
test("comm: impossible, malformed and past follow-up dates are refused", () => {
  for (const d of ["2026-02-30", "10/10/2026", "2026-13-01", "tomorrow", "2026-09-01"]) assert.equal(parseCommInput(form({ business: ID, kind: "note", body: "x", follow_up: d }), "America/Denver", NOW).ok, false, d);
});
test("comm: control characters stripped, lengths capped", () => {
  const r = parseCommInput(form({ business: ID, kind: "note", subject: "a\u0000b" + "s".repeat(300), body: "x".repeat(9000) }), "America/Denver", NOW);
  assert.ok(r.ok && r.value.subject!.length === 200 && !r.value.subject!.includes("\u0000") && r.value.body!.length === 5000);
});
test("comm: browser CRLF newlines are stored as LF", () => {
  const r = parseCommInput(form({ business: ID, kind: "note", body: "one\r\ntwo\rthree\nfour" }), "America/Denver", NOW);
  assert.ok(r.ok && r.value.body === "one\ntwo\nthree\nfour");
});
