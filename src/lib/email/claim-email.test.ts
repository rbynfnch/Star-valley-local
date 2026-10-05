import { test } from "node:test";
import assert from "node:assert/strict";
import { renderClaimEmail } from "./claim-email.ts";

const base = { tenantName: "Star Valley Local", mailingAddress: "1 Main St, Afton, WY 83110", contactEmail: "hello@svl.example", businessName: "Alpha Plumbing", link: "https://svl.example/list-your-business/confirm?c=abc&t=def", minutes: 60 };
test("subject, text and html carry the link, the lifetime, the safety line and the address", () => {
  const r = renderClaimEmail(base);
  assert.equal(r.subject, "Confirm you manage Alpha Plumbing");
  assert.match(r.text, /Confirm: https:\/\/svl\.example\/list-your-business\/confirm\?c=abc&t=def/);
  assert.match(r.text, /works for 1 hour/); assert.match(r.text, /ignore this email/); assert.match(r.text, /1 Main St, Afton/);
  assert.match(r.html, /href="https:\/\/svl\.example\/list-your-business\/confirm\?c=abc&amp;t=def"/);
});
test("minutes read naturally", () => {
  assert.match(renderClaimEmail({ ...base, minutes: 120 }).text, /2 hours/); assert.match(renderClaimEmail({ ...base, minutes: 45 }).text, /45 minutes/);
});
test("business and tenant names are escaped in html and cannot break the subject", () => {
  const r = renderClaimEmail({ ...base, businessName: '<img src=x onerror=1>\r\nBcc: evil@x.test', tenantName: "A&B" });
  assert.doesNotMatch(r.html, /<img/); assert.match(r.html, /A&amp;B/); assert.doesNotMatch(r.subject, /[\r\n]/);
});
test("the link text says what pressing does without exposing the secret outside the link", () => {
  const r = renderClaimEmail({ ...base, link: "https://svl.example/x?t=SECRET" });
  assert.equal((r.text.match(/SECRET/g) ?? []).length, 1); assert.equal((r.html.match(/SECRET/g) ?? []).length, 1);
});
