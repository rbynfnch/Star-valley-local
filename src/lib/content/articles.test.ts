import { test } from "node:test";
import assert from "node:assert/strict";
import { articleJsonLd, articlesUrl, buildArticleView, coverFor, parseArticleParams, toArticleCard, weekendLabel, type ArticleCtx } from "./articles.ts";
import type { ArticleFull, ArticleListRow } from "../directory/types.ts";

const ctx: ArticleCtx = {
  categories: [{ id: "k1", slug: "things-to-do", name: "Things to Do", color_token: "navy", sort_order: 1 }], authors: [{ id: "a1", name: "Taylor Jensen", bio: "Writes about the valley." }],
  media: [{ id: "m1", storage_bucket: "media", storage_path: "t/articles/a/cover.jpg", alt_text: "Mountains at dusk", width: 1200, height: 800 }, { id: "m2", storage_bucket: "media", storage_path: "../etc/passwd", alt_text: null, width: null, height: null }],
  mediaBase: "https://x.supabase.co/storage/v1/object/public", tz: "America/Denver",
};
const row = (o: Partial<ArticleListRow> = {}): ArticleListRow => ({ id: "x1", slug: "ten-things", title: "10 Things", excerpt: "Weekend ideas", category_id: "k1", author_id: "a1", cover_media_id: "m1", read_minutes: 2, featured_rank: 1, publish_at: "2026-10-05T06:00:00Z", ...o });
const full = (o: Partial<ArticleFull> = {}): ArticleFull => ({ ...row(), body_md: "## Hello\n\nA **bold** claim.", spotlight_business_id: null, seo_title: null, seo_description: null, ...o });

test("params and URLs", () => {
  assert.deepEqual(parseArticleParams({ category: "things-to-do", q: " hike ", page: "2" }), { category: "things-to-do", q: "hike", page: 2 });
  assert.deepEqual(parseArticleParams({ category: "A B", q: "\u0000", page: "x" }), { category: null, q: "", page: 1 });
  assert.equal(articlesUrl({}), "/articles"); assert.equal(articlesUrl({ category: "things-to-do", q: "a b", page: 2 }), "/articles?category=things-to-do&q=a+b&page=2");
});
test("cards carry category, author, a tenant-timezone date, reading time and a cover from the media base", () => {
  const c = toArticleCard(row(), ctx);
  assert.equal(c.categoryName, "Things to Do"); assert.equal(c.authorName, "Taylor Jensen"); assert.equal(c.readText, "2 min read"); assert.equal(c.dateText, "Oct 5, 2026");
  assert.deepEqual(c.image, { url: "https://x.supabase.co/storage/v1/object/public/media/t/articles/a/cover.jpg", alt: "Mountains at dusk" });
  assert.equal(toArticleCard(row({ read_minutes: null, category_id: null, author_id: null }), ctx).readText, null);
});
test("a missing, unsafe or unreadable cover is no image, never a broken or traversal URL", () => {
  assert.equal(coverFor("m2", ctx), null); assert.equal(coverFor("nope", ctx), null); assert.equal(coverFor(null, ctx), null); assert.equal(coverFor("m1", { ...ctx, mediaBase: null }), null);
});
test("the article view renders the body safely, builds the description, and links items to businesses", () => {
  const v = buildArticleView(full({ body_md: "Hi <script>alert(1)</script> **there**", excerpt: null }), [{ position: 1, title: "Hike", body: "A *good* one", business_id: "b1", event_id: null }, { position: 2, title: "Shop", body: null, business_id: "gone", event_id: null }], ctx,
    [{ id: "b1", slug: "outfitters", name: "Wind River Outfitters" } as never]);
  assert.doesNotMatch(v.html, /<script/); assert.match(v.html, /<strong>there<\/strong>/); assert.match(v.description, /^Hi/);
  assert.deepEqual(v.items.map((i) => [i.position, i.business?.slug ?? null, i.html]), [[1, "outfitters", "<p>A <em>good</em> one</p>"], [2, null, ""]]);
  assert.equal(v.path, "/articles/ten-things");
});
test("SEO overrides win over the title, excerpt and body", () => {
  const v = buildArticleView(full({ seo_title: "  Custom  ", seo_description: " Custom description " }), [], ctx, []);
  assert.equal(v.seoTitle, "Custom"); assert.equal(v.description, "Custom description");
});
test("JSON-LD: Article with author (or the site as author), publisher, image and a breadcrumb", () => {
  const [a, b] = articleJsonLd({ origin: "https://svl.example", path: "/articles/x", title: "T".repeat(150), description: "d", published: "2026-10-05T06:00:00Z", author: "Taylor", image: "/media/a.jpg", siteName: "Star Valley Local" }) as Record<string, unknown>[];
  assert.equal(a["@type"], "Article"); assert.equal((a.headline as string).length, 110); assert.deepEqual(a.author, { "@type": "Person", name: "Taylor" }); assert.deepEqual(a.image, ["https://svl.example/media/a.jpg"]); assert.equal(b["@type"], "BreadcrumbList");
  const n = articleJsonLd({ origin: "https://svl.example", path: "/articles/x", title: "T", description: "d", published: "2026-10-05T06:00:00Z", author: null, image: null, siteName: "SVL" })[0] as Record<string, unknown>;
  assert.deepEqual(n.author, { "@type": "Organization", name: "SVL" }); assert.equal(n.image, undefined);
});
test("weekend label", () => {
  const TZ = "America/Denver";
  assert.equal(weekendLabel(new Date("2026-10-09T23:00:00Z"), new Date("2026-10-12T06:00:00Z"), TZ), "Oct 9–11");
  assert.equal(weekendLabel(new Date("2026-10-30T23:00:00Z"), new Date("2026-11-02T07:00:00Z"), TZ), "Oct 30 – Nov 1");
});
