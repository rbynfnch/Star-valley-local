import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePostcardCode, postcardMessage } from "./postcard.ts";

test("codes are accepted with spaces, hyphens and any case; ambiguous or short ones are not", () => {
  assert.equal(parsePostcardCode("abcde fghjk"), "ABCDEFGHJK"); assert.equal(parsePostcardCode("ABCDE-FGHJK"), "ABCDEFGHJK"); assert.equal(parsePostcardCode(" 23456 789ab "), "23456789AB");
  for (const bad of ["", "ABCDEFGHJ", "ABCDEFGHJKL", "ABCDEFGHIO", "ABCDE0GHJK", "ABCDE1GHJK", "A".repeat(50), null, 12345678901]) assert.equal(parsePostcardCode(bad as never), null, String(bad));
});
test("messages say what to do next and never explain why a code failed", () => {
  assert.equal(postcardMessage({ result: "verified", level: "gold" }).ok, true); assert.match(postcardMessage({ result: "verified", level: "gold" }).text, /Gold/);
  assert.match(postcardMessage({ result: "expired" }).text, /new postcard/); assert.match(postcardMessage({ result: "not_verified" }).text, /Verify your listing first/);
  for (const r of ["invalid", "void", "anything"]) { const m = postcardMessage({ result: r }); assert.equal(m.ok, false); assert.doesNotMatch(m.text, /void|owner of another|someone else/i); }
});
