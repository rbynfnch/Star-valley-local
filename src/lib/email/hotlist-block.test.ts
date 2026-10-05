import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHotlistBlock, type BlockItem } from "./hotlist-block.ts";

const deal = (o: Partial<BlockItem> = {}): BlockItem => ({ title: "Breakfast for two", slug: "breakfast-for-two", kind: "deal", category: "eat_drink", businessName: "Creekside Cafe", imageUrl: "https://cdn.test/a.png", originalCents: 3600, priceCents: 2400, endsAt: "2026-11-01T06:00:00Z", ...o });
const pick = (o: Partial<BlockItem> = {}): BlockItem => ({ title: "Pie of the week", slug: "pie", kind: "pick", category: "eat_drink", businessName: "Diner", originalCents: null, priceCents: null, endsAt: null, ...o });

test("the lead deal shows price, value, saving and end; links go to the item and the full Hotlist", () => {
  const r = renderHotlistBlock({ origin: "https://svl.example", tz: "America/Denver", items: [deal(), pick(), deal({ slug: "two", title: "Two" })] });
  assert.equal(r.count, 3);
  assert.match(r.html, /This week&#39;s Hotlist/); assert.match(r.html, /\$24 · \$36 value · Save \$12 · Ends Oct 31/); assert.match(r.html, /href="https:\/\/svl\.example\/hotlist\/breakfast-for-two"/);
  assert.match(r.html, /See the full Hotlist/); assert.match(r.text, /^THIS WEEK'S HOTLIST/); assert.match(r.text, /https:\/\/svl\.example\/hotlist\/pie/); assert.match(r.text, /Hotlist Pick/);
});
test("at most five items; none gives an empty block", () => {
  assert.equal(renderHotlistBlock({ origin: "https://x.test", tz: "UTC", items: Array.from({ length: 9 }, (_, n) => deal({ slug: `s${n}` })) }).count, 5);
  assert.deepEqual(renderHotlistBlock({ origin: "https://x.test", tz: "UTC", items: [] }), { html: "", text: "", count: 0 });
});
test("names and titles are escaped and cannot inject markup or headers", () => {
  const r = renderHotlistBlock({ origin: "https://x.test", tz: "UTC", items: [deal({ title: '<script>alert(1)</script>"', businessName: "A&B\r\nBcc: x", slug: "a b/c" })] });
  assert.doesNotMatch(r.html, /<script>/); assert.match(r.html, /A&amp;B/); assert.match(r.html, /hotlist\/a%20b%2Fc/); assert.doesNotMatch(r.text, /\r/);
});
