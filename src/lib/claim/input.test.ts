import { test } from "node:test";
import assert from "node:assert/strict";
import { maskPhone, parseCode, parseSlug, smsBody, verifyMessage } from "./input.ts";

test("parseCode accepts six digits with spaces or hyphens, nothing else", () => {
  for (const [i, o] of [["123456", "123456"], [" 123 456 ", "123456"], ["123-456", "123456"]]) assert.equal(parseCode(i), o);
  for (const bad of ["12345", "1234567", "12345a", "", "١٢٣٤٥٦", "123456; drop", null, 123456, undefined]) assert.equal(parseCode(bad), null, String(bad));
});
test("parseSlug", () => { assert.equal(parseSlug("sample-valley-plumbing"), "sample-valley-plumbing"); for (const b of ["Bad Slug", "a/b", "", "-a", "a--b", "x".repeat(121), null, ["a"]]) assert.equal(parseSlug(b), null); });
test("maskPhone shows only the last four digits", () => {
  assert.equal(maskPhone("(307) 555-0601"), "(•••) •••-0601");
  assert.equal(maskPhone("+13075550601"), "(•••) •••-0601");
  assert.equal(maskPhone("12"), null); assert.equal(maskPhone(null), null);
  assert.ok(!/555|307/.test(maskPhone("(307) 555-0601")!));
});
test("smsBody: names the code and the 10-minute expiry, truncates a long business name, stays one segment-ish", () => {
  const b = smsBody("Star Valley Local", "Sample Valley Plumbing", "042917");
  assert.match(b, /042917/); assert.match(b, /10 minutes/); assert.ok(b.length <= 160, String(b.length));
  const long = smsBody("Star Valley Local", "A".repeat(100), "123456");
  assert.ok(long.includes("…") && long.length <= 170);
});
test("verifyMessage covers every database result", () => {
  assert.deepEqual(verifyMessage({ result: "verified" }), { done: true, ok: true, text: "You're verified." });
  assert.equal(verifyMessage({ result: "wrong", attempts_left: 4 }).done, false);
  assert.match(verifyMessage({ result: "wrong", attempts_left: 1 }).text, /1 try left/);
  for (const r of ["expired", "rejected", "already_claimed", "cancelled", "anything-else"]) { const m = verifyMessage({ result: r }); assert.ok(m.done && !m.ok, r); }
});

import { emailLinkMessage, maskPhoneLast4, parseClaimMethod, parseToken, safeHint } from "./input.ts";
test("parseToken accepts only 64 lowercase hex characters", () => {
  const t = "a".repeat(64);
  assert.equal(parseToken(t), t);
  for (const bad of [undefined, null, 5, "", "A".repeat(64), "a".repeat(63), "a".repeat(65), "g".repeat(64), t + "\n", " " + t, ["a".repeat(64)]]) assert.equal(parseToken(bad), null);
});
test("parseClaimMethod defaults to text and accepts only email_link as the other choice", () => {
  assert.equal(parseClaimMethod("email_link"), "email_link");
  for (const v of ["sms_code", "admin_assisted", "", null, undefined, 1, "EMAIL_LINK"]) assert.equal(parseClaimMethod(v), "sms_code");
});
test("masks from claim_options: last four digits and a first-letter email hint, nothing else passes", () => {
  assert.equal(maskPhoneLast4("0701"), "(•••) •••-0701");
  for (const bad of [null, undefined, "", "701", "07011", "abcd", "<b>1</b>"]) assert.equal(maskPhoneLast4(bad), null);
  assert.equal(safeHint("O•••@cle.example"), "O•••@cle.example");
  for (const bad of [null, "owner@cle.example", "O•••@", "O•••@a b", 5, "O•••@" + "x".repeat(200)]) assert.equal(safeHint(bad), null);
});
test("emailLinkMessage talks about links, not codes", () => {
  assert.equal(emailLinkMessage({ result: "verified" }).ok, true);
  for (const r of ["expired", "rejected", "cancelled", "already_claimed", "wrong", "weird"]) { const m = emailLinkMessage({ result: r }); assert.equal(m.ok, false); assert.equal(m.done, true); assert.doesNotMatch(m.text, /code/i); }
});
