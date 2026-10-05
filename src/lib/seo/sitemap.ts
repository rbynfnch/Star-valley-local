// sitemap.xml and robots.txt for one tenant. Only pages that exist and are worth indexing are listed:
// hubs below the indexing minimum are excluded (zero-business combinations 404; thin ones are noindex). Search and
// filter URLs are never listed (they are noindex).
import { countFor, isIndexable } from "../directory/hub.ts";
import type { Category, Community, CountRow } from "../directory/types.ts";

export function sitemapPaths(categories: Category[], communities: Community[], counts: CountRow[], businessSlugs: string[] = [], content: { eventSlugs?: string[]; articleSlugs?: string[]; hotlistSlugs?: string[] } = {}): string[] {
  const paths = ["/", "/businesses", "/pricing", "/events", "/hotlist", "/hotlist/submit", "/articles", "/things-to-do"];
  for (const m of communities) if (isIndexable(countFor(counts, null, m.id))) paths.push(`/communities/${m.slug}`);
  for (const c of categories) {
    if (isIndexable(countFor(counts, c.id, null))) paths.push(`/categories/${c.slug}`);
    for (const m of communities) if (isIndexable(countFor(counts, c.id, m.id))) paths.push(`/categories/${c.slug}/${m.slug}`);
  }
  for (const slug of businessSlugs) paths.push(`/business/${slug}`);   // every PUBLIC business has a profile worth indexing, however small
  for (const slug of content.eventSlugs ?? []) paths.push(`/events/${slug}`);      // upcoming and recurring events only: past ones are noindex
  for (const slug of content.articleSlugs ?? []) paths.push(`/articles/${slug}`);
  for (const slug of content.hotlistSlugs ?? []) paths.push(`/hotlist/${slug}`);       // live Hotlist items only: ended ones are noindex
  return paths;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function buildSitemapXml(origin: string, paths: string[]): string {
  const urls = [...new Set(paths)].slice(0, 50_000);       // the protocol limit per sitemap file
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((p) => `  <url><loc>${xml(origin + p)}</loc></url>`).join("\n")}\n</urlset>\n`;
}

/** `closed` = a test site: ask every crawler to stay away (SVL_NOINDEX=1). */
export function buildRobotsTxt(origin: string, closed = false): string {
  if (closed) return "User-agent: *\nDisallow: /\n";
  // Everything public is crawlable. Faceted/search URLs are deliberately NOT disallowed: crawlers must be able to fetch
  // them to see their `noindex`. (Blocking in robots.txt would keep them in the index as URL-only results.)
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}
