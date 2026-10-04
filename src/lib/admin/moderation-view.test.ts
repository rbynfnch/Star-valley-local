import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCard, permissions, type SubRow } from "./moderation-view.ts";

const base: SubRow = { id: "i", kind: "update", status: "pending", payload: {}, submitter_name: null, submitter_email: null, submitter_phone: null, created_at: "2026-10-10T15:00:00Z", reviewed_at: null, resolution_notes: null, business_id: null, business_name: null, business_slug: null };

test("permissions mirror the database rules", () => {
  assert.deepEqual(permissions("sales", "business"), { canApprove: true, canApply: false, blocked: null });
  assert.equal(permissions("editor", "business").canApprove, false); assert.match(permissions("editor", "business").blocked!, /sales staff and admins/);
  assert.equal(permissions("sales", "event").canApprove, false); assert.match(permissions("sales", "event").blocked!, /editors and admins/);
  assert.equal(permissions("editor", "event").canApprove, true);
  assert.deepEqual(permissions("admin", "event"), { canApprove: true, canApply: false, blocked: null });
  assert.equal(permissions("admin", "business").canApprove, true);
  assert.equal(permissions("editor", "update").canApprove, true); assert.equal(permissions("editor", "update").canApply, false);
  assert.equal(permissions("sales", "update").canApply, true); assert.equal(permissions("admin", "update").canApply, true);
});
test("update card: labelled fields, hours listed but never applicable, who and when in tenant time", () => {
  const c = buildCard({ ...base, payload: { fields: { phone: "307-555-0100", hours: "Mon-Fri", website: "https://x.example" }, note: "moved", closed: true }, submitter_email: "a@b.co", business_name: "Alpha", business_id: "b1" }, "sales", "America/Denver");
  assert.deepEqual(c.details.map((d) => d.label), ["Phone", "Website", "Hours"]);
  assert.deepEqual(c.applicableFields, ["Phone", "Website"]);
  assert.ok(c.canApply && c.closed && c.note === "moved" && c.businessHref === "/admin/businesses/b1" && c.who === "a@b.co" && c.when === "Oct 10, 2026, 9:00 AM");
});
test("an update with only hours or a note cannot be applied", () => {
  assert.equal(buildCard({ ...base, payload: { fields: { hours: "x" } } }, "sales", "UTC").canApply, false);
  assert.equal(buildCard({ ...base, payload: { note: "n" } }, "sales", "UTC").canApply, false);
});
test("an editor is never offered 'apply'", () => { assert.equal(buildCard({ ...base, payload: { fields: { phone: "1234567" } } }, "editor", "UTC").canApply, false); });
test("event card shows times in the tenant timezone, all-day without a clock time", () => {
  const e = buildCard({ ...base, kind: "event", payload: { title: "Fair", starts_at: "2026-10-18T00:30:00Z", ends_at: "2026-10-18T03:00:00Z", venue_name: "Park", organizer: "Committee" } }, "editor", "America/Denver");
  assert.deepEqual(e.details.find((d) => d.label === "Starts"), { label: "Starts", value: "Oct 17, 2026, 6:30 PM" });
  assert.ok(e.canApprove && e.approveBlockedReason === null);
  const a = buildCard({ ...base, kind: "event", payload: { title: "Market", starts_at: "2026-12-05T07:00:00Z", all_day: true } }, "sales", "America/Denver");
  assert.equal(a.details.find((d) => d.label === "Starts")!.value, "Dec 5, 2026 (all day)");
  assert.equal(a.canApprove, false); assert.match(a.approveBlockedReason!, /editors/);
});
test("business card, anonymous submitter, hostile text stays plain data", () => {
  const c = buildCard({ ...base, kind: "business", payload: { name: "<img src=x onerror=alert(1)>", category_text: "Bakery" } }, "sales", "UTC");
  assert.equal(c.who, "Anonymous"); assert.equal(c.details[0].value, "<img src=x onerror=alert(1)>");   // React escapes it when rendered
});
test("reviewed cards carry who/when/notes", () => {
  const c = buildCard({ ...base, status: "rejected", reviewed_at: "2026-10-11T15:00:00Z", resolution_notes: "duplicate" }, "sales", "America/Denver");
  assert.equal(c.reviewed, "Oct 11, 2026, 9:00 AM"); assert.equal(c.resolutionNotes, "duplicate");
});
