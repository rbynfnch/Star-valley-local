// End-to-end check of the rendered home page against the project's hard rules. Needs a running dev server:
//   SVL_DATA_SOURCE=fixtures npm run dev   (after `npm run fixtures`), then: node scripts/smoke-home.mjs [port] [host]
import http from 'node:http';

const port = Number(process.argv[2] ?? 3101);
const host = process.argv[3] ?? 'star-valley.localhost';
const get = (path) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path, headers: { host: `${host}:${port}` } }, (res) => {
    let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b }));
  }).on('error', reject);
});

let failed = 0;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} - ${msg}`); if (!cond) failed++; };
const { status, body } = await get('/');
const text = body.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

check(status === 200, `GET / is 200 (got ${status})`);
check(/<html[^>]*lang="en"/.test(body), 'html has lang="en"');
check((body.match(/<h1[ >]/g) ?? []).length === 1, 'exactly one <h1>');
check(/<main id="main"/.test(body), 'main landmark with id=main (skip link target)');
check(body.indexOf('Skip to content') > -1 && body.indexOf('Skip to content') < body.indexOf('<header'), 'skip link comes before the header');
check(/<nav[^>]*aria-label="Main"/.test(body) && /<header/.test(body) && /<footer/.test(body), 'header, footer and a labelled main nav exist');

// heading order never skips a level
const levels = [...body.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
check(levels.every((l, i) => i === 0 || l - levels[i - 1] <= 1), `heading levels never skip (${levels.join(',')})`);

// CLAUDE.md hard rules: no reviews/ratings, no distance, no "open now", no Premium tier
check(!/\breviews?\b/i.test(text), 'no "Reviews"');
check(!/\bratings?\b|★|\b\d(\.\d)?\s*(\/\s*5|stars?)\b|\bstar ratings?\b/i.test(text), 'no ratings or stars ("Star Valley" is the brand, not a rating)');
check(!/\b\d+(\.\d+)?\s?mi\b|\bmiles? away\b/i.test(text), 'no distance');
check(!/open now|closed now|opens at|closes at/i.test(text), 'no "open now"');
check(!/\bpremium\b/i.test(text), 'no Premium tier');

// content from the seed
const cats = [...body.matchAll(/href="\/categories\/([a-z0-9-]+)"/g)].map((m) => m[1]);
check(new Set(cats).size === 7, `7 top-level category tiles (got ${new Set(cats).size})`);
check((body.match(/>Featured</g) ?? []).length >= 1, 'featured businesses carry a "Featured" badge');
check(/Gold Verified/.test(text) && /Verified/.test(text), 'verification badges use the Green/Gold ladder labels');
const sponsored = [...body.matchAll(/<a [^>]*href="https?:[^"]*\.example\/?"[^>]*>/g)].map((m) => m[0]);
check(sponsored.length > 0 && sponsored.every((a) => /rel="[^"]*sponsored[^"]*"/.test(a) && /noopener/.test(a)), 'featured website links are rel="sponsored noopener"');
const times = [...body.matchAll(/<time dateTime="([^"]+)"/g)].map((m) => Date.parse(m[1]));
check(times.length >= 3 && times.every((t) => t > Date.now() - 86_400_000), `upcoming events are in the future (${times.length} shown)`);
check(times.every((t, i) => i === 0 || t >= times[i - 1]), 'events are in date order');

// forms: every field has a label
const ids = new Set([...body.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]));
const fields = [...body.matchAll(/<(input|select)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/type="(hidden|radio)"/.test(t));
check(fields.length >= 2 && fields.every((f) => { const id = /id="([^"]+)"/.exec(f)?.[1]; return id && ids.has(id); }), `all ${fields.length} search fields have a <label for>`);
const radios = (body.match(/type="radio"/g) ?? []).length;
check(radios === 4 && /<legend[^>]*>/.test(body), 'search scope is a labelled radio group (fieldset + legend)');
check(/role="search"/.test(body), 'search form has role=search');

// structured data
const ld = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } });
check(ld.length === 1 && Array.isArray(ld[0]), 'one JSON-LD block that parses');
const site = ld[0]?.find((x) => x['@type'] === 'WebSite');
check(site?.potentialAction?.target?.urlTemplate === `http://${host}:${port}/businesses?q={search_term_string}`, 'WebSite JSON-LD has a SearchAction on this tenant\'s origin');
check(!body.includes('<script>alert'), 'no stray inline scripts');

console.log(failed ? `\n${failed} FAILED` : '\nall smoke checks passed');
process.exit(failed ? 1 : 0);
