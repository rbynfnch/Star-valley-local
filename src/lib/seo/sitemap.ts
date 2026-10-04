// sitemap.xml and robots.txt for one tenant. Only pages that exist and are worth indexing are listed:
// hubs below the indexing minimum are excluded (zero-business combinations 404; thin ones are noindex). Search and
// filter URLs are never listed (they are noindex).
import { countFor, isIndexable } from "../directory/hub.ts";
import type { Category, Community, CountRow } from "../directory/types.ts";

export function sitemapPaths(categories: Category[], communities: Community[], counts: CountRow[]): string[] {
  const paths = ["/", "/businesses"];
  for (const m of communities) if (isIndexable(countFor(counts, null, m.id))) paths.push(`/communities/${m.slug}`);
  for (const c of categories) {
    if (isIndexable(countFor(counts, c.id, null))) paths.push(`/categories/${c.slug}`);
    for (const m of communities) if (isIndexable(countFor(counts, c.id, m.id))) paths.push(`/categories/${c.slug}/${m.slug}`);
  }
  return paths;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function buildSitemapXml(origin: string, paths: string[]): string {
  const urls = [...new Set(paths)].slice(0, 50_000);       // the protocol limit per sitemap file
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((p) => `  <url><loc>${xml(origin + p)}</loc></url>`).join("\n")}\n</urlset>\n`;
}

export function buildRobotsTxt(origin: string): string {
  // Everything public is crawlable. Faceted/search URLs are deliberately NOT disallowed: crawlers must be able to fetch
  // them to see their `noindex`. (Blocking in robots.txt would keep them in the index as URL-only results.)
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}
