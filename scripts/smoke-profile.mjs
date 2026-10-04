// End-to-end check of /business/[slug]: Enhanced vs Free rendering, structured data, rules, and a crawl of every profile in
// the sitemap. Needs a dev server in fixtures mode with SVL_MEDIA_BASE_URL=/demo-media (after `npm run demo:media`):
//   node scripts/smoke-profile.mjs [port] [host]
import http from 'node:http';

const port = Number(process.argv[2] ?? 3101);
const host = process.argv[3] ?? 'star-valley.localhost';
const get = (path) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path, headers: { host: `${host}:${port}` } }, (res) => {
    let body = ''; res.on('data', (d) => (body += d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject);
});
let failed = 0;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} - ${msg}`); if (!cond) failed++; };
const textOf = (b) => b.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&(?:#x27|#39|apos);/g, "'").replace(/\s+/g, ' ');
const robots = (b) => /<meta name="robots" content="([^"]*)"/.exec(b)?.[1] ?? null;
const canonical = (b) => /<link rel="canonical" href="([^"]*)"/.exec(b)?.[1] ?? null;
const h1 = (b) => textOf(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(b)?.[1] ?? '');
const ld = (b) => [...b.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => { try { return [].concat(JSON.parse(m[1])); } catch { return [null]; } });
const has = (b, id) => new RegExp(`<section[^>]*id="${id}"`).test(b);
const imgs = (b) => [...b.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
const rules = (b, label) => {
  const t = textOf(b);
  check(!/\breviews?\b/i.test(t.replace(/see reviews on google/i, '')) && !/\bratings?\b|★|\b\d(\.\d)?\s*(\/\s*5|stars?)\b/i.test(t), `${label}: no reviews or ratings (a link OUT to Google reviews is the only mention allowed)`);
  check(!/\b\d+(\.\d+)?\s?mi\b|miles? away|open now|closed now|\bpremium\b/i.test(t), `${label}: no distance, "open now" or Premium`);
  check(!/request a quote/i.test(t), `${label}: no Request a Quote (it ships only once owners can actually receive requests)`);
  const lv = [...b.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
  check((b.match(/<h1[ >]/g) ?? []).length === 1 && lv.every((l, i) => i === 0 || l - lv[i - 1] <= 1), `${label}: one h1, heading levels never skip (${lv.join(',')})`);
  check(imgs(b).every((i) => /\balt="[^"]+"/.test(i)), `${label}: every image has alt text (${imgs(b).length} images)`);
  check(!/<a [^>]*target="_blank"(?![^>]*rel="[^"]*noopener)/.test(b), `${label}: every target=_blank link has rel=noopener`);
};

// ================= ENHANCED + Featured + Gold
let r = await get('/business/sample-valley-plumbing'); let b = r.body; let t = textOf(b);
check(r.status === 200 && h1(b) === 'Sample Valley Plumbing', 'Enhanced profile is 200 with the business name as h1');
check(/<title>Sample Valley Plumbing \| Plumbing in Thayne, WY \| Star Valley Local<\/title>/.test(b), 'title: name | category in community');
check(canonical(b)?.endsWith('/business/sample-valley-plumbing') && robots(b) === null, 'indexable, canonical to itself');
check(/>Featured</.test(b) && /Gold Verified/.test(t), 'shows the Featured and Gold Verified badges');
check(['about', 'services', 'photos', 'deals', 'faqs', 'details', 'hours', 'verified'].every((id) => has(b, id)), 'Enhanced sections present: about, services, photos, deals, faqs, details, hours, verification');
check(/fictional business used to demonstrate an Enhanced profile/.test(t), 'the long description is shown');
check(/Water heaters/.test(t) && /Drain cleaning/.test(t) && /Leak detection/.test(t), 'services list');
check(/20% OFF/.test(t) && /Valid through/.test(t), 'a live deal with its badge and validity');
check(/Do you offer emergency service\?/.test(t) && /<details/.test(b), 'FAQs are native disclosure widgets');
check(/hello@sample-valley-plumbing\.example/.test(t) && /href="mailto:hello@sample-valley-plumbing\.example"/.test(b), 'the public email is shown (Enhanced only)');
check(/Facebook/.test(t) && /Instagram/.test(t), 'social links');
check(/Mon–Fri/.test(t) && /8:00 AM – 5:00 PM/.test(t) && /Sat &amp; Sun|Sat & Sun/.test(b.replace(/<[^>]+>/g, ' ')) && /Emergency service available 24\/7/.test(t), 'hours grouped Mon–Fri, weekend closed, with the hours note');
check(/Also serves/.test(t) && /Afton/.test(t), 'multi-community service area');
check(/Last verified/.test(t) && /Re-verification due/.test(t), 'verified: the re-verification date is shown');
check(/href="tel:\+13075550101"/.test(b) && />Call</.test(b) && />Website</.test(b) && />Directions</.test(b), 'Call, Website and Directions buttons');
check(/rel="sponsored noopener noreferrer"/.test(b), 'the Featured business\'s website link is rel="sponsored"');
check(imgs(b).length === 5 && imgs(b).some((i) => /demo-media|demo%2Fmedia/.test(i)), 'logo, cover and 3 gallery images are rendered (5 images)');
let j = ld(b); const biz = j.find((x) => x?.['@type'] === 'LocalBusiness');
check(biz && biz.telephone === '+13075550101' && biz.address?.addressRegion === 'WY' && biz.priceRange === undefined && Array.isArray(biz.openingHoursSpecification) && biz.sameAs?.length === 2, 'JSON-LD LocalBusiness: telephone, address, opening hours, sameAs');
check(biz?.image?.every((u) => u.startsWith(`http://${host}:${port}/`)) && biz.areaServed?.length === 11, 'JSON-LD: absolute image URLs; areaServed lists all 11 communities');
check(j.some((x) => x?.['@type'] === 'FAQPage') && j.find((x) => x?.['@type'] === 'BreadcrumbList')?.itemListElement.length === 5, 'JSON-LD: FAQPage and a 5-level BreadcrumbList');
check(!/aggregateRating|ratingValue|reviewCount|"review"|openNow/.test(JSON.stringify(j)), 'JSON-LD has no ratings, reviews or openNow');
rules(b, 'Enhanced profile');

// ================= FREE (Green, no listing)
r = await get('/business/sample-creekside-cafe'); b = r.body; t = textOf(b);
check(r.status === 200 && h1(b) === 'Sample Creekside Cafe' && /Verified/.test(t) && !/Gold Verified/.test(t), 'Free profile: Green "Verified" badge, not Gold');
check(!has(b, 'services') && !has(b, 'photos') && !has(b, 'deals') && !has(b, 'faqs'), 'Free has NO services, photos gallery, deals or FAQ sections');
check(!/NOT shown on its profile/.test(t) && /Breakfast, coffee and baked goods\./.test(t), 'Free shows the short description, never the stored long one');
check(!/hi@sample-creekside-cafe/.test(b), 'Free never shows the email');
check(imgs(b).length === 1, `Free shows exactly ONE photo of the 4 it has (got ${imgs(b).length})`);
check(has(b, 'hours') && /Tue–Sat/.test(t) && has(b, 'details') && has(b, 'verified'), 'Free keeps hours, details and the verification card');
check(/>Call</.test(b) && />Website</.test(b) && />Directions</.test(b), 'Free has Call, Website and Directions');
check(!/rel="sponsored/.test(b), 'a non-Featured business\'s website link is not marked sponsored');
j = ld(b); const fb = j.find((x) => x?.['@type'] === 'LocalBusiness');
check(fb && !('sameAs' in fb) && !('hasOfferCatalog' in fb) && !j.some((x) => x?.['@type'] === 'FAQPage') && !/NOT shown/.test(JSON.stringify(j)), 'Free structured data: no sameAs, services or FAQ, and no long description');
rules(b, 'Free profile');

// ================= UNCLAIMED + unverified
r = await get('/business/sample-smile-dental'); b = r.body; t = textOf(b);
check(r.status === 200 && /Is this your business\?/.test(t) && /href="\/list-your-business\?claim=sample-smile-dental"/.test(b), 'an unclaimed business invites its owner to claim it');
check(!/Re-verification|Last verified|Verified</.test(t.replace(/Is this your business\?/, '')), 'unverified: NO verification badge and NO re-verification date');
check(/Suggest an update/.test(t), 'every profile links to "Suggest an update"');

// ================= 404s
for (const [p, why] of [['/business/sample-prospect-welding', 'a prospect (not public)'], ['/business/no-such-business', 'unknown slug'], ['/business/Bad%20Slug', 'invalid slug'], ["/business/%27%3Bdrop", 'SQL-ish slug'], ['/business/sample-valley-plumbing/extra', 'extra segment'], ['/business', 'no slug']]) {
  r = await get(p); check(r.status === 404, `${p} is 404 (${why})`);
}

// ================= crawl every profile in the sitemap
r = await get('/sitemap.xml'); const origin = `http://${host}:${port}`;
const profiles = [...r.body.matchAll(/<loc>([^<]+\/business\/[^<]+)<\/loc>/g)].map((m) => m[1].slice(origin.length));
check(profiles.length === 26, `the sitemap lists all 26 public business profiles (got ${profiles.length})`);
let bad = [];
for (const p of profiles) {
  const rr = await get(p); const lds = ld(rr.body);
  const ok = rr.status === 200 && (rr.body.match(/<h1[ >]/g) ?? []).length === 1 && robots(rr.body) === null && canonical(rr.body)?.endsWith(p)
    && lds.length >= 2 && lds.every((x) => x) && lds.some((x) => x['@type'] === 'LocalBusiness') && !/aggregateRating|openNow/.test(JSON.stringify(lds))
    && !/\breviews?\b/i.test(textOf(rr.body)) && !/request a quote/i.test(textOf(rr.body));
  if (!ok) bad.push(p);
}
check(bad.length === 0, `CRAWL: all ${profiles.length} profiles return 200, one h1, indexable, self-canonical, valid LocalBusiness JSON-LD, no ratings/reviews/quote${bad.length ? ' (bad: ' + bad.slice(0, 3).join(', ') + ')' : ''}`);
r = await get('/sitemap.xml'); check(!/sample-prospect/.test(r.body), 'no prospect appears in the sitemap');

console.log(failed ? `\n${failed} FAILED` : '\nall profile smoke checks passed');
process.exit(failed ? 1 : 0);
