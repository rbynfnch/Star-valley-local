import { test } from "node:test";
import assert from "node:assert/strict";
import { socialMeta } from "./meta.ts";

const o = { title: "Alpha Plumbing | Plumbers in Thayne, WY", description: "Licensed plumbers.", path: "/business/alpha", siteName: "Star Valley Local" };
test("Open Graph and Twitter carry the page's own title, description, canonical path and site name", () => {
  const m = socialMeta(o) as { openGraph: Record<string, unknown>; twitter: Record<string, unknown> };
  assert.deepEqual([m.openGraph.title, m.openGraph.description, m.openGraph.url, m.openGraph.siteName, m.openGraph.type], [o.title, o.description, "/business/alpha", "Star Valley Local", "website"]);
  assert.equal(m.twitter.card, "summary"); assert.equal(m.openGraph.images, undefined);
});
test("with an image, a large card is used; unsafe image values are ignored", () => {
  const m = socialMeta({ ...o, image: "https://cdn.example/a.jpg" }) as { openGraph: { images: { url: string }[] }; twitter: { card: string; images: string[] } };
  assert.equal(m.openGraph.images[0].url, "https://cdn.example/a.jpg"); assert.equal(m.twitter.card, "summary_large_image"); assert.deepEqual(m.twitter.images, ["https://cdn.example/a.jpg"]);
  for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAA", "", null, "a.jpg"]) assert.equal((socialMeta({ ...o, image: bad }) as { openGraph: { images?: unknown } }).openGraph.images, undefined, String(bad));
});
