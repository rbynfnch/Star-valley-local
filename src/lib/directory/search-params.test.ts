import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBusinessesUrl, DEFAULT_FILTERS, expandCategoryIds, hasActiveFilters, pageWindow, parseSearchParams, toQueryString, type SearchFilters } from './search-params.ts';

test('empty input gives the defaults', () => assert.deepEqual(parseSearchParams({}), DEFAULT_FILTERS));

test('valid input is parsed', () => {
  const f = parseSearchParams({ q: '  water   heater ', community: ['thayne', 'afton'], category: 'plumbing', verified: '1', deals: 'true', price: ['2', '1'], sort: 'name', page: '3' });
  assert.deepEqual(f, { q: 'water heater', communities: ['thayne', 'afton'], categories: ['plumbing'], verified: true, featured: false, deals: true, quotes: false, price: [1, 2], sort: 'name', page: 3 });
});

test('a single value and an array behave the same', () => {
  assert.deepEqual(parseSearchParams({ community: 'afton' }).communities, ['afton']);
  assert.deepEqual(parseSearchParams({ community: ['afton'] }).communities, ['afton']);
});

test('INVALID values are dropped, never passed through', () => {
  const f = parseSearchParams({
    community: ['ok-slug', 'Bad Slug', 'x;drop', '../etc', '', 'a'.repeat(61), '-lead', 'trail-', 'UPPER'],
    category: ["'; select 1;--", 'fine'], price: ['4', '-1', 'x', '1.5', '', '3'], sort: 'DROP TABLE', page: '-3', verified: 'yes', featured: '0',
  });
  assert.deepEqual(f.communities, ['ok-slug']);
  assert.deepEqual(f.categories, ['fine']);
  assert.deepEqual(f.price, [3]);
  assert.equal(f.sort, 'relevance'); assert.equal(f.page, 1); assert.equal(f.verified, false); assert.equal(f.featured, false);
});

test('page is an integer 1..500', () => {
  for (const [raw, want] of [['2', 2], ['0', 1], ['-1', 1], ['1.5', 1], ['abc', 1], ['', 1], ['999999', 500], ['500', 500]] as const) assert.equal(parseSearchParams({ page: raw }).page, want, raw);
});

test('q is truncated to 100 characters and whitespace-normalised', () => {
  assert.equal(parseSearchParams({ q: 'x'.repeat(500) }).q.length, 100);
  assert.equal(parseSearchParams({ q: '\n\t a   b  ' }).q, 'a b');
});

test('lists are de-duplicated and capped at 20', () => {
  assert.deepEqual(parseSearchParams({ community: ['a', 'a', 'b'] }).communities, ['a', 'b']);
  assert.equal(parseSearchParams({ community: Array.from({ length: 50 }, (_, i) => `c${i}`) }).communities.length, 20);
});

test('prototype tricks do not read inherited keys', () => {
  const raw = Object.create({ q: 'inherited', verified: '1' }) as Record<string, string>;
  assert.deepEqual(parseSearchParams(raw), DEFAULT_FILTERS);
  assert.deepEqual(parseSearchParams(JSON.parse('{"__proto__": {"q": "x"}, "constructor": "y"}')), DEFAULT_FILTERS);
});

test('CANONICAL URLs: the same filters always give the same URL, whatever the input order', () => {
  const a = parseSearchParams({ q: 'plumber', community: ['thayne', 'afton'], price: ['2', '1'], verified: '1' });
  const b = parseSearchParams({ verified: 'true', price: ['1', '2'], community: ['afton', 'thayne'], q: ' plumber ' });
  assert.equal(toQueryString(a), toQueryString(b));
  assert.equal(toQueryString(a), 'q=plumber&community=afton&community=thayne&verified=1&price=1&price=2');
});

test('defaults are omitted; page 1 and sort=relevance never appear', () => {
  assert.equal(buildBusinessesUrl(DEFAULT_FILTERS), '/businesses');
  assert.equal(buildBusinessesUrl({ ...DEFAULT_FILTERS, page: 1, sort: 'relevance' }), '/businesses');
  assert.equal(buildBusinessesUrl({ ...DEFAULT_FILTERS, page: 2 }), '/businesses?page=2');
  assert.equal(buildBusinessesUrl({ ...DEFAULT_FILTERS, sort: 'name' }), '/businesses?sort=name');
});

test('round trip: parse(build(f)) equals f', () => {
  const f: SearchFilters = { q: 'café & bar #1', communities: ['afton'], categories: ['eat-drink', 'plumbing'], verified: true, featured: true, deals: true, quotes: true, price: [0, 3], sort: 'name', page: 4 };
  const url = new URL(buildBusinessesUrl(f), 'https://x.example');
  const back = parseSearchParams(Object.fromEntries([...new Set(url.searchParams.keys())].map((k) => [k, url.searchParams.getAll(k)])));
  assert.deepEqual(back, { ...f, communities: [...f.communities].sort(), categories: [...f.categories].sort() });
});

test('the query text is URL-encoded (no injection into the URL)', () => {
  const u = buildBusinessesUrl({ ...DEFAULT_FILTERS, q: 'a&b=c#frag"<script>' });
  assert.ok(!u.includes('#') && !u.includes('"') && !u.includes('<') && !u.includes('&b=c'));
});

test('overrides change one thing and keep the rest (used for pagination and filter chips)', () => {
  const f = { ...DEFAULT_FILTERS, q: 'x', verified: true, page: 3 };
  assert.equal(buildBusinessesUrl(f, { page: 4 }), '/businesses?q=x&verified=1&page=4');
  assert.equal(buildBusinessesUrl(f, { verified: false, page: 1 }), '/businesses?q=x');
});

test('hasActiveFilters ignores page and sort (so /businesses?page=2 is not treated as a faceted URL)', () => {
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, page: 2, sort: 'name' }), false);
  for (const o of [{ q: 'a' }, { communities: ['a'] }, { categories: ['a'] }, { verified: true }, { featured: true }, { deals: true }, { quotes: true }, { price: [1] }] as Partial<SearchFilters>[]) assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, ...o }), true);
});

test('pageWindow', () => {
  assert.deepEqual(pageWindow(1, 1), []);
  assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(6, 20), [1, 'gap', 4, 5, 6, 7, 8, 'gap', 20]);
  assert.deepEqual(pageWindow(1, 20), [1, 2, 3, 'gap', 20]);
  assert.deepEqual(pageWindow(20, 20), [1, 'gap', 18, 19, 20]);
  assert.deepEqual(pageWindow(3, 6), [1, 2, 3, 4, 5, 6]);
});

test('a top-level category selects its subcategories; unknown slugs select nothing', () => {
  const cats = [{ id: 'h', slug: 'home', parent_id: null }, { id: 'p', slug: 'plumbing', parent_id: 'h' }, { id: 'r', slug: 'roofing', parent_id: 'h' }, { id: 'e', slug: 'eat', parent_id: null }];
  assert.deepEqual(expandCategoryIds(['home'], cats).sort(), ['h', 'p', 'r']);
  assert.deepEqual(expandCategoryIds(['plumbing'], cats), ['p']);
  assert.deepEqual(expandCategoryIds(['nope'], cats), []);
  assert.deepEqual(expandCategoryIds(['home', 'eat'], cats).sort(), ['e', 'h', 'p', 'r']);
});
