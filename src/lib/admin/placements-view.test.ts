import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOverview, type RawOverview } from "./placements-view.ts";

const NOW = new Date("2026-10-04T12:00:00Z");
const H = (o: Partial<RawOverview["slots"][0]["holders"][0]>) => ({ id: "h", business_id: "b", business_name: "B", source: "paid", start_at: "2026-09-01T00:00:00Z", end_at: "2026-12-01T00:00:00Z", auto_renews: false, upcoming: false, ...o });
const raw: RawOverview = {
  slots: [
    { slot_type: "community", scope_id: "c1", scope_name: "Afton", max_slots: 4, used: 0, holders: [], waitlist: [] },
    { slot_type: "category", scope_id: "k1", scope_name: "Plumbers", max_slots: 3, used: 3, holders: [H({ id: "h1", business_name: "Alpha", end_at: "2026-10-10T00:00:00Z", auto_renews: true }), H({ id: "h2", business_name: "Bravo", source: "founding_member" }), H({ id: "h3", business_name: "Later", upcoming: true, end_at: "2026-10-12T00:00:00Z" })],
      waitlist: [{ id: "w1", business_id: "x", business_name: "Waiter", since: "2026-09-20T00:00:00Z", eligible: true }, { id: "w2", business_id: "y", business_name: "Not Ready", since: "2026-09-25T00:00:00Z", eligible: false }] },
    { slot_type: "things_to_do", scope_id: null, scope_name: null, max_slots: 6, used: 0, holders: [], waitlist: [] },
    { slot_type: "homepage", scope_id: null, scope_name: null, max_slots: 6, used: 2, holders: [], waitlist: [] },
  ],
  listings: [{ id: "l1", business_id: "b1", business_name: "Alpha", source: "paid", ends_at: "2026-10-20T00:00:00Z", auto_renews: false }, { id: "l2", business_id: "b2", business_name: "Open", source: "founding_member", ends_at: null, auto_renews: false }, { id: "l3", business_id: "b3", business_name: "Far", source: "paid", ends_at: "2027-06-01T00:00:00Z", auto_renews: false }],
};

test("slots are ordered home page, Things to Do, categories, communities, with readable titles", () => {
  assert.deepEqual(buildOverview(raw, "America/Denver", NOW).slots.map((s) => s.title), ["Home page", "Things to Do", "Category: Plumbers", "Community: Afton"]);
});
test("full is used >= max", () => {
  const s = buildOverview(raw, "America/Denver", NOW).slots;
  assert.equal(s.find((x) => x.title === "Category: Plumbers")!.full, true); assert.equal(s.find((x) => x.title === "Home page")!.full, false);
});
test("holders: dates in tenant time, source labels, soon flag, upcoming never 'soon'", () => {
  const p = buildOverview(raw, "America/Denver", NOW).slots.find((x) => x.title === "Category: Plumbers")!;
  assert.deepEqual(p.holders.map((h) => [h.name, h.source, h.soon, h.upcoming, h.autoRenews]), [["Alpha", "Paid", true, false, true], ["Bravo", "Comp: founding member", false, false, false], ["Later", "Paid", false, true, false]]);
  assert.equal(p.holders[0].ends, "Oct 9, 2026"); assert.equal(p.holders[0].daysLeft, 6);
});
test("waitlist: numbered in order, ineligible entries say why", () => {
  const w = buildOverview(raw, "UTC", NOW).slots.find((x) => x.title === "Category: Plumbers")!.waitlist;
  assert.deepEqual(w.map((x) => [x.position, x.name, x.eligible]), [[1, "Waiter", true], [2, "Not Ready", false]]);
  assert.equal(w[0].reason, null); assert.match(w[1].reason!, /Enhanced listing/);
});
test("expiring soon: Featured and Enhanced within 30 days, soonest first; open-ended, far and upcoming are left out", () => {
  const e = buildOverview(raw, "UTC", NOW).expiring;
  assert.deepEqual(e.map((x) => [x.kind, x.name, x.daysLeft]), [["Featured", "Alpha", 6], ["Enhanced", "Alpha", 16]]);
});
test("listings: open-ended is labelled, not blank", () => {
  const l = buildOverview(raw, "UTC", NOW).listings;
  assert.equal(l.find((x) => x.name === "Open")!.ends, "No end date"); assert.equal(l.find((x) => x.name === "Open")!.source, "Comp: founding member");
});
