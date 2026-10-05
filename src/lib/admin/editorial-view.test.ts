import { test } from "node:test";
import assert from "node:assert/strict";
import { articleLive, dealLive } from "./editorial-view.ts";

const T = Date.parse("2026-10-07T12:00:00Z");
test("a deal is live while published and inside its dates", () => {
  const d = { status: "published", starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-10-31T00:00:00Z" };
  assert.equal(dealLive(d, T), true); assert.equal(dealLive({ ...d, ends_at: null }, T), true);
  assert.equal(dealLive({ ...d, status: "draft" }, T), false); assert.equal(dealLive({ ...d, status: "archived" }, T), false);
  assert.equal(dealLive({ ...d, starts_at: "2026-10-08T00:00:00Z" }, T), false); assert.equal(dealLive({ ...d, ends_at: "2026-10-07T12:00:00Z" }, T), false);
});
test("an article is live when published, or scheduled and its time has come; never a draft or archived", () => {
  assert.equal(articleLive({ status: "published", publish_at: "2026-10-01T00:00:00Z" }, T), true);
  assert.equal(articleLive({ status: "scheduled", publish_at: "2026-10-07T11:00:00Z" }, T), true); assert.equal(articleLive({ status: "scheduled", publish_at: "2026-10-08T11:00:00Z" }, T), false);
  assert.equal(articleLive({ status: "draft", publish_at: "2026-10-01T00:00:00Z" }, T), false); assert.equal(articleLive({ status: "archived", publish_at: "2026-10-01T00:00:00Z" }, T), false);
  assert.equal(articleLive({ status: "published", publish_at: null }, T), false);
});
