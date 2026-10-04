import { test } from "node:test";
import assert from "node:assert/strict";
import { dayInput, hoursGrid } from "./content-view.ts";
import { parseDealInput } from "./content-input.ts";

test("dayInput reads the tenant's calendar day, not UTC's", () => {
  assert.equal(dayInput("2026-07-01T06:00:00.000Z", "America/Denver"), "2026-07-01");
  assert.equal(dayInput("2026-07-01T05:59:00.000Z", "America/Denver"), "2026-06-30");
  assert.equal(dayInput("2026-07-04T06:00:00.000Z", "America/Denver", 1), "2026-07-03");       // an end stored as the next day's start
  assert.equal(dayInput("2026-03-01T07:00:00.000Z", "America/Denver", 1), "2026-02-28");
  assert.equal(dayInput(null, "America/Denver"), "");
  assert.equal(dayInput("garbage", "America/Denver"), "");
});
test("a deal's dates survive a save, display and re-save round trip", () => {
  const f = new FormData(); f.set("business", "3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b"); f.set("title", "t"); f.set("discount_type", "other"); f.set("status", "draft"); f.set("starts", "2026-11-01"); f.set("ends", "2026-11-02");   // DST ends Nov 1
  const r = parseDealInput(f, "America/Denver") as { ok: true; value: { startsAt: string; endsAt: string } };
  assert.equal(dayInput(r.value.startsAt, "America/Denver"), "2026-11-01");
  assert.equal(dayInput(r.value.endsAt, "America/Denver", 1), "2026-11-02");
});
test("hoursGrid groups by day and caps each day", () => {
  const g = hoursGrid([{ day: 1, opens: "08:00", closes: "12:00" }, { day: 1, opens: "13:00", closes: "17:00" }, { day: 6, opens: "09:00", closes: "10:00" }, { day: 9, opens: "09:00", closes: "10:00" }], 1);
  assert.deepEqual(g[1], [{ opens: "08:00", closes: "12:00" }]);
  assert.equal(g[6].length, 1); assert.equal(g.length, 7); assert.equal(g[0].length, 0);
});
