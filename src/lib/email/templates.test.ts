import { test } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, escapeHtml, render, type QueuedEmail } from "./templates.ts";

const mk = (kind: string, payload: Record<string, unknown> = {}, over: Partial<QueuedEmail> = {}): QueuedEmail => ({
  id: "n1", kind, recipient_email: "owner@example.test", attempts: 1, payload,
  tenant: { id: "t1", slug: "star-valley", name: "Star Valley Local", mailing_address: "1 Main St, Afton, WY 83110", contact_email: "hello@svl.example", timezone: "America/Denver", domain: "starvalleylocal.example" },
  business: { id: "b1", slug: "alpha-plumbing", name: "Alpha Plumbing" }, ...over });

test("baseUrl: https for real domains, http only for local hosts, nothing for junk", () => {
  assert.equal(baseUrl("starvalleylocal.example"), "https://starvalleylocal.example");
  assert.equal(baseUrl("star-valley.localhost:3101"), "http://star-valley.localhost:3101");
  assert.equal(baseUrl("127.0.0.1:3000"), "http://127.0.0.1:3000");
  for (const bad of [null, "", "a b.example", "evil.example/path", "x.example@y.example", "javascript:alert(1)", "-bad.example"]) assert.equal(baseUrl(bad as string | null), null, String(bad));
});
test("every kind renders subject, text and html with the footer and the tenant's address", () => {
  for (const kind of ["verification_reminder", "verification_lapsed", "featured_grace_reminder", "featured_ended_unverified", "placement_renewal_reminder", "listing_renewal_reminder", "staff_no_contact_alert"]) {
    const r = render(mk(kind, { ends_at: "2026-12-01T07:00:00Z", due_at: "2026-12-01T07:00:00Z", days_left: 7, grace_days: 14, original_kind: "verification_lapsed" }));
    assert.ok(r, kind);
    assert.ok(r.subject.length > 5 && !/[\r\n]/.test(r.subject), kind + " subject");
    assert.match(r.text, /1 Main St, Afton, WY 83110/); assert.match(r.html, /1 Main St, Afton, WY 83110/);
    assert.match(r.text, /hello@svl\.example/);
  }
});
test("an unknown kind renders nothing", () => { assert.equal(render(mk("newsletter")), null); });
test("dates are shown in the tenant's timezone", () => {
  const r = render(mk("listing_renewal_reminder", { ends_at: "2026-12-01T05:00:00Z" }))!;        // still Nov 30 in Mountain time
  assert.match(r.text, /November 30, 2026/);
});
test("owner mails link to the claim page for that business; renewals link to pricing; staff alerts to the admin page", () => {
  assert.match(render(mk("verification_reminder", { due_at: "2026-12-01T07:00:00Z" }))!.text, /https:\/\/starvalleylocal\.example\/list-your-business\?claim=alpha-plumbing/);
  assert.match(render(mk("placement_renewal_reminder", { ends_at: "2026-12-01T07:00:00Z" }))!.text, /https:\/\/starvalleylocal\.example\/pricing/);
  assert.match(render(mk("staff_no_contact_alert", { original_kind: "verification_lapsed" }))!.text, /https:\/\/starvalleylocal\.example\/admin\/businesses\/b1/);
});
test("with no usable domain the mail still sends, just without the button", () => {
  const r = render(mk("verification_lapsed", { ends_at: "2026-12-01T07:00:00Z" }, { tenant: { ...mk("x").tenant, domain: null } }))!;
  assert.doesNotMatch(r.text, /https?:\/\//); assert.doesNotMatch(r.html, /<a /);
});
test("payload text is escaped in html and cannot inject headers or markup", () => {
  const r = render(mk("verification_reminder", { business_name: '<img src=x onerror=alert(1)>\r\nBcc: evil@example.test', due_at: "2026-12-01T07:00:00Z" }, { business: null }))!;
  assert.doesNotMatch(r.html, /<img/); assert.match(r.html, /&lt;img/);
  assert.doesNotMatch(r.subject, /[\r\n]/);
  const slug = render(mk("verification_reminder", { due_at: "2026-12-01T07:00:00Z" }, { business: { id: "b", slug: 'x"><script>', name: "N" } }))!;
  assert.doesNotMatch(slug.html, /<script>/);
  assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});
test("Featured wording follows the slots at risk", () => {
  const r = render(mk("verification_lapsed", { grace_days: 14, ends_at: "2026-12-01T07:00:00Z", placements: [{ slot_type: "homepage" }, { slot_type: "category" }, { slot_type: "bogus" }] }))!;
  assert.match(r.text, /featured on the home page and its category page/i);
  assert.match(r.text, /only for 14 days/);
});
test("a credit is shown only when there is one", () => {
  assert.match(render(mk("featured_ended_unverified", { credit_cents: 2450 }))!.text, /\$24\.50/);
  assert.doesNotMatch(render(mk("featured_ended_unverified", { credit_cents: 0 }))!.text, /credit/i);
});
test("one day left reads as the last day", () => {
  assert.match(render(mk("featured_grace_reminder", { days_left: 1, ends_at: "2026-12-01T07:00:00Z" }))!.subject, /Last day/);
  assert.match(render(mk("featured_grace_reminder", { days_left: 7, ends_at: "2026-12-01T07:00:00Z" }))!.subject, /7 days left/);
});
