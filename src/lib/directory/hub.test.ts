import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breadcrumbJsonLd, breadcrumbs, countFor, hubText, isIndexable, itemListJsonLd, MIN_INDEXABLE_LISTINGS, plural, relatedLinks } from './hub.ts';
import type { Category, Community, CountRow } from './types.ts';

const cat = (id: string, slug: string, name: string, plural_name: string | null, parent_id: string | null, sort_order = 0): Category => ({ id, slug, name, plural_name, description: null, color_token: null, parent_id, sort_order });
const com = (id: string, slug: string, name: string, sort_order: number): Community => ({ id, slug, name, state: 'WY', sort_order });
const categories = [cat('h', 'home-property', 'Home & Property', null, null, 1), cat('p', 'plumbing', 'Plumbing', 'Plumbers', 'h', 1), cat('r', 'roofing', 'Roofing', 'Roofers', 'h', 2),
  cat('e', 'eat-drink', 'Eat & Drink', null, null, 2), cat('d', 'dentists', 'Dentists', 'Dentists', 'x', 1)];
const communities = [com('a', 'afton', 'Afton', 1), com('t', 'thayne', 'Thayne', 2), com('u', 'etna', 'Etna', 3)];
const counts: CountRow[] = [
  { category_id: null, community_id: null, n: 10 }, { category_id: 'h', community_id: null, n: 4 }, { category_id: 'p', community_id: null, n: 3 }, { category_id: 'r', community_id: null, n: 1 },
  { category_id: 'e', community_id: null, n: 6 }, { category_id: null, community_id: 'a', n: 7 }, { category_id: null, community_id: 't', n: 5 },
  { category_id: 'p', community_id: 'a', n: 2 }, { category_id: 'p', community_id: 't', n: 3 }, { category_id: 'h', community_id: 'a', n: 3 }, { category_id: 'h', community_id: 't', n: 4 },
  { category_id: 'e', community_id: 'a', n: 4 }, { category_id: 'r', community_id: 'a', n: 1 },
];

test('plural name falls back to the name', () => { assert.equal(plural(categories[1]), 'Plumbers'); assert.equal(plural(categories[0]), 'Home & Property'); assert.equal(plural({ ...categories[1], plural_name: '  ' }), 'Plumbing'); });
test('countFor: null means all, a missing row means zero', () => {
  assert.equal(countFor(counts, null, null), 10); assert.equal(countFor(counts, 'p', 'a'), 2); assert.equal(countFor(counts, 'p', 'u'), 0); assert.equal(countFor(counts, 'zzz', null), 0);
});
test('titles read like the search people make', () => {
  assert.equal(hubText({ category: categories[1], community: communities[1], region: 'Star Valley', count: 3 }).h1, 'Plumbers in Thayne, WY');
  assert.equal(hubText({ category: categories[1], region: 'Star Valley', count: 3 }).h1, 'Plumbers in Star Valley');
  assert.equal(hubText({ community: communities[0], region: 'Star Valley', count: 7 }).h1, 'Local businesses in Afton, WY');
  assert.equal(hubText({ category: categories[3], region: null, count: 1 }).h1, 'Eat & Drink in our area');
});
test('descriptions are accurate and singular/plural is right', () => {
  assert.match(hubText({ category: categories[1], community: communities[1], region: null, count: 1 }).description, /1 local listing with/);
  assert.match(hubText({ category: categories[1], community: communities[1], region: null, count: 3 }).description, /3 local listings with/);
  for (const t of [hubText({ category: categories[1], region: 'x', count: 2 }), hubText({ community: communities[0], region: 'x', count: 2 })]) {
    assert.ok(t.description.length < 200); assert.ok(!/best|top-rated|rated|reviews|open now|miles/i.test(t.description), 'no claims we cannot back (CLAUDE.md: no reviews, distance, open now)');
  }
});
test('breadcrumbs: subcategories show their parent; combos end on the community', () => {
  assert.deepEqual(breadcrumbs({ category: categories[1], categories, community: communities[1], tenantName: 'T' }).map((c) => c.name), ['Home', 'Businesses', 'Home & Property', 'Plumbers', 'Thayne']);
  assert.deepEqual(breadcrumbs({ category: categories[0], categories, tenantName: 'T' }).map((c) => c.path), ['/', '/businesses', '/categories/home-property']);
  assert.deepEqual(breadcrumbs({ community: communities[0], categories, tenantName: 'T' }).map((c) => c.path), ['/', '/businesses', '/communities/afton']);
});
test('related links point ONLY at hubs that exist (never thin pages)', () => {
  const all = [['category', categories[0], undefined], ['category', categories[1], undefined], ['community', undefined, communities[0]], ['combo', categories[1], communities[1]], ['combo', categories[3], communities[0]]] as const;
  for (const [kind, category, community] of all) {
    for (const sec of relatedLinks({ kind, category, community, categories, communities, counts })) for (const l of sec.links) assert.ok(l.n >= 1, `${kind}: ${l.href} has n=${l.n}`);
  }
});
test('a category hub lists its subcategories and the communities that have it', () => {
  const secs = relatedLinks({ kind: 'category', category: categories[0], categories, communities, counts });
  assert.deepEqual(secs[0].links.map((l) => l.href), ['/categories/plumbing', '/categories/roofing']);
  assert.deepEqual(secs[1].links.map((l) => l.href), ['/categories/home-property/afton', '/categories/home-property/thayne']);   // no Etna: zero businesses
});
test('a community hub lists its categories and the other communities that have businesses', () => {
  const secs = relatedLinks({ kind: 'community', community: communities[0], categories, communities, counts });
  assert.deepEqual(secs[0].links.map((l) => l.label), ['Home & Property in Afton', 'Eat & Drink in Afton']);
  assert.deepEqual(secs[1].links.map((l) => l.href), ['/communities/thayne']);                                                      // Etna has none
});
test('a combo hub links to the same category elsewhere and to other categories here, never to itself', () => {
  const secs = relatedLinks({ kind: 'combo', category: categories[1], community: communities[1], categories, communities, counts });
  const hrefs = secs.flatMap((s) => s.links.map((l) => l.href));
  assert.ok(hrefs.includes('/categories/plumbing/afton')); assert.ok(!hrefs.includes('/categories/plumbing/thayne'));
  assert.ok(hrefs.includes('/categories/eat-drink/thayne') === false, 'eat-drink has no businesses in Thayne in this data');
  assert.ok(!hrefs.includes('/categories/home-property/thayne'), 'its own parent is not offered as "more"');
});
test('JSON-LD: breadcrumbs and item list use absolute URLs and consecutive positions', () => {
  const b = breadcrumbJsonLd('https://x.example', [{ name: 'Home', path: '/' }, { name: 'Businesses', path: '/businesses' }]);
  assert.deepEqual(b.itemListElement.map((i) => [i.position, i.item]), [[1, 'https://x.example/'], [2, 'https://x.example/businesses']]);
  const l = itemListJsonLd('https://x.example', 'Plumbers', [{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }], 13);
  assert.deepEqual(l.itemListElement.map((i) => [i.position, i.url]), [[13, 'https://x.example/business/a'], [14, 'https://x.example/business/b']]);
});

test('indexing threshold: 0 and 1 listing are not indexed, 2 and more are', () => {
  assert.equal(MIN_INDEXABLE_LISTINGS, 2);
  assert.deepEqual([0, 1, 2, 3, 50].map(isIndexable), [false, false, true, true, true]);
});
