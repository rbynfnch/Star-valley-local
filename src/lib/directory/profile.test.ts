/* eslint-disable @typescript-eslint/no-explicit-any -- these tests inspect arbitrary schema.org JSON */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfileView, dealBadge, truncate, type ProfileContext } from './profile.ts';
import { jsonLdString } from '../seo/jsonld.ts';
import type { Category, Community, ProfileRaw } from './types.ts';

const communities: Community[] = [{ id: 'c-th', slug: 'thayne', name: 'Thayne', state: 'WY', sort_order: 1 }, { id: 'c-af', slug: 'afton', name: 'Afton', state: 'WY', sort_order: 2 }, { id: 'c-et', slug: 'etna', name: 'Etna', state: 'WY', sort_order: 3 }];
const categories: Category[] = [
  { id: 'k-h', slug: 'home-property', name: 'Home & Property', plural_name: null, description: null, color_token: null, parent_id: null, sort_order: 1 },
  { id: 'k-p', slug: 'plumbing', name: 'Plumbing', plural_name: 'Plumbers', description: null, color_token: null, parent_id: 'k-h', sort_order: 1 }];
const ctx: ProfileContext = { tenantName: 'Star Valley Local', timezone: 'America/Denver', origin: 'https://sv.example', mediaBase: 'https://x.supabase.co/storage/v1/object/public', region: 'Star Valley', communities, categories };

const enhanced = (): ProfileRaw => ({
  tier: 'enhanced',
  business: { id: 'b1', slug: 'sample-plumbing', name: 'Sample Plumbing', status: 'claimed', short_description: 'Residential and emergency plumbing.', description: 'A long fictional description.', highlights: ['Locally Owned'],
    hours_note: 'Emergency service 24/7', price_range: 2, phone: '307-555-0101', website: 'https://sample-plumbing.example', email: 'hi@sample-plumbing.example',
    address_line1: '110 Sample Street', address_line2: 'Suite 4', city: 'Thayne', state: 'WY', postal_code: '83127', home_community_id: 'c-th', primary_category_id: 'k-p',
    verification_level: 'gold', verified_at: '2026-09-15T12:00:00Z', reverify_due_at: '2027-09-15T12:00:00Z' },
  live_placement: true,
  hours: [1, 2, 3, 4, 5].map((d) => ({ day_of_week: d, opens: '08:00:00', closes: '17:00:00' })),
  service_area_community_ids: ['c-af', 'c-et'], category_ids: [],
  photos: [{ role: 'logo', caption: null, alt: 'Logo', bucket: 'media', path: 'sp/logo.png', width: 200, height: 200 }, { role: 'cover', caption: null, alt: null, bucket: 'media', path: 'sp/cover.jpg', width: 1600, height: 600 },
    { role: 'gallery', caption: 'Crew', alt: 'Our crew', bucket: 'media', path: 'sp/g1.jpg', width: 800, height: 600 }, { role: 'gallery', caption: null, alt: null, bucket: 'media', path: 'sp/g2.jpg', width: null, height: null }],
  services: [{ name: 'Water heaters' }, { name: 'Drain cleaning' }],
  links: [{ kind: 'facebook', url: 'https://facebook.example/sp' }, { kind: 'google_reviews', url: 'https://g.example/reviews/sp' }, { kind: 'instagram', url: 'javascript:alert(1)' }],
  faqs: [{ question: 'Emergencies?', answer: 'Yes, 24/7.' }],
  deals: [{ id: 'd1', title: '20% off', description: 'Tune-up', terms: 'One per customer', discount_type: 'percent', discount_value: '20.00', ends_at: '2026-10-31T05:59:00Z' }, { id: 'd2', title: 'Ongoing', description: null, terms: null, discount_type: 'other', discount_value: null, ends_at: null }],
});
const free = (): ProfileRaw => ({ ...enhanced(), tier: 'free', live_placement: false,
  business: { ...enhanced().business, description: null, highlights: [], email: null, verification_level: 'none', verified_at: null, reverify_due_at: null, status: 'unclaimed' },
  photos: [], services: [], links: [], faqs: [], deals: [] });

test('ENHANCED shows everything: description, highlights, email, services, social, FAQs, deals, all photos', () => {
  const v = buildProfileView(enhanced(), ctx);
  assert.equal(v.isEnhanced, true);
  assert.equal(v.description, 'A long fictional description.'); assert.deepEqual(v.highlights, ['Locally Owned']); assert.equal(v.email, 'hi@sample-plumbing.example');
  assert.deepEqual(v.services, ['Water heaters', 'Drain cleaning']); assert.equal(v.faqs.length, 1); assert.equal(v.deals.length, 2);
  assert.equal(v.logo?.url, 'https://x.supabase.co/storage/v1/object/public/media/sp/logo.png'); assert.equal(v.photos.length, 3);
  assert.deepEqual(v.photos[2], { url: 'https://x.supabase.co/storage/v1/object/public/media/sp/g2.jpg', alt: 'Sample Plumbing photo', width: 1200, height: 800 });
});

test('DEFENSE IN DEPTH: even if the database leaked Enhanced content into a FREE payload, the page does not show it', () => {
  const leaked: ProfileRaw = { ...enhanced(), tier: 'free' };           // everything Enhanced is still in the payload, only the tier says free
  const v = buildProfileView(leaked, ctx);
  assert.equal(v.isEnhanced, false);
  assert.equal(v.description, null); assert.deepEqual(v.highlights, []); assert.equal(v.email, null);
  assert.deepEqual(v.services, []); assert.deepEqual(v.social, []); assert.equal(v.googleReviewsHref, null); assert.deepEqual(v.faqs, []); assert.deepEqual(v.deals, []);
  assert.equal(v.photos.length, 1, 'Free shows the logo plus ONE photo'); assert.ok(v.logo);
  const ld = JSON.stringify(v.jsonLd);
  for (const leak of ['A long fictional description', 'hi@sample-plumbing', 'Water heaters', 'facebook.example', 'FAQPage', 'hasOfferCatalog']) assert.ok(!ld.includes(leak), `structured data leaked: ${leak}`);
});

test('FREE keeps what CLAUDE.md allows: name, category, community, address, phone, website, hours, short description', () => {
  const v = buildProfileView(free(), ctx);
  assert.equal(v.name, 'Sample Plumbing'); assert.equal(v.categoryName, 'Plumbing'); assert.equal(v.communityName, 'Thayne');
  assert.deepEqual(v.addressLines, ['110 Sample Street, Suite 4', 'Thayne, WY 83127']);
  assert.equal(v.telHref, 'tel:+13075550101'); assert.equal(v.website?.label, 'sample-plumbing.example'); assert.ok(v.directionsHref);
  assert.equal(v.hours.kind, 'known'); assert.equal(v.shortDescription, 'Residential and emergency plumbing.');
});

test('VERIFICATION: Gold and Green labels; the re-verification date appears only once verified', () => {
  const gold = buildProfileView(enhanced(), ctx).verification!;
  assert.equal(gold.label, 'Gold Verified'); assert.equal(gold.verifiedText, 'Last verified September 2026'); assert.equal(gold.reverifyText, 'Re-verification due September 15, 2027');
  const g = enhanced(); g.business.verification_level = 'green'; assert.equal(buildProfileView(g, ctx).verification!.label, 'Verified');
  const none = enhanced(); none.business.verification_level = 'none';                        // dates still in the payload: must NOT show
  assert.equal(buildProfileView(none, ctx).verification, null);
  assert.ok(!JSON.stringify(buildProfileView(none, ctx)).includes('Re-verification'));
  assert.equal(buildProfileView(free(), ctx).verification, null);
});

test('RULES: no ratings, reviews, distance or open-now anywhere in the view or the structured data', () => {
  for (const raw of [enhanced(), free()]) {
    const v = buildProfileView(raw, ctx);
    const everything = JSON.stringify(v) + JSON.stringify(v.jsonLd);
    for (const bad of ['aggregateRating', 'ratingValue', 'reviewCount', '"review"', 'openNow', 'isOpen', 'distance', 'Open now', 'Closed now']) assert.ok(!everything.includes(bad), bad);
  }
});

test('Google reviews is a link OUT only (kind google_reviews); social links drop unsafe URLs', () => {
  const v = buildProfileView(enhanced(), ctx);
  assert.equal(v.googleReviewsHref, 'https://g.example/reviews/sp');
  assert.deepEqual(v.social, [{ label: 'Facebook', href: 'https://facebook.example/sp' }], 'the javascript: link is dropped, google_reviews is not a social link');
});

test('hours: grouped for people, structured for search engines; no hours at all is unknown', () => {
  const v = buildProfileView(enhanced(), ctx);
  assert.deepEqual(v.hours, { kind: 'known', groups: [{ label: 'Mon–Fri', text: '8:00 AM – 5:00 PM', closed: false }, { label: 'Sat & Sun', text: 'Closed', closed: true }] });
  assert.equal(v.hoursNote, 'Emergency service 24/7');
  const none = enhanced(); none.hours = []; assert.deepEqual(buildProfileView(none, ctx).hours, { kind: 'unknown' });
});

test('deals: badges and validity text; ongoing deals say so', () => {
  const d = buildProfileView(enhanced(), ctx).deals;
  assert.deepEqual([d[0].badge, d[0].validText], ['20% OFF', 'Valid through Oct 30, 2026']);        // 05:59Z is still Oct 30 in Denver
  assert.deepEqual([d[1].badge, d[1].validText], [null, 'Ongoing']);
  assert.deepEqual([dealBadge('amount', '10.00'), dealBadge('amount', 12.5), dealBadge('percent', 7.5), dealBadge('bogo', null), dealBadge('percent', null), dealBadge('other', 5)], ['$10 OFF', '$12.50 OFF', '7.5% OFF', 'BUY 1 GET 1', null, null]);
});

test('LocalBusiness JSON-LD: complete, correct, and absolute', () => {
  const [biz, crumbs, faq] = buildProfileView(enhanced(), ctx).jsonLd as Record<string, any>[];
  assert.equal(biz['@type'], 'LocalBusiness'); assert.equal(biz.url, 'https://sv.example/business/sample-plumbing'); assert.equal(biz.telephone, '+13075550101');
  assert.deepEqual(biz.address, { '@type': 'PostalAddress', streetAddress: '110 Sample Street, Suite 4', addressLocality: 'Thayne', addressRegion: 'WY', addressCountry: 'US' });
  assert.equal(biz.priceRange, '$$'); assert.deepEqual(biz.areaServed.map((a: any) => a.name), ['Thayne', 'Afton', 'Etna']); assert.deepEqual(biz.sameAs, ['https://facebook.example/sp']);
  assert.equal(biz.openingHoursSpecification[0].opens, '08:00'); assert.equal(biz.image.length, 4); assert.ok(biz.image.every((u: string) => u.startsWith('https://')));
  assert.equal(biz.hasOfferCatalog.itemListElement.length, 2);
  assert.deepEqual(crumbs.itemListElement.map((i: any) => i.name), ['Home', 'Businesses', 'Home & Property', 'Plumbers', 'Sample Plumbing']);
  assert.equal(faq['@type'], 'FAQPage'); assert.equal(faq.mainEntity[0].acceptedAnswer.text, 'Yes, 24/7.');
});

test('a relative (development) image URL becomes absolute; with no origin there is no structured data at all', () => {
  const dev = buildProfileView(enhanced(), { ...ctx, mediaBase: '/demo-media' });
  assert.ok((dev.jsonLd[0] as any).image.every((u: string) => u.startsWith('https://sv.example/demo-media/')));
  assert.deepEqual(buildProfileView(enhanced(), { ...ctx, origin: null }).jsonLd, []);
});

test('hostile data is neutralised: unsafe URLs and storage paths vanish, markup in text cannot escape the JSON-LD script', () => {
  const raw = enhanced();
  raw.business.website = 'javascript:alert(1)'; raw.business.name = '</script><script>alert(1)</script>';
  raw.photos = [{ role: 'cover', caption: null, alt: null, bucket: 'media', path: '../../etc/passwd', width: 1, height: 1 }, { role: 'gallery', caption: null, alt: '"><img src=x onerror=1>', bucket: 'media', path: 'ok/a.jpg', width: 1, height: 1 }];
  const v = buildProfileView(raw, ctx);
  assert.equal(v.website, null); assert.equal(v.photos.length, 1); assert.equal(v.photos[0].url, 'https://x.supabase.co/storage/v1/object/public/media/ok/a.jpg');
  const s = jsonLdString(v.jsonLd);
  for (const bad of ['</script', '<script', '<!--']) assert.ok(!s.includes(bad));
  assert.doesNotThrow(() => JSON.parse(s));
});

test('title, description and canonical path', () => {
  const v = buildProfileView(enhanced(), ctx);
  assert.equal(v.title, 'Sample Plumbing | Plumbing in Thayne, WY'); assert.equal(v.path, '/business/sample-plumbing');
  assert.ok(v.metaDescription.length <= 160 && v.metaDescription.startsWith('Residential and emergency plumbing.') && /Thayne, WY/.test(v.metaDescription));
  assert.equal(truncate('x'.repeat(300), 160).length <= 160, true); assert.equal(truncate('short', 160), 'short');
  assert.ok(truncate('word '.repeat(60), 50).endsWith('…'));
});

test('claimable only while unclaimed; Featured follows the live placement; price level label', () => {
  assert.equal(buildProfileView(free(), ctx).claimable, true); assert.equal(buildProfileView(enhanced(), ctx).claimable, false);
  assert.equal(buildProfileView(enhanced(), ctx).featured, true); assert.equal(buildProfileView(free(), ctx).featured, false);
  const p = (n: number | null) => { const r = enhanced(); r.business.price_range = n; return buildProfileView(r, ctx).priceLabel; };
  assert.deepEqual([p(0), p(1), p(2), p(3), p(null), p(9)], ['Free', '$', '$$', '$$$', null, null]);
});
