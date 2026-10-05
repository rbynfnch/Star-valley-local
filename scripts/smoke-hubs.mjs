// End-to-end check of the SEO hub pages, sitemap and robots.txt against a running dev server in fixtures mode:
//   supabase/tests/seed_check.sh && npm run fixtures && npm run dev      then: node scripts/smoke-hubs.mjs [port] [host]
import http from 'node:http';

const port = Number(process.argv[2] ?? 3101);
const host = process.argv[3] ?? 'star-valley.localhost';
const PAGING = process.argv.includes('--paging');   // run against a server started with SVL_PAGE_SIZE=5: only the pagination checks
const get = (path) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path, headers: { host: `${host}:${port}` } }, (res) => {
    let body = ''; res.on('data', (d) => (body += d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject);
});
let failed = 0;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} - ${msg}`); if (!cond) failed++; };
const textOf = (b) => b.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&(?:#x27|#39|apos);/g, "'").replace(/\s+/g, ' ');
const names = (b) => [...b.matchAll(/<h3[^>]*><a [^>]*href="\/business\/[^"]*"[^>]*>([^<]+)<\/a><\/h3>/g)].map((m) => m[1]);
const robots = (b) => /<meta name="robots" content="([^"]*)"/.exec(b)?.[1] ?? null;
const canonical = (b) => /<link rel="canonical" href="([^"]*)"/.exec(b)?.[1] ?? null;
const h1 = (b) => textOf(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(b)?.[1] ?? '');
const ld = (b) => [...b.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => { try { return [].concat(JSON.parse(m[1])); } catch { return [null]; } });
const rules = (b, label) => {
  const t = textOf(b);
  check(!/\breviews?\b/i.test(t) && !/\bratings?\b|★|\b\d(\.\d)?\s*(\/\s*5|stars?)\b/i.test(t), `${label}: no reviews or ratings`);
  check(!/\b\d+(\.\d+)?\s?mi\b|miles? away|open now|closed now|\bpremium\b/i.test(t), `${label}: no distance, "open now" or Premium`);
  const lv = [...b.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
  check((b.match(/<h1[ >]/g) ?? []).length === 1 && lv.every((l, i) => i === 0 || l - lv[i - 1] <= 1), `${label}: one h1, heading levels never skip (${lv.join(',')})`);
};

// ---- pagination (needs a server started with SVL_PAGE_SIZE=5 so that a 12-listing hub has 3 pages)
const paging = async () => {
  let r = await get('/communities/afton'); let b = r.body;
  check(names(b.slice(b.indexOf('all-heading'))).length === 5 && /showing 1–5/.test(textOf(b)), 'page 1 shows 5 of 12');
  check(canonical(b)?.endsWith('/communities/afton') && robots(b) === null, 'page 1: canonical is the clean hub URL, indexable');
  check(/Featured businesses/.test(textOf(b)), 'page 1 shows the Featured strip');
  r = await get('/communities/afton?page=2'); b = r.body;
  check(r.status === 200 && names(b.slice(b.indexOf('all-heading'))).length === 5 && /showing 6–10/.test(textOf(b)), 'page 2 shows listings 6 to 10');
  check(canonical(b)?.endsWith('/communities/afton?page=2') && robots(b) === null, 'page 2: indexable with a self-canonical');
  check(/rel="prev"/.test(b) && /rel="next"/.test(b), 'page 2 has previous and next links');
  check(!/Featured listings are paid placements/.test(textOf(b)), 'page 2 does NOT repeat the Featured strip (advertising shows once)');
  const il = ld(b).find((x) => x?.['@type'] === 'ItemList'); check(il?.itemListElement?.[0]?.position === 6, 'JSON-LD ItemList positions continue across pages (starts at 6)');
  r = await get('/communities/afton?page=3'); b = r.body; check(names(b.slice(b.indexOf('all-heading'))).length === 2 && !/rel="next"/.test(b), 'page 3 shows the last 2 and has no next link');
  r = await get('/communities/afton?page=99'); check([307, 308].includes(r.status) && /page=3$/.test(r.headers.location ?? ''), `page=99 redirects to the last real page (${r.headers.location})`);
  r = await get('/categories/home-property?page=2'); check(r.status === 200 && names(r.body.slice(r.body.indexOf('all-heading'))).length === 1, 'a 6-business category has a second page with 1 listing at size 5');
  r = await get('/communities/afton?page=abc'); check(r.status === 200 && canonical(r.body)?.endsWith('/communities/afton'), 'a garbage page number is page 1');
};
if (PAGING) { await paging(); console.log(failed ? `\n${failed} FAILED` : '\nall hub pagination checks passed'); process.exit(failed ? 1 : 0); }

// ---- category hub
let r = await get('/categories/plumbing'); let t = textOf(r.body);
check(r.status === 200, '/categories/plumbing is 200');
check(h1(r.body) === 'Plumbers in Star Valley', `h1 uses the plural name (got "${h1(r.body)}")`);
check(/<title>Plumbers in Star Valley \| Star Valley Local<\/title>/.test(r.body), 'title is "Plumbers in Star Valley | Star Valley Local"');
check(canonical(r.body)?.endsWith('/categories/plumbing') && /noindex/.test(robots(r.body) ?? ''), '/categories/plumbing has ONE listing: reachable, but noindex (thin page)');
check(/Featured Plumbers/.test(t), 'a Featured strip is present');
check(/Sample Valley Plumbing/.test(r.body.slice(r.body.indexOf('featured-heading'), r.body.indexOf('all-heading'))), 'the paid plumbing placement is in the Featured strip');
check(/Featured listings are paid placements/.test(t), 'the strip discloses that it is advertising');
const stripHtml = r.body.slice(r.body.indexOf('featured-heading'), r.body.indexOf('all-heading'));
check(/rel="sponsored noopener noreferrer"/.test(stripHtml), 'Featured website links are rel="sponsored"');
let j = ld(r.body);
check(j.some((x) => x?.['@type'] === 'BreadcrumbList') && j.some((x) => x?.['@type'] === 'ItemList'), 'JSON-LD: BreadcrumbList and ItemList parse');
check(/Breadcrumb/.test(r.body) && /aria-current="page"/.test(r.body), 'breadcrumb nav with the current page marked');
rules(r.body, 'category hub');

// ---- top-level category includes subcategories, links to subcategories and communities that exist
r = await get('/categories/home-property'); t = textOf(r.body);
check(names(r.body.slice(r.body.indexOf('all-heading'))).length === 6 && /Sample Valley Plumbing/.test(r.body), 'top-level category lists all 6 businesses of its subcategories');
check(robots(r.body) === null && canonical(r.body)?.endsWith('/categories/home-property'), 'a hub with 6 listings is indexable');
check(/href="\/categories\/plumbing"/.test(r.body) && /href="\/categories\/roofing"/.test(r.body), 'links to its subcategories');
check(/href="\/categories\/home-property\/afton"/.test(r.body), 'links to community combinations that exist');

// ---- community hub
r = await get('/communities/afton'); t = textOf(r.body);
check(r.status === 200 && h1(r.body) === 'Local businesses in Afton, WY', `community h1 (got "${h1(r.body)}")`);
check(/Sample Valley Plumbing/.test(r.body.slice(r.body.indexOf('all-heading'))), 'a Thayne plumber that SERVES Afton is listed on the Afton page');
check(/Sample High Country Roofing/.test(r.body.slice(r.body.indexOf('featured-heading'), r.body.indexOf('all-heading'))), 'the community-slot placement is in the Afton Featured strip');
check(/href="\/categories\/plumbers/.test(r.body) === false && /href="\/categories\/home-property\/afton"/.test(r.body), 'links to category x community pages for this community');
rules(r.body, 'community hub');
check(Number(/(\d+) listings/.exec(t)?.[1]) === 12, 'Afton has 12 listings (one page at the default size)');

// ---- combination hub
r = await get('/categories/plumbing/afton'); t = textOf(r.body);
check(r.status === 200 && h1(r.body) === 'Plumbers in Afton, WY', `combination h1 (got "${h1(r.body)}")`);
check(/Sample Valley Plumbing/.test(r.body.slice(r.body.indexOf('featured-heading'), r.body.indexOf('all-heading'))), 'category-slot Featured plumber appears (it serves Afton)');
check(/noindex/.test(robots(r.body) ?? ''), 'plumbers in Afton has ONE listing (a valley-wide business): reachable, noindex, so ten near-identical pages are not indexed');
check(ld(r.body).length > 0, 'JSON-LD present'); check(ld(r.body).find((x) => x?.['@type'] === 'BreadcrumbList')?.itemListElement.length === 5, 'breadcrumb has 5 levels: Home, Businesses, Home & Property, Plumbers, Afton');
rules(r.body, 'combination hub');
r = await get('/categories/dentists/afton'); check(r.status === 200 && /Sample Smile Dental/.test(r.body), 'an existing combination (dentists in Afton) works');
r = await get('/categories/home-property/afton'); check(r.status === 200 && h1(r.body) === 'Home & Property in Afton, WY' && robots(r.body) === null, 'a combination with 4 listings is indexable');
r = await get('/categories/dentists/etna'); check(r.status === 404, 'a combination with NO businesses (dentists in Etna) is a 404, not a thin page');

// ---- 404s and bad input
for (const [p, why] of [['/categories/nope', 'unknown category'], ['/communities/nope', 'unknown community'], ['/categories/Bad%20Slug', 'invalid slug'], ['/categories/plumbing/nope', 'unknown community in a combination'],
  ['/categories/plumbing/afton/extra', 'an extra path segment'], ['/communities/afton/extra', 'an extra path segment'], ["/categories/%27%3Bdrop", 'SQL-ish slug']]) {
  r = await get(p); check(r.status === 404, `${p} is 404 (${why})`);
}

// ---- an empty (but valid) category is allowed, noindex, with a helpful message and left out of the sitemap
r = await get('/categories/marketing'); t = textOf(r.body);
check(r.status === 200 && /noindex/.test(robots(r.body) ?? '') && /No listings here yet/.test(t), 'an empty category renders as noindex with a "no listings yet" message');

// ---- sitemap and robots
r = await get('/sitemap.xml');
check(r.status === 200 && /xml/.test(r.headers['content-type'] ?? '') && r.body.startsWith('<?xml'), 'sitemap.xml is served as XML');
const locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const origin = `http://${host}:${port}`;
check(locs.length >= 10 && locs.every((l) => l.startsWith(origin + '/')), `${locs.length} absolute URLs on this tenant's origin`);
check(locs.includes(origin + '/categories/home-property/afton') && locs.includes(origin + '/communities/afton') && locs.includes(origin + '/categories/home-property'), 'it lists the hubs with enough listings');
check(!locs.some((l) => /marketing|dentists\/etna|(categories|communities)\/[^\s]*plumbing|\?/.test(l)), 'and none of the empty, thin (1 listing) or filtered ones');
let bad = [];
for (const l of locs) { const rr = await get(l.slice(origin.length)); if (rr.status !== 200 || /noindex/.test(robots(rr.body) ?? '')) bad.push(`${l} -> ${rr.status}`); }
check(bad.length === 0, `CRAWL: every one of the ${locs.length} sitemap URLs returns 200 and is indexable${bad.length ? ' (bad: ' + bad.slice(0, 3).join(', ') + ')' : ''}`);
r = await get('/robots.txt'); check(r.status === 200 && r.body.includes(`Sitemap: ${origin}/sitemap.xml`) && !/Disallow/i.test(r.body), 'robots.txt allows crawling and names this tenant\'s sitemap');

// ---- the home page links to hubs that exist
r = await get('/'); const homeLinks = [...new Set([...r.body.matchAll(/href="(\/categories\/[a-z0-9-]+)"/g)].map((m) => m[1]))];
let dead = []; for (const l of homeLinks) { const rr = await get(l); if (rr.status !== 200) dead.push(l); }
check(homeLinks.length === 7 && dead.length === 0, `all ${homeLinks.length} category tiles on the home page link to real pages`);

console.log(failed ? `\n${failed} FAILED` : '\nall hub smoke checks passed');
process.exit(failed ? 1 : 0);
