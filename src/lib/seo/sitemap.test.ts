import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRobotsTxt, buildSitemapXml, sitemapPaths } from './sitemap.ts';
import type { Category, Community, CountRow } from '../directory/types.ts';

const cat = (id: string, slug: string): Category => ({ id, slug, name: slug, plural_name: null, description: null, color_token: null, parent_id: null, sort_order: 0 });
const com = (id: string, slug: string): Community => ({ id, slug, name: slug, state: 'WY', sort_order: 0 });
const categories = [cat('p', 'plumbing'), cat('d', 'dentists'), cat('z', 'empty-cat')];
const communities = [com('a', 'afton'), com('t', 'thayne'), com('z', 'empty-town')];
const counts: CountRow[] = [{ category_id: 'p', community_id: null, n: 2 }, { category_id: 'd', community_id: null, n: 1 }, { category_id: null, community_id: 'a', n: 3 }, { category_id: null, community_id: 't', n: 1 },
  { category_id: 'p', community_id: 'a', n: 1 }, { category_id: 'p', community_id: 't', n: 1 }, { category_id: 'd', community_id: 'a', n: 1 }];

test('lists the home page, the directory and only hubs with at least 2 listings', () => {
  const p = sitemapPaths(categories, communities, counts);
  assert.deepEqual(p, ['/', '/businesses', '/pricing', '/communities/afton', '/categories/plumbing']);
  assert.ok(!p.some((x) => x.includes('empty')), 'no empty pages in the sitemap');
});
test('a hub with exactly ONE listing is not listed (thin pages: one valley-wide business must not spawn ten near-identical pages)', () => {
  const p = sitemapPaths(categories, communities, counts);
  for (const thin of ['/categories/dentists', '/communities/thayne', '/categories/plumbing/afton', '/categories/plumbing/thayne', '/categories/dentists/afton']) assert.ok(!p.includes(thin), thin);
});
test('every public business profile is listed (even a thin one: a profile is the page people search for)', () => {
  const p = sitemapPaths(categories, communities, counts, ['a-plumber', 'a-cafe']);
  assert.ok(p.includes('/business/a-plumber') && p.includes('/business/a-cafe'));
  assert.equal(sitemapPaths(categories, communities, counts).some((x) => x.startsWith('/business/')), false);
});
test('never lists a search or filter URL', () => assert.ok(!sitemapPaths(categories, communities, counts).some((x) => x.includes('?'))));
test('XML is well-formed and escaped, with absolute URLs', () => {
  const x = buildSitemapXml('https://x.example', ['/', '/a&b', '/c<d>', '/e"f\'g']);
  assert.match(x, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.ok(x.includes('<loc>https://x.example/a&amp;b</loc>') && x.includes('&lt;d&gt;') && x.includes('&quot;') && x.includes('&apos;'));
  assert.ok(!/<loc>[^<]*[&"'][^<]*<\/loc>/.test(x.replace(/&(amp|lt|gt|quot|apos);/g, '')), 'no raw special characters inside <loc>');
});
test('duplicates are removed and the file is capped at the protocol limit of 50,000', () => {
  assert.equal((buildSitemapXml('https://x.example', ['/a', '/a', '/b']).match(/<url>/g) ?? []).length, 2);
  assert.equal((buildSitemapXml('https://x.example', Array.from({ length: 60_000 }, (_, i) => `/p${i}`)).match(/<url>/g) ?? []).length, 50_000);
});
test('robots.txt allows everything, points at THIS tenant\'s sitemap, and does not block search URLs (they carry noindex)', () => {
  const r = buildRobotsTxt('https://tetonvalleylocal.example');
  assert.match(r, /Sitemap: https:\/\/tetonvalleylocal\.example\/sitemap\.xml/);
  assert.ok(!/Disallow/i.test(r));
});
