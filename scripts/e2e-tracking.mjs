// Event tracking, end to end: the beacon route (filters, privacy, failure handling), real-browser events from the public pages,
// and the staff "Listing performance" card. Supabase MOCK; no database. Needs `npm run fixtures` and a dev server:
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon SUPABASE_SERVICE_ROLE_KEY=service-secret npm run dev -- -p 3101
//   node scripts/e2e-tracking.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BIZ, cookieFor, freshActivity, freshDetail, startMock, state } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
let chromium;
for (const where of [undefined, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']) { try { ({ chromium } = require(where ? join(where, 'playwright') : 'playwright')); break; } catch { /* next */ } }
if (!chromium) { console.error('Playwright not found (install it globally, e.g. npm i -g playwright)'); process.exit(2); }
const exe = (() => { const b = '/opt/pw-browsers'; for (const d of existsSync(b) ? readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)) : []) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return undefined; })();

const port = process.argv[2] ?? '3101';
const host = process.argv[3] ?? 'star-valley.localhost';
const root = `http://${host}:${port}`;
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ID = '3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b';
const fx = JSON.parse(readFileSync('.fixtures/directory.json', 'utf8'));
const elec = fx.businesses.find((b) => b.slug === 'sample-aspen-electric');
const reset = () => { state.tracking.length = 0; state.failNext = null; };
const beacon = (body, headers = {}, raw = false) => fetch(`http://localhost:${port}/api/track`, { method: 'POST', headers: { host: `${host}:${port}`, 'user-agent': CHROME, 'content-type': 'text/plain', ...headers }, body: raw ? body : JSON.stringify(body) })
  .then((r) => ({ status: r.status, cache: r.headers.get('cache-control'), cookie: r.headers.get('set-cookie'), text: '' }));
const ev = (o = {}) => ({ events: [{ type: 'profile_view', business_id: ID, surface: 'profile' }], referrer: null, ...o });

const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
try {
  reset();
  // ---------- the beacon route ----------
  let r = await beacon(ev());
  check(r.status === 204 && r.cache === 'no-store' && !r.cookie, 'a normal beacon is 204, uncached, and sets no cookie');
  check(state.tracking.length === 1, 'and reaches the database function once');
  const a = state.tracking[0];
  check(a.p_events.length === 1 && a.p_events[0].business_id === ID && /^[0-9a-f]{32}$/.test(a.p_session) && a.p_user === null && a.p_referrer === null, 'with the cleaned events, a hashed session and no user');
  check(!JSON.stringify(a).includes('127.0.0.1') && !JSON.stringify(a).includes('Macintosh'), 'neither the IP address nor the user agent is passed on');
  reset();
  for (const [name, h] of [['a crawler', { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }], ['curl', { 'user-agent': 'curl/8.4.0 test' }], ['headless Chrome', { 'user-agent': CHROME.replace('Chrome/', 'HeadlessChrome/') }], ['no user agent', { 'user-agent': '' }],
    ['Do Not Track', { dnt: '1' }], ['Global Privacy Control', { 'sec-gpc': '1' }], ['another site\'s page', { origin: 'https://evil.example' }]]) {
    const x = await beacon(ev(), h); check(x.status === 204 && state.tracking.length === 0, `${name}: answered 204 and recorded nothing`);
  }
  for (const [name, b, raw] of [['malformed JSON', '{not json', true], ['an empty list', ev({ events: [] })], ['the wrong shape', { nope: 1 }], ['an oversized body', 'x'.repeat(20000), true], ['only unknown events', ev({ events: [{ type: 'bogus' }, { type: 'quote_request', business_id: ID }] })]]) {
    const x = await beacon(b, {}, raw); check(x.status === 204 && state.tracking.length === 0, `${name}: 204 and nothing recorded`);
  }
  await beacon(ev({ events: [{ type: 'quote_request', business_id: ID }, { type: 'phone_click', business_id: ID }, { type: 'profile_view', business_id: 'nope' }] }));
  check(state.tracking.length === 1 && state.tracking[0].p_events.length === 1 && state.tracking[0].p_events[0].type === 'phone_click', 'a browser cannot report quote requests, and bad events are dropped one by one');
  reset();
  await beacon(ev(), { 'x-forwarded-for': '10.0.0.1' }); await beacon(ev(), { 'x-forwarded-for': '10.0.0.1' }); await beacon(ev(), { 'x-forwarded-for': '10.0.0.2' }); await beacon(ev(), { 'user-agent': CHROME + ' Edg/126' }, false);
  const s = state.tracking.map((t) => t.p_session);
  check(s[0] === s[1] && s[0] !== s[2] && s[0] !== s[3], 'the visitor id is the same for the same network and browser, and differs otherwise');
  reset(); await beacon(ev({ referrer: 'WWW.Google.com' })); check(state.tracking[0].p_referrer === 'www.google.com', 'the referring host is passed on (host only)');
  reset(); await beacon(ev({ referrer: 'localhost' })); check(state.tracking[0].p_referrer === null, 'our own host is not a referrer');
  reset(); await beacon(ev({ referrer: 'evil.com/path?x=1' })); check(state.tracking[0].p_referrer === null, 'a referrer with a path or query is ignored');
  reset(); state.failNext = 'record_tracking';
  r = await beacon(ev()); check(r.status === 204, 'a database failure still answers 204: tracking never breaks a page');
  r = await fetch(`http://localhost:${port}/api/track`, { method: 'GET', headers: { host: `${host}:${port}` } }); check(r.status === 405, 'GET is not allowed');

  // ---------- signed-in staff are reported as such so the database can skip them ----------
  reset();
  await fetch(`http://localhost:${port}/api/track`, { method: 'POST', headers: { host: `${host}:${port}`, 'user-agent': CHROME, cookie: cookieFor('tok-sales'), 'content-type': 'text/plain' }, body: JSON.stringify(ev()) });
  check(state.tracking[0]?.p_user === 'u-sales', 'a signed-in visitor\'s id is passed along (the database skips staff and the business\'s owners)');

  // ---------- real browser events ----------
  reset();
  const newPage = async (extra = {}) => { const ctx = await browser.newContext({ userAgent: CHROME, viewport: { width: 1000, height: 900 }, ...extra }); return ctx.newPage(); };
  const waitFor = async (pred, ms = 6000) => { for (let t = 0; t < ms && !pred(); t += 100) await new Promise((x) => setTimeout(x, 100)); return pred(); };
  const events = () => state.tracking.flatMap((t) => t.p_events);
  let page = await newPage();
  await page.goto(`${root}/business/${elec.slug}`);
  check(await waitFor(() => events().some((e) => e.type === 'profile_view' && e.business_id === elec.id && e.surface === 'profile')), 'opening a profile records a profile view for that business');
  const [pop] = await Promise.all([page.waitForEvent('popup', { timeout: 4000 }).catch(() => null), page.getByRole('link', { name: /^Website/ }).first().click()]);
  if (pop) await pop.close();
  check(await waitFor(() => events().some((e) => e.type === 'website_click' && e.business_id === elec.id)), 'the Website link records a website click');
  const [pop2] = await Promise.all([page.waitForEvent('popup', { timeout: 4000 }).catch(() => null), page.getByRole('link', { name: /^Directions/ }).first().click()]);
  if (pop2) await pop2.close();
  check(await waitFor(() => events().some((e) => e.type === 'directions_click' && e.business_id === elec.id)), 'Directions records a directions click');
  await page.getByRole('link', { name: /^Call/ }).first().click({ trial: false }).catch(() => {});
  check(await waitFor(() => events().some((e) => e.type === 'phone_click' && e.business_id === elec.id)), 'tapping Call records a phone click');
  const n = state.tracking.length; await page.reload(); await new Promise((x) => setTimeout(x, 800));
  check(state.tracking.length === n, 'reloading the same page in the same tab sends no second profile view (the database also de-duplicates)');

  reset(); page = await newPage();
  await page.goto(`${root}/businesses?q=electric`);
  check(await waitFor(() => events().some((e) => e.type === 'search_appearance' && e.query === 'electric' && e.surface === 'search')), 'a search records which businesses were shown, with the query');
  const shown = await page.locator('main li h3 a').count();
  check(events().filter((e) => e.type === 'search_appearance').length === Math.min(shown, 24), 'one appearance per business shown (at most 24)');
  reset(); await page.goto(`${root}/categories/${fx.categories.find((c) => c.slug === 'home-property').slug}`);
  check(await waitFor(() => events().some((e) => e.surface === 'category' && e.category_id)), 'a category page records appearances with the category');
  reset(); await page.goto(`${root}/communities/afton`);
  check(await waitFor(() => events().some((e) => e.surface === 'community' && e.community_id)), 'a community page records appearances with the community');
  reset(); await page.goto(`${root}/deals`);
  check(await waitFor(() => events().filter((e) => e.type === 'deal_view' && e.surface === 'deals' && e.deal_id && e.business_id).length === fx.deals.length), 'the deals page records a deal view for each deal shown');
  reset(); await page.goto(`${root}/`);
  await new Promise((x) => setTimeout(x, 1000));
  check(state.tracking.every((t) => t.p_events.every((e) => e.surface === 'home')), 'the home page records only featured appearances (if any are shown)');
  const nonTracked = state.tracking.length; reset();
  await page.goto(`${root}/pricing`); await new Promise((x) => setTimeout(x, 800));
  check(state.tracking.length === 0 && nonTracked >= 0, 'pages with no business listings record nothing');

  // ---------- privacy: Do Not Track from the browser ----------
  reset(); const dnt = await newPage({ extraHTTPHeaders: { DNT: '1' } });
  await dnt.goto(`${root}/business/${elec.slug}`); await new Promise((x) => setTimeout(x, 1200));
  check(state.tracking.length === 0, 'with Do Not Track on, nothing is recorded');
  const bot = await newPage({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' });
  await bot.goto(`${root}/business/${elec.slug}`); await new Promise((x) => setTimeout(x, 1200));
  check(state.tracking.length === 0, 'a crawler that runs scripts is still not counted');
  check((await page.context().cookies()).filter((c) => /track|svl/i.test(c.name)).length === 0, 'tracking sets no cookies');

  // ---------- staff "Listing performance" card ----------
  const adminPage = async (tok) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 1000 } }); const [name, value] = cookieFor(tok).split('='); await ctx.addCookies([{ name, value, url: root }]); return ctx.newPage(); };
  state.detail = freshDetail(); state.activity = freshActivity();
  page = await adminPage('tok-sales'); await page.goto(`${root}/admin/businesses/${BIZ}`);
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Listing performance (30 days)' }) });
  await card.waitFor();
  const t = (await card.innerText()).replace(/\s+/g, ' ');
  check(/In the last 30 days this listing got 212 views, 14 call taps and 31 website clicks\./.test(t), 'the card gives the sentence for the pitch');
  check(/Profile views 212\s*\+32 vs the 30 days before/.test(t) && /Calls \(taps on Call\) 14\s*no change/.test(t) && /Website clicks 31\s*\+19/.test(t) && /Quote requests 2\s*new/.test(t), 'each row shows its count and the change against the period before');
  check(/Different visitors 143/.test(t) && /plumber in thayne.*40/.test(t), 'visitors and the searches that showed it are listed');
  check((await card.locator('b').count()) === 0 && /<b>water heater<\/b>/.test(t), 'a search query containing markup is shown as text');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal overflow at 390px');
  state.activity = { ...freshActivity(), current: {}, previous: {}, visitors: 0, top_searches: [], first_event_at: null };
  await page.reload(); check(/Nothing recorded yet/.test(await page.locator('main').innerText()), 'a business with no activity says so');
  state.activity = null; await page.reload();
  check(/Not available right now/.test(await page.locator('main').innerText()) && (await page.getByRole('heading', { level: 1 }).count()) === 1, 'if the numbers cannot be loaded only the card is affected, not the page');
} catch (e) { console.log('FAIL - unexpected error:', e.message.split('\n').slice(0, 6).join(' | ')); failed++; }
await browser.close(); mock.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
