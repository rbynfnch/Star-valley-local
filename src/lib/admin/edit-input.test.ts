import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEditInput } from "./edit-input.ts";

const ID = "3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b";
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

test("trims, normalises newlines, keeps only fields present on the form", () => {
  const r = parseEditInput(form({ business: ID, name: "  Alpha ", description: "a\r\nb", phone: "" }));
  assert.deepEqual(r, { ok: true, business: ID, fields: { name: "Alpha", description: "a\nb", phone: "" } });
});
test("unknown business is refused", () => { assert.equal(parseEditInput(form({ business: "x", name: "A" })).ok, false); });
test("name cannot be emptied, but an absent name is fine", () => {
  assert.equal(parseEditInput(form({ business: ID, name: "  " })).ok, false);
  assert.equal(parseEditInput(form({ business: ID, phone: "1" })).ok, true);
});
test("website must be http(s) with no spaces; empty clears", () => {
  for (const bad of ["javascript:alert(1)", "example.com", "ftp://x.example", "https://a b.example"]) assert.equal(parseEditInput(form({ business: ID, website: bad })).ok, false, bad);
  assert.equal(parseEditInput(form({ business: ID, website: "https://x.example/a?b=1" })).ok, true);
  assert.deepEqual((parseEditInput(form({ business: ID, website: "" })) as { fields: object }).fields, { website: "" });
});
test("email shape", () => {
  assert.equal(parseEditInput(form({ business: ID, email: "nope" })).ok, false);
  assert.equal(parseEditInput(form({ business: ID, email: "a@b.co" })).ok, true);
});
test("length limits give a readable message", () => {
  const r = parseEditInput(form({ business: ID, short_description: "x".repeat(121) }));
  assert.ok(!r.ok && /Short description is limited to 120/.test(r.error));
  assert.equal(parseEditInput(form({ business: ID, description: "x".repeat(1501) })).ok, false);
});
test("community and category must be ids (or empty); control characters are stripped", () => {
  assert.equal(parseEditInput(form({ business: ID, home_community_id: "thayne" })).ok, false);
  const r = parseEditInput(form({ business: ID, home_community_id: ID.toUpperCase(), primary_category_id: "", name: "A\u0000B" }));
  assert.deepEqual(r, { ok: true, business: ID, fields: { name: "AB", home_community_id: ID, primary_category_id: "" } });
});
test("fields outside the form are never invented", () => {
  const r = parseEditInput(form({ business: ID, name: "A", status: "claimed", verification_level: "gold", slug: "x" }));
  assert.ok(r.ok && Object.keys(r.fields).join() === "name");
});
