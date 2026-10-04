import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAfterAuth } from "./account-next.ts";

test("claim and account pages are allowed; everything else goes home", () => {
  assert.equal(nextAfterAuth("/list-your-business?claim=sample-valley-plumbing"), "/list-your-business?claim=sample-valley-plumbing");
  assert.equal(nextAfterAuth("/account/sign-in"), "/account/sign-in");
  for (const bad of ["/admin", "/admin/businesses", "https://evil.example", "//evil.example", "/businesses", undefined, null, 5, "/list-your-business/../admin"]) assert.equal(nextAfterAuth(bad), "/", String(bad));
});
