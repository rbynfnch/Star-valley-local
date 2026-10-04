import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDay, formatStamp, label } from "./format.ts";

test("formats in the given timezone", () => {
  assert.equal(formatStamp("2026-10-10T15:00:00Z", "America/Denver"), "Oct 10, 2026, 9:00 AM");
  assert.equal(formatDay("2026-01-01T05:30:00Z", "America/Denver"), "Dec 31, 2025");
});
test("missing or invalid input is a dash, never 'Invalid Date'", () => {
  for (const v of [null, undefined, "", "not a date"]) { assert.equal(formatStamp(v, "UTC"), "–"); assert.equal(formatDay(v, "UTC"), "–"); }
});
test("label", () => { assert.equal(label("claimed_together"), "Claimed together"); assert.equal(label("dm"), "Dm"); });
