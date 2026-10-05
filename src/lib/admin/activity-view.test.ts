import { test } from "node:test";
import assert from "node:assert/strict";
import { activityView, change } from "./activity-view.ts";

const base = { days: 30, current: {}, previous: {}, visitors: 0, top_searches: [], first_event_at: null };
test("change wording: up, down, same, new, nothing", () => {
  assert.equal(change(212, 200, 30), "+12 vs the 30 days before"); assert.equal(change(5, 9, 30), "−4 vs the 30 days before");
  assert.equal(change(7, 7, 30), "no change"); assert.equal(change(3, 0, 30), "new"); assert.equal(change(0, 0, 30), ""); assert.equal(change(0, 4, 30), "−4 vs the 30 days before");
});
test("an empty period reads as empty, with no pitch line", () => {
  const v = activityView(base); assert.equal(v.empty, true); assert.equal(v.pitch, null); assert.equal(v.rows.length, 7);
});
test("the pitch line mentions only what is non-zero, and says 1 not 1s", () => {
  assert.equal(activityView({ ...base, current: { profile_view: 212, phone_click: 14, website_click: 31 } }).pitch, "In the last 30 days this listing got 212 views, 14 call taps and 31 website clicks.");
  assert.equal(activityView({ ...base, current: { profile_view: 1, phone_click: 1 } }).pitch, "In the last 30 days this listing got 1 view and 1 call tap.");
  assert.equal(activityView({ ...base, current: { website_click: 2 } }).pitch, "In the last 30 days this listing got 2 website clicks.");
  assert.equal(activityView({ ...base, current: { search_appearance: 50 } }).pitch, null);
});
test("rows carry counts and changes; junk numbers become zero; visitors and searches are clamped", () => {
  const v = activityView({ ...base, days: 7, current: { profile_view: 10, phone_click: Number.NaN as number, deal_view: -3 }, previous: { profile_view: 4 }, visitors: 6.9, top_searches: Array.from({ length: 9 }, (_, i) => ({ query: "q" + i, n: 9 - i })) });
  assert.equal(v.rows[0].count, 10); assert.equal(v.rows[0].change, "+6 vs the 7 days before"); assert.equal(v.rows[1].count, 0); assert.equal(v.rows[6].count, 0);
  assert.equal(v.visitors, 6); assert.equal(v.topSearches.length, 5);
});
