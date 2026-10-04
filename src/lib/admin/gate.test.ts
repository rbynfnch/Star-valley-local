import { test } from "node:test";
import assert from "node:assert/strict";
import { gateDecision } from "./gate.ts";

test("public pages are never gated", () => {
  for (const p of ["/", "/businesses", "/business/x", "/administrator", "/api/x"]) assert.deepEqual(gateDecision(p, "", false), { action: "allow" }, p);
});
test("signed-out visitors to /admin are sent to login with a safe next", () => {
  assert.deepEqual(gateDecision("/admin", "", false), { action: "redirect", to: "/admin/login?next=%2Fadmin" });
  assert.deepEqual(gateDecision("/admin/businesses", "?status=prospect", false), { action: "redirect", to: "/admin/login?next=%2Fadmin%2Fbusinesses%3Fstatus%3Dprospect" });
});
test("the login page itself is reachable signed out (no redirect loop)", () => {
  assert.deepEqual(gateDecision("/admin/login", "", false), { action: "allow" });
});
test("signed-in users pass the first-line gate (staff check happens in the layout)", () => {
  assert.deepEqual(gateDecision("/admin/businesses", "", true), { action: "allow" });
});
test("a hostile query string cannot change where login sends you", () => {
  const g = gateDecision("/admin/x", "?next=https://evil.example", false);
  assert.equal(g.action, "redirect");
  if (g.action === "redirect") assert.ok(decodeURIComponent(g.to.split("next=")[1]).startsWith("/admin/x"));
});
