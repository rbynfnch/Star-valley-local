// The admin placements manager and the plan/placement forms on a business, in a REAL browser against the Supabase MOCK.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npm run dev -- -p 3101
//   node scripts/e2e-placements.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BIZ, IDS, cookieFor, freshDetail, freshOverview, startMock, state } from './mock-supabase.mjs';

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
const calls = (n) => state.rpc.filter((c) => c.name === n);
const CAT = '4f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b';

const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const as = async (tok) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 1100 } }); const [name, value] = cookieFor(tok).split('='); await ctx.addCookies([{ name, value, url: root }]); return ctx.newPage(); };
const alert = (page, re) => page.getByRole('alert').filter({ hasText: re }).waitFor();
const status = (page, re) => page.getByRole('status').filter({ hasText: re }).waitFor();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).then((n) => n <= 0);
try {
  state.overview = freshOverview(); state.detail = freshDetail(); state.detail.business.status = 'unclaimed';
  state.detail.listing = null; state.detail.placements = [{ id: IDS.live, slot_type: 'category', scope: 'Plumbing', status: 'active', source: 'paid', start_at: '2026-09-01T15:00:00Z', end_at: '2027-03-01T15:00:00Z' }];

  // ---------- access ----------
  let page = await as('tok-editor'); await page.goto(`${root}/admin/placements`);
  check(page.url().endsWith('/admin'), 'editor: the placements page sends you back to the dashboard');
  page = await as('tok-sales'); await page.goto(`${root}/admin/placements`);
  await page.getByRole('heading', { level: 1, name: 'Placements' }).waitFor();
  check(/Only admins can change placements/.test(await page.locator('main').innerText()), 'sales: told that only admins can change placements');
  check((await page.getByRole('button', { name: 'End now' }).count()) === 0 && (await page.getByRole('button', { name: 'Promote' }).count()) === 0, 'sales: no action buttons are shown');
  check((await page.locator('main li', { hasText: 'Plumber One' }).count()) > 0, 'sales: can still see who holds each spot');
  await page.goto(`${root}/admin/businesses/${BIZ}`);
  check(/Only admins can activate or end plans and placements/.test(await page.locator('main').innerText()) && (await page.getByRole('button', { name: /Mark paid/ }).count()) === 0, 'sales: the business page shows no plan forms');

  // ---------- the manager as admin ----------
  page = await as('tok-admin'); await page.goto(`${root}/admin/placements`);
  await page.getByRole('heading', { level: 1, name: 'Placements' }).waitFor();
  const text = await page.locator('main').innerText();
  check(/Home page/.test(text) && /Things to Do/.test(text) && /Category: Plumbing/.test(text), 'slots: home page, Things to Do and each category with activity');
  check(/3 of 3 used: full/.test(text) && /1 of 6 used/.test(text), 'each slot says how many spots are used');
  check(/Comp: founding member/.test(text) && /renews itself/.test(text), 'holders show whether they paid or were comped, and auto-renewals');
  check(/Ending in the next 30 days/.test(text) && /Alpha Plumbing/.test(text), 'the "ending soon" list names the businesses');
  check(/Ends in \d+ days?/.test(text), 'a holder close to its end is flagged with the days left');
  check(/Needs a verified, published business with an Enhanced listing/.test(text), 'a waitlist entry that is not eligible says why');
  check((await page.locator('ol li', { hasText: 'Waiting Plumber' }).innerText()).includes('#1') && (await page.locator('ol li', { hasText: 'Not Ready' }).innerText()).includes('#2'), 'the waitlist is numbered in order');
  check(await noOverflow(page), 'placements page: no horizontal scroll at 390px');

  // end now: two steps, reason sent
  const home = page.locator('li').filter({ has: page.getByRole('heading', { name: 'Home page' }) });
  await home.getByRole('button', { name: 'End now' }).click();
  check(calls('end_placement').length === 0, 'ending needs a second confirmation (nothing sent after the first click)');
  await home.getByLabel(/Reason/).fill('Asked to stop'); await home.getByRole('button', { name: 'End this placement' }).click();
  await status(page, /Done: ended now/);
  const ep = calls('end_placement').at(-1).body;
  check(ep.p_id === IDS.home && ep.p_reason === 'Asked to stop' && ep.p_tenant, 'end: sends the placement id, the reason and the tenant');

  // promote from the waitlist
  const w1 = page.locator('ol li', { hasText: 'Waiting Plumber' });
  await w1.getByRole('button', { name: 'Promote' }).click();
  await w1.getByLabel('Product (fills in the price)').selectOption('featured_monthly');
  check((await w1.getByLabel('Amount paid ($)').inputValue()) === '49.00', 'promote: choosing a product fills in its price');
  state.placementResult = { result: 'full' };
  await w1.getByRole('button', { name: 'Mark paid and activate' }).click();
  await alert(page, /still full/);
  check(true, 'promote: a still-full slot says so and keeps the form open');
  state.placementResult = null;
  await w1.getByRole('button', { name: 'Mark paid and activate' }).click();
  await status(page, /Featured placement activated\. Payment \$49\.00 recorded/);
  const pr = calls('activate_placement').at(-1).body;
  check(pr.p_waitlist_id === IDS.w1 && pr.p_months === 1 && pr.p_source === 'paid' && pr.p_amount_cents === 4900 && pr.p_product_code === 'featured_monthly', 'promote: sends the waitlist entry, the term, the amount in cents and the product');
  const w2 = page.locator('ol li', { hasText: 'Not Ready' });
  const endsBefore = calls('end_placement').length;
  await w2.getByRole('button', { name: 'Remove' }).click(); await w2.getByRole('button', { name: 'Remove from the waitlist' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Done:'), null, { timeout: 10000 }).catch(() => {});
  for (let i = 0; i < 50 && calls('end_placement').length === endsBefore; i++) await new Promise((r) => setTimeout(r, 100));
  check(calls('end_placement').length === endsBefore + 1 && calls('end_placement').at(-1).body.p_id === IDS.w2, 'a waitlist entry can be removed');

  // ---------- plan and placements on a business ----------
  await page.goto(`${root}/admin/businesses/${BIZ}`);
  await page.getByRole('heading', { name: 'Plan and placements' }).waitFor();
  await page.getByRole('button', { name: 'Mark paid and activate Enhanced' }).click();
  await alert(page, /amount paid/i);
  check(calls('activate_listing').length === 0, 'listing: a paid activation with no amount is refused before reaching the database');
  await page.locator('#l-product').selectOption('enhanced_yearly');
  check((await page.locator('#l-amount').inputValue()) === '199.00' && (await page.locator('#l-months').inputValue()) === '12', 'listing: picking the yearly product fills $199 and 12 months');
  await page.locator('#l-renews').check(); await page.locator('#l-notes').fill('Stripe pi_test_123');
  await page.getByRole('button', { name: 'Mark paid and activate Enhanced' }).click();
  await status(page, /Enhanced listing activated\. Payment \$199\.00 recorded/);
  const al = calls('activate_listing').at(-1).body;
  check(al.p_business === BIZ && al.p_months === 12 && al.p_ends_at === null && al.p_source === 'paid' && al.p_amount_cents === 19900 && al.p_product_code === 'enhanced_yearly' && al.p_auto_renews === true && al.p_notes === 'Stripe pi_test_123', 'listing: every field reaches the function, with the amount in cents');
  await page.locator('#l-source').selectOption('founding_member');
  check((await page.locator('#l-amount').count()) === 0, 'listing: choosing a comp hides the amount field');
  await page.getByRole('radio', { name: 'Until a date' }).first().check();
  await page.getByRole('button', { name: 'Activate Enhanced (comp)' }).click(); await alert(page, /end date/i);
  await page.locator('#l-end').fill('2027-03-31');
  await page.getByRole('button', { name: 'Activate Enhanced (comp)' }).click(); await status(page, /\(comp\)/);
  const comp = calls('activate_listing').at(-1).body;
  check(comp.p_source === 'founding_member' && comp.p_amount_cents === null && comp.p_months === null && comp.p_ends_at === '2027-04-01T06:00:00.000Z', 'listing: a comp sends no amount; an end date means "through that day" in Mountain time');

  // featured on a business
  await page.locator('#p-slot').selectOption('category');
  const placementCalls = calls('activate_placement').length;
  await page.getByRole('button', { name: 'Mark paid and activate Featured' }).click(); await alert(page, /Choose a category/);
  check(calls('activate_placement').length === placementCalls, 'placement: a category placement without a category is refused before reaching the database');
  await page.locator('#p-scope').selectOption(CAT); await page.locator('#p-amount').fill('49');
  state.placementResult = { result: 'full' };
  await page.getByRole('button', { name: 'Mark paid and activate Featured' }).click();
  await alert(page, /That spot is full right now/);
  check(/Nothing was charged or recorded/.test(await page.locator('main').innerText()), 'placement: a full spot says nothing was recorded');
  await page.getByRole('button', { name: 'Add to the waitlist' }).click(); await status(page, /Added to the waitlist/);
  const wl = calls('add_to_waitlist').at(-1).body;
  check(wl.p_business === BIZ && wl.p_slot === 'category' && wl.p_scope === CAT, 'placement: "Add to the waitlist" uses the same business, slot and category');
  state.placementResult = null;
  await page.getByRole('button', { name: 'Mark paid and activate Featured' }).click(); await status(page, /Featured placement activated\. Payment \$49\.00/);
  const pa = calls('activate_placement').at(-1).body;
  check(pa.p_business === BIZ && pa.p_slot === 'category' && pa.p_scope === CAT && pa.p_amount_cents === 4900 && pa.p_waitlist_id === null, 'placement: slot, scope and amount reach the function');
  await page.locator('#p-slot').selectOption('homepage');
  check((await page.locator('#p-scope').count()) === 0, 'placement: a homepage placement has no scope field');

  // current spots and ending
  const cur = page.locator('section', { hasText: 'Current Featured spots' });
  await cur.getByRole('button', { name: 'End now' }).click(); await cur.getByLabel(/Reason/).fill('Closed shop'); await cur.getByRole('button', { name: 'End this placement' }).click();
  await status(page, /Done:/);
  check(calls('end_placement').at(-1).body.p_id === IDS.live, 'a current Featured spot can be ended from the business page');
  state.detail.listing = { tier: 'enhanced', status: 'active', source: 'paid', starts_at: '2026-09-01T00:00:00Z', ends_at: '2027-09-01T15:00:00Z' };
  await page.reload(); await page.getByRole('heading', { name: 'Plan and placements' }).waitFor();
  check(/Active, ends Sep 1, 2027/.test(await page.locator('main').innerText()) && (await page.getByRole('button', { name: 'Extend Enhanced listing' }).count()) === 1, 'a running listing shows its end date and offers "Extend"');
  const eb = page.locator('section', { hasText: 'Enhanced listing' }).first();
  await eb.getByRole('button', { name: 'End Enhanced now' }).click(); await eb.getByLabel(/Reason/).fill('Owner cancelled'); await eb.getByRole('button', { name: 'End the Enhanced listing' }).click();
  await status(page, /1 paid Featured placement ended with it/);
  check(calls('end_listing').at(-1).body.p_reason === 'Owner cancelled', 'ending Enhanced sends the reason and reports the paid placements that ended with it');
  check(await noOverflow(page), 'business page: no horizontal scroll at 390px');

  // errors
  state.failNext = { rpc: 'activate_listing', status: 400, body: { code: '22023', message: 'publish the business before giving it a paid listing' } };
  await page.locator('#l-amount').fill('19'); await page.getByRole('button', { name: /activate Enhanced|Extend Enhanced/i }).first().click();
  await alert(page, /Publish the business before giving it a paid listing\./);
  check(true, 'a rule message from the database is shown readably');
  state.failNext = { rpc: 'activate_listing', status: 500, body: { code: 'XX000', message: 'relation "payments" exploded' } };
  await page.getByRole('button', { name: /activate Enhanced|Extend Enhanced/i }).first().click();
  await alert(page, /could not be saved/);
  check(!(await page.content()).includes('exploded'), 'an unexpected error never leaks its message');
} catch (err) { console.error(err); failed++; }
finally { await browser.close(); mock.close(); }
if (failed) { console.error(`\n${failed} placements e2e check(s) failed`); process.exit(1); }
console.log('\nall placements e2e checks passed');
