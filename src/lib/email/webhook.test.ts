import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWebhook } from "./webhook.ts";

const T = "3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b";
test("hard bounces suppress, with the tenant from our metadata", () => {
  assert.deepEqual(parseWebhook({ RecordType: "Bounce", Type: "HardBounce", Email: " Owner@Example.test ", Metadata: { tenant_id: T.toUpperCase() } }), { email: "owner@example.test", reason: "bounce", tenantId: T });
  for (const t of ["BadEmailAddress", "ManuallyDeactivated"]) assert.equal(parseWebhook({ RecordType: "Bounce", Type: t, Email: "a@b.test" })?.reason, "bounce");
});
test("soft and transient bounces, auto-responders and unknown events are ignored", () => {
  for (const t of ["SoftBounce", "Transient", "AutoResponder", "DnsError", "Unknown", "Blocked", ""]) assert.equal(parseWebhook({ RecordType: "Bounce", Type: t, Email: "a@b.test" }), null, t);
  assert.equal(parseWebhook({ RecordType: "Delivery", Recipient: "a@b.test" }), null);
  assert.equal(parseWebhook({ RecordType: "Open", Recipient: "a@b.test" }), null);
});
test("spam complaints suppress as complaints, by either shape", () => {
  assert.equal(parseWebhook({ RecordType: "SpamComplaint", Email: "a@b.test" })?.reason, "complaint");
  assert.equal(parseWebhook({ RecordType: "Bounce", Type: "SpamNotification", Email: "a@b.test" })?.reason, "complaint");
});
test("a suppress-sending subscription change is an unsubscribe; one that is not, is ignored", () => {
  assert.deepEqual(parseWebhook({ RecordType: "SubscriptionChange", Recipient: "a@b.test", SuppressSending: true }), { email: "a@b.test", reason: "unsubscribe", tenantId: null });
  assert.equal(parseWebhook({ RecordType: "SubscriptionChange", Recipient: "a@b.test", SuppressSending: false }), null);
});
test("missing or junk addresses, junk metadata and non-objects are ignored safely", () => {
  assert.equal(parseWebhook({ RecordType: "Bounce", Type: "HardBounce" }), null);
  assert.equal(parseWebhook({ RecordType: "Bounce", Type: "HardBounce", Email: "not an email" }), null);
  assert.equal(parseWebhook({ RecordType: "Bounce", Type: "HardBounce", Email: "a@b.test", Metadata: { tenant_id: "'; drop table x" } })?.tenantId, null);
  for (const b of [null, undefined, "x", 5, [], { RecordType: 5 }]) assert.equal(parseWebhook(b), null);
});
