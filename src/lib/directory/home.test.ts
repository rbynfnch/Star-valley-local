import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEventCards, buildFeaturedCards, topLevelCategories, verificationBadge } from './home.ts';
import type { BusinessRow, Category, Community, EventRow } from './types.ts';

const TZ = 'America/Denver';
const now = new Date('2026-10-04T18:00:00Z');
const communities: Community[] = [{ id: 'c1', slug: 'afton', name: 'Afton', sort_order: 1 }, { id: 'c2', slug: 'thayne', name: 'Thayne', sort_order: 2 }];
const categories: Category[] = [
  { id: 'k1', slug: 'eat', name: 'Eat & Drink', description: null, color_token: 'brick', parent_id: null, sort_order: 1 },
  { id: 'k2', slug: 'plumbing', name: 'Plumbing', description: null, color_token: null, parent_id: 'k0', sort_order: 1 },
  { id: 'k0', slug: 'home', name: 'Home & Property', description: null, color_token: 'lake', parent_id: null, sort_order: 0 },
];
const ev = (o: Partial<EventRow>): EventRow => ({ id: 'e', slug: 'e', title: 'E', starts_at: '2026-10-10T14:00:00Z', ends_at: null, all_day: false, community_id: 'c1', category_id: 'k1', venue_name: 'Town Square', rrule: null, recurrence_until: null, exdates: [], ...o });
const biz = (o: Partial<BusinessRow>): BusinessRow => ({ id: 'b', slug: 'b', name: 'Sample B', short_description: 'Desc', home_community_id: 'c2', primary_category_id: 'k2', phone: '307-555-0101', website: 'https://b.example', address_line1: '1 Sample St', city: 'Thayne', state: 'WY', postal_code: '83127', verification_level: 'green', ...o });

test('events: soonest first, past ones dropped, recurring ones contribute their NEXT date only, limited', () => {
  const rows = [
    ev({ id: '1', title: 'Later', starts_at: '2026-10-20T14:00:00Z' }),
    ev({ id: '2', title: 'Past', starts_at: '2026-09-01T14:00:00Z' }),
    ev({ id: '3', title: 'Weekly market', starts_at: '2026-09-05T14:00:00Z', rrule: 'FREQ=WEEKLY;BYDAY=SA' }),
    ev({ id: '4', title: 'Soon', starts_at: '2026-10-06T14:00:00Z' }),
  ];
  const cards = buildEventCards(rows, communities, categories, now, TZ, 3);
  assert.deepEqual(cards.map((c) => c.title), ['Soon', 'Weekly market', 'Later']);
  assert.equal(cards[1].start.toISOString(), '2026-10-10T14:00:00.000Z');
  assert.equal(cards[1].recurring, true);
  assert.equal(buildEventCards(rows, communities, categories, now, TZ, 99).length, 3, 'the past event is gone');
});
test('event cards carry venue + community and the category colour token', () => {
  const [c] = buildEventCards([ev({})], communities, categories, now, TZ);
  assert.equal(c.where, 'Town Square, Afton');
  assert.equal(c.categoryColor, 'brick');
  assert.equal(buildEventCards([ev({ venue_name: null, community_id: null })], communities, categories, now, TZ)[0].where, null);
});
test('featured: at most `visible`, every card has the facts and NONE of the forbidden fields', () => {
  const rows = Array.from({ length: 9 }, (_, i) => biz({ id: `b${i}`, slug: `b${i}`, name: `Sample ${i}` }));
  const cards = buildFeaturedCards(rows, communities, categories, 't1', now);
  assert.equal(cards.length, 6);
  for (const c of cards) {
    assert.deepEqual(Object.keys(c).sort(), ['categoryName', 'communityName', 'description', 'directionsHref', 'id', 'name', 'slug', 'telHref', 'verification', 'website']);
    assert.ok(!('rating' in c) && !('distance' in c) && !('isOpen' in c));
  }
  const c = cards[0];
  assert.equal(c.communityName, 'Thayne'); assert.equal(c.categoryName, 'Plumbing'); assert.equal(c.telHref, 'tel:+13075550101');
  assert.equal(c.website?.label, 'b.example'); assert.match(c.directionsHref!, /google\.com\/maps\/dir/);
});
test('featured: order rotates between hours but every business is eventually shown', () => {
  const rows = Array.from({ length: 9 }, (_, i) => biz({ id: `b${i}`, slug: `b${i}`, name: `S${i}` }));
  const seen = new Set<string>(); const orders = new Set<string>();
  for (let h = 0; h < 48; h++) { const c = buildFeaturedCards(rows, communities, categories, 't1', new Date(now.getTime() + h * 3600_000)); orders.add(c.map((x) => x.id).join()); c.forEach((x) => seen.add(x.id)); }
  assert.equal(seen.size, 9); assert.ok(orders.size > 20);
});
test('featured: unsafe website, missing phone, missing address are dropped, not rendered', () => {
  const [c] = buildFeaturedCards([biz({ website: 'javascript:alert(1)', phone: 'call us', address_line1: null })], communities, categories, 't1', now);
  assert.equal(c.website, null); assert.equal(c.telHref, null); assert.equal(c.directionsHref, null);
});
test('verification badge labels: Gold, Verified, none (the ladder has no other state)', () => {
  assert.equal(verificationBadge('gold')?.label, 'Gold Verified');
  assert.equal(verificationBadge('green')?.label, 'Verified');
  assert.equal(verificationBadge('none'), null);
});
test('top-level categories only, in order', () => {
  assert.deepEqual(topLevelCategories(categories).map((c) => c.slug), ['home', 'eat']);
});
