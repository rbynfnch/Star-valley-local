// Public content pages (events, deals, articles, things to do) against the seeded fixtures. Needs `npm run fixtures` and a dev server in fixtures mode:
//   SVL_DATA_SOURCE=fixtures npm run dev -- -p 3101 ;  node scripts/smoke-content.mjs [port] [host]
const port = process.argv[2] ?? '3101', host = process.argv[3] ?? 'star-valley.localhost';
const base = `http://localhost:${port}`;
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
const get = async (path) => { const r = await fetch(base + path, { headers: { host: `${host}:${port}` }, redirect: 'manual' }); return { status: r.status, body: await r.text(), type: r.headers.get('content-type') ?? '', disp: r.headers.get('content-disposition') ?? '' }; };
const text = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ld = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => { const j = JSON.parse(m[1]); return Array.isArray(j) ? j : [j]; });
const canonical = (h) => /<link rel="canonical" href="([^"]*)"/.exec(h)?.[1] ?? null;
const robots = (h) => /<meta name="robots" content="([^"]*)"/.exec(h)?.[1] ?? null;
const links = (h, re) => [...h.matchAll(re)].map((m) => m[1]);

// ---------- navigation ----------
let r = await get('/');
for (const href of [...new Set(links(r.body, /<a [^>]*href="(\/(?:events|deals|articles|things-to-do))"/g))]) { const x = await get(href); check(x.status === 200, `the header link ${href} works`); }

// ---------- events ----------
r = await get('/events');
const slugs = [...new Set(links(r.body, /href="\/events\/([a-z-]+)"/g))];
check(r.status === 200 && ['sample-farmers-market', 'sample-pumpkin-fest', 'sample-football-night', 'sample-craft-fair', 'sample-trivia-night'].every((s) => slugs.includes(s)), 'the events page lists every published event');
check(links(r.body, /href="\/events\/sample-farmers-market"/g).length >= 3, 'a weekly event appears once per date');
check(canonical(r.body)?.endsWith('/events') && !/noindex/.test(robots(r.body) ?? ''), 'the plain list is indexable with its own canonical');
r = await get('/events?when=weekend&community=afton'); check(/noindex/.test(robots(r.body) ?? '') && canonical(r.body)?.endsWith('/events'), 'filtered lists are noindex and canonical to /events');
r = await get('/events?q=pumpkin'); check(links(r.body, /href="\/events\/([a-z-]+)"/g).every((s) => s === 'sample-pumpkin-fest') && /1 event/.test(text(r.body)), 'search narrows the list');
r = await get('/events?q=zzzzzz'); check(/No events found/.test(text(r.body)) && /Nothing matches/.test(text(r.body)), 'no match says so');
r = await get('/events?when=%3Cscript%3E&page=-5&community=%27;drop'); check(r.status === 200 && !/<script>alert/.test(r.body), 'junk parameters are ignored');
r = await get('/events/sample-pumpkin-fest');
let j = ld(r.body);
check(r.status === 200 && j.some((x) => x['@type'] === 'Event' && !Number.isNaN(Date.parse(x.startDate)) && x.eventStatus === 'https://schema.org/EventScheduled') && j.some((x) => x['@type'] === 'BreadcrumbList'), 'an event page has Event and Breadcrumb markup with a real date');
check(canonical(r.body)?.endsWith('/events/sample-pumpkin-fest') && /Add to calendar/.test(text(r.body)), 'it has a canonical URL and an Add to calendar link');
r = await get('/events/sample-farmers-market'); check(/Upcoming dates/.test(text(r.body)) && /Every Saturday/.test(text(r.body)), 'a recurring event shows its upcoming dates and its rule in words');
r = await get('/events/sample-pumpkin-fest/calendar.ics');
check(r.status === 200 && /text\/calendar/.test(r.type) && /attachment/.test(r.disp) && /^BEGIN:VCALENDAR\r\n/.test(r.body) && /SUMMARY:Sample Pumpkin Festival\r\n/.test(r.body) && /\r\nEND:VCALENDAR\r\n$/.test(r.body), 'the calendar file is a valid download');
for (const p of ['/events/nope', '/events/Bad%20Slug', '/events/nope/calendar.ics', '/events/x;y']) { r = await get(p); check(r.status === 404, `${p} is a 404`); }

// ---------- deals ----------
r = await get('/deals');
const dealTitles = links(r.body, /<h3 class="font-heading text-xl font-bold[^>]*>([^<]*)</g);
check(r.status === 200 && dealTitles.length === 3, 'the deals page lists the live deals');
check(dealTitles[0] === 'Buy 1 get 1 on select items' && dealTitles[1] === '20% off water heater tune-up' && dealTitles[2] === '$10 off gear rental', 'ordered by the soonest end');
check(/BUY 1 GET 1/.test(r.body) && /20% OFF/.test(r.body) && /\$10 OFF/.test(r.body) && /Valid through/.test(text(r.body)), 'badges and valid-through dates are shown');
check(links(r.body, /href="(\/business\/[a-z-]+#deals)"/g).length === 3, 'each deal links to its business');
r = await get('/deals?category=nothing'); check(/No deals match/.test(text(r.body)) && /noindex/.test(robots(r.body) ?? ''), 'an unknown category shows an empty state and is noindex');

// ---------- articles ----------
r = await get('/articles');
const arts = [...new Set(links(r.body, /href="\/articles\/([a-z0-9-]+)"/g))];
check(r.status === 200 && arts.includes('ten-things-to-do-this-weekend') && arts.includes('fall-hiking-guide') && arts.includes('sample-business-spotlight'), 'the articles page lists the public articles');
check(!arts.includes('sample-owner-marketing-tips') && !/5 Marketing Tips/.test(r.body), 'an article meant for business owners is not listed');
check(/Featured article/.test(text(r.body)), 'the featured article is shown on the first page');
r = await get('/articles?category=things-to-do'); check(links(r.body, /href="\/articles\/([a-z0-9-]+)"/g).every((s) => s === 'ten-things-to-do-this-weekend') && /noindex/.test(robots(r.body) ?? ''), 'a category filter narrows the list and is noindex');
r = await get('/articles?q=hiking'); check(links(r.body, /href="\/articles\/([a-z0-9-]+)"/g).includes('fall-hiking-guide') && !links(r.body, /href="\/articles\/([a-z0-9-]+)"/g).includes('sample-business-spotlight'), 'search finds the hiking guide only (real full-text search)');
r = await get('/articles?q=zzzzzzzz'); check(/No articles found/.test(text(r.body)), 'no match says so');
r = await get('/articles?q=%27%29%3B+drop+table+articles%3B--'); check(r.status === 200, 'odd search text is harmless');
r = await get('/articles/ten-things-to-do-this-weekend'); j = ld(r.body);
check(r.status === 200 && j.some((x) => x['@type'] === 'Article' && x.headline && x.datePublished && x.publisher) && canonical(r.body)?.endsWith('/articles/ten-things-to-do-this-weekend'), 'an article has Article markup and a canonical URL');
check(/<ol[^>]*>[\s\S]*Hike the Salt River Range[\s\S]*Visit the Farmers Market/.test(r.body) && /href="\/business\/sample-main-street-gifts"/.test(r.body), 'guide items are numbered and link to their businesses');
for (const p of ['/articles/nope', '/articles/sample-owner-marketing-tips', '/articles/Bad%20Slug']) { r = await get(p); check(r.status === 404, `${p} is a 404`); }

// ---------- things to do ----------
r = await get('/things-to-do');
check(r.status === 200 && /This weekend/.test(text(r.body)) && /Guides and ideas/.test(text(r.body)) && links(r.body, /href="\/articles\/([a-z0-9-]+)"/g).includes('ten-things-to-do-this-weekend'), 'Things to Do shows the weekend, and the weekend guide');

// ---------- sitemap ----------
r = await get('/sitemap.xml'); const locs = links(r.body, /<loc>([^<]*)<\/loc>/g);
check(['/events', '/deals', '/articles', '/things-to-do', '/events/sample-pumpkin-fest', '/articles/fall-hiking-guide'].every((p) => locs.some((l) => l.endsWith(p))) && !locs.some((l) => l.includes('owner-marketing')), 'the sitemap lists the new pages and none that are hidden');
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
