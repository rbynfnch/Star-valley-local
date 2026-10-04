// End-to-end check of /businesses against the project's hard rules. Needs a running dev server in fixtures mode:
//   supabase/tests/seed_check.sh && npm run fixtures && npm run dev     then: node scripts/smoke-directory.mjs [port] [host]
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
const names = (b) => [...b.matchAll(/<h3[^>]*><a [^>]*href="\/business\/[^"]*"[^>]*>([^<]+)<\/a><\/h3>/g)].map((m) => m[1]);
const found = (b) => Number(/([\d,]+) business(?:es)? found/.exec(textOf(b))?.[1].replace(/,/g, '') ?? (/No businesses found/.test(textOf(b)) ? 0 : NaN));
const robots = (b) => /<meta name="robots" content="([^"]*)"/.exec(b)?.[1] ?? null;
const canonical = (b) => /<link rel="canonical" href="([^"]*)"/.exec(b)?.[1] ?? null;

// ---- the bare directory
let r = await get('/businesses'); let t = textOf(r.body);
check(r.status === 200, 'GET /businesses is 200');
check(found(r.body) === 26, `26 businesses found (got ${found(r.body)})`);
check(names(r.body).length === 12, `12 cards on page 1 (got ${names(r.body).length})`);
check((r.body.match(/<h1[ >]/g) ?? []).length === 1 && /Business Directory/.test(t), 'one h1: Business Directory');
const levels = [...r.body.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
check(levels.every((l, i) => i === 0 || l - levels[i - 1] <= 1), `heading levels never skip (${levels.join(',')})`);
check(robots(r.body) === null && /\/businesses$/.test(canonical(r.body) ?? ''), 'the bare directory is indexable and canonical to itself');
check(!/\breviews?\b/i.test(t) && !/\bratings?\b|★|\b\d(\.\d)?\s*(\/\s*5|stars?)\b/i.test(t), 'no reviews or ratings');
check(!/\b\d+(\.\d+)?\s?mi\b|miles? away/i.test(t) && !/open now|closed now/i.test(t) && !/\bpremium\b/i.test(t), 'no distance, no "open now", no Premium');
check(/<nav aria-label="Pagination"/.test(r.body) && /aria-current="page"/.test(r.body) && /href="\/businesses\?page=2"/.test(r.body), 'pagination with a current page and a link to page 2');
check((r.body.match(/<fieldset/g) ?? []).length === 4 && (r.body.match(/<legend/g) ?? []).length === 4, 'four labelled filter groups (fieldset + legend)');
const inputs = (r.body.match(/<input\b/g) ?? []).length; const labels = (r.body.match(/<label\b/g) ?? []).length;
check(labels >= inputs - 0, `every input has a label (${labels} labels, ${inputs} inputs)`);
const formTag = /<form[^>]*id="directory-form"[^>]*>/.exec(r.body)?.[0] ?? '';
check(/action="\/businesses"/.test(formTag) && /method="get"/.test(formTag) && /form="directory-form"/.test(r.body), 'a plain GET form (works without JavaScript)');
check(/<select[^>]*name="sort"/.test(r.body) && /Most relevant/.test(t) && /Name \(A to Z\)/.test(t), 'sort control');
check(/role="status"/.test(r.body), 'result count is a polite live region');

// ---- search ranking
r = await get('/businesses?q=plumbing'); 
check(names(r.body)[0] === 'Sample Valley Plumbing', `q=plumbing ranks the plumber first (${names(r.body)[0]})`);
check(/noindex/.test(robots(r.body) ?? '') && /\/businesses$/.test(canonical(r.body) ?? ''), 'a search URL is noindex and canonicalised to /businesses');
check(/Featured/.test(r.body) && /Gold Verified/.test(r.body), 'the Featured, Gold Verified plumber carries its badges');
r = await get('/businesses?q=plumbng'); check(names(r.body).includes('Sample Valley Plumbing'), 'a typo still finds it');

// ---- filters
r = await get('/businesses?community=afton'); const afton = names(r.body);
check(afton.includes('Sample Valley Plumbing') && afton.includes('Sample Smile Dental'), 'community=afton includes a Thayne plumber that serves Afton, and an Afton dentist');
r = await get('/businesses?community=thayne&verified=1&deals=1&quotes=1'); check(found(r.body) === 1 && names(r.body)[0] === 'Sample Valley Plumbing', 'filters combine: Thayne + verified + deals + quotes = exactly one');
check(/Active filters/.test(r.body) && /Thayne/.test(textOf(r.body)) && /Clear all/.test(r.body), 'active filters are shown with a clear-all link');
check(/href="\/businesses\?verified=1&amp;deals=1&amp;quotes=1"/.test(r.body), 'removing the Thayne chip keeps the other filters (canonical URL)');
r = await get('/businesses?featured=1'); check(found(r.body) === 3 && (r.body.match(/>Featured</g) ?? []).length === 3, 'featured only: the 3 with a live placement');
r = await get('/businesses?category=home-property'); check(names(r.body).includes('Sample Valley Plumbing') && !names(r.body).includes('Sample Smile Dental'), 'a top-level category includes its subcategories');

// ---- paging
r = await get('/businesses?page=2'); check(found(r.body) === 26 && names(r.body).length === 12, 'page 2 shows 12 of 26');
check(robots(r.body) === null && /page=2/.test(canonical(r.body) ?? ''), 'plain pagination stays indexable with a self-canonical');
check(/rel="prev"/.test(r.body) && /rel="next"/.test(r.body), 'previous and next links on a middle page');
r = await get('/businesses?page=3'); check(names(r.body).length === 2, 'page 3 shows the last 2');
r = await get('/businesses?page=99'); check([307, 308].includes(r.status) && /page=3$/.test(r.headers.location ?? ''), `page=99 redirects to the last real page (${r.status} ${r.headers.location})`);
r = await get('/businesses?q=zzzzqqqq&page=5'); check([307, 308].includes(r.status) && !/page=/.test(r.headers.location ?? ''), 'a page past an EMPTY result redirects to page 1');

// ---- empty and hostile input
r = await get('/businesses?q=zzzzqqqq'); t = textOf(r.body);
check(r.status === 200 && found(r.body) === 0 && /couldn.t find a match/.test(t) && /Suggest a business/.test(t), 'no results: a helpful empty state, still 200');
r = await get('/businesses?q=' + encodeURIComponent('<script>alert(1)</script><img src=x onerror=alert(1)>'));
check(r.status === 200 && !/<script>alert\(1\)/.test(r.body) && !/<img src=x onerror/.test(r.body), 'a script in the query is escaped, never rendered as HTML');
r = await get('/businesses?q=' + encodeURIComponent("'; drop table businesses;--")); check(r.status === 200, 'SQL-injection text is just text (200)');
r = await get('/businesses?q=' + encodeURIComponent('a & | ! ( <-> :* \\ "x')); check(r.status === 200, 'tsquery operators in the query never error');
r = await get('/businesses?q=' + 'x'.repeat(5000)); check(r.status === 200, 'a 5,000-character query does not error');
r = await get('/businesses?price=9&community=Bad%20Slug&category=%27%3Bx&page=abc&sort=DROP&verified=maybe'); check(r.status === 200 && found(r.body) === 26, 'garbage parameters are ignored: all 26 shown');
r = await get('/businesses?__proto__[q]=x&constructor=y'); check(r.status === 200, 'prototype-pollution style parameters are harmless');
r = await get('/businesses?community=afton&community=afton&community=thayne'); check(r.status === 200, 'duplicate parameters are fine');

console.log(failed ? `\n${failed} FAILED` : '\nall directory smoke checks passed');
process.exit(failed ? 1 : 0);
