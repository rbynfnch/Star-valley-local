import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLanding, toCards } from "./view.ts";
import type { HotlistListRow } from "../directory/types.ts";

const row = (id: string, kind: "deal" | "pick", over: Partial<HotlistListRow> = {}): HotlistListRow => ({ id, slug: id, kind, category: "shop", badge: kind === "deal" ? "hot_deal" : "hotlist_pick", title: id, summary: null, business_id: "b", business_name: "B", business_slug: "b",
  community_id: "c1", image_media_id: "m1", starts_at: "2026-10-01T00:00:00Z", ends_at: null, original_cents: null, price_cents: null, quantity: null, claimed_count: 0, published_at: null, ...over });

test("cards get their photo and town; a missing photo stays empty", () => {
  const cards = toCards([row("a", "deal"), row("b", "deal", { image_media_id: "gone", community_id: null })], [{ id: "m1", storage_bucket: "media", storage_path: "x/y.png", alt_text: "Alt", width: 1, height: 1 }] as never, [{ id: "c1", name: "Afton" }] as never, "https://cdn.test");
  assert.equal(cards[0].town, "Afton"); assert.match(cards[0].image?.url ?? "", /x\/y\.png$/); assert.equal(cards[0].image?.alt, "Alt");
  assert.equal(cards[1].image, null); assert.equal(cards[1].town, null);
});
test("landing: slots follow the editors' order and limits; deals and picks skip what is already above", () => {
  const all = ["d1", "d2", "d3", "d4", "p1", "p2"].map((id) => ({ row: row(id, id.startsWith("d") ? "deal" : "pick"), image: null, town: null }));
  const feats = [{ slot: "hottest" as const, position: 2, item_id: "d1" }, { slot: "hottest" as const, position: 1, item_id: "d3" }, { slot: "this_week" as const, position: 1, item_id: "p2" }, { slot: "business" as const, position: 1, item_id: "p1" }, { slot: "hottest" as const, position: 3, item_id: "gone" }];
  const l = buildLanding(all, feats);
  assert.deepEqual(l.hottest.map((c) => c.row.id), ["d3", "d1"]);
  assert.deepEqual(l.week.map((c) => c.row.id), ["p2"]); assert.equal(l.business?.row.id, "p1");
  assert.deepEqual(l.deals.map((c) => c.row.id), ["d2", "d4"]); assert.deepEqual(l.picks.map((c) => c.row.id), ["p2"]);
});
test("no editorial picks yet: the landing still has content and no business slot", () => {
  const l = buildLanding([{ row: row("d1", "deal"), image: null, town: null }], []);
  assert.equal(l.hottest.length, 0); assert.equal(l.business, null); assert.equal(l.deals.length, 1);
});
