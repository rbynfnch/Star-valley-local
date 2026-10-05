import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSteps, type Facts } from "./checklist.ts";

const base: Facts = { id: "b1", tier: "free", verification: "green", hasHours: false, hasLogo: false, hasCover: false, hasWebsite: false, hasDescription: false, postcardPending: false, newLeads: 0 };
const keys = (f: Facts) => nextSteps(f).filter((s) => !s.done).map((s) => s.key);

test("a bare Free listing is told to fill in the basics, upgrade, and ask for a postcard", () => {
  assert.deepEqual(keys(base), ["hours", "logo", "cover", "website", "upgrade", "gold"]);
});
test("new leads come first and read naturally", () => {
  const s = nextSteps({ ...base, newLeads: 3 })[0]; assert.equal(s.key, "leads"); assert.equal(s.text, "You have 3 new quote requests");
  assert.equal(nextSteps({ ...base, newLeads: 1 })[0].text, "You have 1 new quote request");
});
test("unverified businesses are sent to verify; Gold ones are not nagged about postcards", () => {
  assert.ok(keys({ ...base, verification: "none" }).includes("verify")); assert.ok(!keys({ ...base, verification: "none" }).includes("gold"));
  assert.ok(!keys({ ...base, verification: "gold" }).some((k) => k === "gold" || k === "postcard"));
});
test("a waiting postcard says to enter the code; Enhanced swaps the upgrade for a description", () => {
  assert.ok(keys({ ...base, postcardPending: true }).includes("postcard")); assert.ok(!keys({ ...base, postcardPending: true }).includes("gold"));
  const e = keys({ ...base, tier: "enhanced" }); assert.ok(e.includes("description")); assert.ok(!e.includes("upgrade"));
});
test("finished steps move to the end and every link stays inside the dashboard or the public flow", () => {
  const all = nextSteps({ ...base, hasHours: true, hasLogo: true });
  const firstDone = all.findIndex((s) => s.done); assert.ok(all.slice(firstDone).every((s) => s.done));
  assert.deepEqual(all.filter((s) => s.done).map((s) => s.key).sort(), ["hours", "leads", "logo", "verify"]);
  for (const s of all) assert.match(s.href, /^\/(dashboard\/b1|list-your-business|verify\/postcard)/);
});
