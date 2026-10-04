// The public pricing page in a REAL browser: real seeded database (products, live scarcity) + the Supabase MOCK for sign-in.
// Payment Link URLs and a "full" category are set with SQL on the seeded database, then restored.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npm run dev -- -p 3101   (fixtures mode, `npm run fixtures` first)
//   node scripts/e2e-pricing.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cookieFor, startMock, state } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
let chromium;
for (const where of [undefined, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']) { try { ({ chromium } = require(where ? join(where, 'playwright') : 'playwright')); break; } catch { /* next */ } }
if (!chromium) { console.error('Playwright not found (install it globally, e.g. npm i -g playwright)'); process.exit(2); }
const exe = (() => { const b = '/opt/pw-browsers'; for (const d of existsSync(b) ? readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)) : []) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return undefined; })();

const port = process.argv[2] ?? '3101';
const host = process.argv[3] ?? 'star-valley.localhost';
const root = `http://${host}:${port}`;
const DB = process.env.SVL_TEST_DB ?? 'svl_seed';
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
const sql = (q) => execFileSync('psql', ['-X', '-q', '-t', '-A', '-d', DB, '-c', q], { encoding: 'utf8' }).trim();

const fx = JSON.parse(readFileSync('.fixtures/directory.json', 'utf8'));
const tenant = fx.tenants[0].id;
const plumber = fx.businesses.find((b) => b.slug === 'sample-valley-plumbing');
const cafe = fx.businesses.find((b) => b.slug === 'sample-creekside-cafe');
const LINKS = { enhanced_monthly: 'https://buy.stripe.test/enhanced-monthly', enhanced_yearly: 'https://buy.stripe.test/enhanced-yearly', featured_monthly: 'https://buy.stripe.test/featured' };
const scarcity = () => JSON.parse(sql(`select public.placement_scarcity('${tenant}')`));
const expected = (max, used) => { const r = Math.max(max - used, 0); return r === 0 ? 'Full' : r === max ? `${max} of ${max} spots open` : `${r} of ${max} ${r === 1 ? 'spot' : 'spots'} left`; };

const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const as = async (tok) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 1100 } }); if (tok) { const [name, value] = cookieFor(tok).split('='); await ctx.addCookies([{ name, value, url: root }]); } return ctx.newPage(); };
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).then((n) => n <= 0);
try {
  for (const [code, url] of Object.entries(LINKS)) sql(`update public.tenant_products set payment_link_url = '${url}' where code = '${code}' and tenant_id = '${tenant}'`);

  // ---------- anonymous ----------
  let page = await as(null);
  await page.goto(`${root}/pricing`);
  await page.getByRole('heading', { level: 1, name: 'Plans and pricing' }).waitFor();
  let text = await page.locator('main').innerText();
  check(/Free[\s\S]*\$0/.test(text) && /\$19\/mo or \$199\/yr/.test(text) && /\$49\/mo per spot/.test(text), 'three plans with their prices ($0, $19/mo or $199/yr, $49/mo per spot)');
  check(/Coming soon: a Request a Quote button/.test(text), 'Request a Quote is honestly marked "coming soon" (it is not built yet)');
  check(/claim your business/.test(text) && (await page.locator('a[href*="buy.stripe.test"]').count()) === 0, 'a visitor who is not an owner is sent to claim first, and sees no payment links');
  const sc = scarcity();
  const plumbers = sc.categories.find((c) => c.slug === 'plumbing');
  const row = page.locator('li', { hasText: plumbers.name }).filter({ hasText: /spot|Full/ }).first();
  check((await row.innerText()).includes(expected(plumbers.max, plumbers.used)), `live availability for ${plumbers.name} matches the database (${expected(plumbers.max, plumbers.used)})`);
  check(text.includes(`Home page${'\n'}`) || /Home page\s+\d of 6 spots/.test(text) || /Home page\s+Full/.test(text), 'the home page and Things to Do availability are listed');
  check(sc.communities.every((c) => text.includes(c.name)), 'every community is listed with its availability');
  check(await noOverflow(page), 'anonymous: no horizontal scroll at 390px');
  await page.goto(`${root}/pricing?business=${plumber.slug}`);
  check((await page.getByText(/Spots for/).count()) === 0 && (await page.locator('a[href*="buy.stripe.test"]').count()) === 0, 'passing a business is not enough: without being its owner there is no owner panel and no payment link');
  await page.goto(`${root}/pricing?business=Bad%20Slug`);
  check((await page.getByRole('heading', { level: 1, name: 'Plans and pricing' }).count()) === 1, 'a malformed business parameter is ignored, the page still works');

  // ---------- a signed-in user who does NOT own the business ----------
  page = await as('tok-owner');
  await page.goto(`${root}/pricing?business=${plumber.slug}`);
  check((await page.getByText(/Spots for/).count()) === 0 && (await page.locator('a[href*="buy.stripe.test"]').count()) === 0, 'signed in but not the owner: no panel and no payment link');

  // ---------- the owner of an Enhanced, verified business ----------
  state.owned.add(plumber.id);
  await page.goto(`${root}/pricing?business=${plumber.slug}`);
  await page.getByRole('heading', { name: `Spots for ${plumber.name}` }).waitFor();
  const monthly = page.locator('a', { hasText: /^Monthly \$19\/mo$/ });
  const href = await monthly.getAttribute('href');
  check(href?.startsWith(LINKS.enhanced_monthly) && href.includes(`client_reference_id=${plumber.id}`) && href.includes('prefilled_email=owner%40example.test'), 'the Enhanced Payment Link carries the business id and the owner\'s email');
  check(/already has Enhanced/.test(await page.locator('main').innerText()), 'an owner who already has Enhanced is told so');
  const catLine = page.locator('li', { hasText: /^In / }).first();
  const buy = await page.locator('a', { hasText: 'Get this spot' }).first().getAttribute('href');
  check(buy?.startsWith(LINKS.featured_monthly) && buy.includes(`client_reference_id=${plumber.id}`), 'a spot with room has a "Get this spot" link to the Featured Payment Link, tagged with the business');
  check(/Online checkout is not open yet/.test(await page.locator('main').innerText()), 'a slot type with no product configured says checkout is not open (no broken link)');
  void catLine;

  // ---------- full category: join the waitlist ----------
  sql(`update public.placement_limits set max_slots = 0 where tenant_id = '${tenant}' and slot_type = 'category'`);
  await page.goto(`${root}/pricing?business=${plumber.slug}`);
  await page.getByRole('heading', { name: `Spots for ${plumber.name}` }).waitFor();
  const full = page.locator('li', { hasText: /^In / }).filter({ has: page.getByRole('button', { name: /Join the waitlist/ }) }).first();
  check(/Full/.test(await full.innerText()), 'a full category shows "Full" and offers the waitlist instead of a purchase');
  await full.getByRole('button', { name: /Join the waitlist/ }).click();
  await page.getByRole('status').filter({ hasText: /on the waitlist \(position 2\)/ }).waitFor();
  const j = state.rpc.filter((c) => c.name === 'join_waitlist').at(-1);
  const catId = scarcity().categories.find((c) => c.slug === 'plumbing').id;
  check(j.body.p_business === plumber.id && j.body.p_slot === 'category' && j.body.p_scope === catId, 'join: the business id comes from the SERVER, plus the slot and the category id');
  check(j.key === 'tok-owner', 'join: runs as the signed-in owner (their own token, never the service key)');
  state.joinError = { status: 400, body: { code: '22023', message: 'there is room right now: you can buy this spot directly' } };
  await page.goto(`${root}/pricing?business=${plumber.slug}`);
  await page.locator('li').filter({ has: page.getByRole('button', { name: /Join the waitlist/ }) }).first().getByRole('button', { name: /Join the waitlist/ }).click();
  await page.getByRole('alert').filter({ hasText: 'There is room right now: you can buy this spot directly.' }).waitFor();
  check(true, 'a rule message from the database is shown readably');
  state.joinError = { status: 500, body: { code: 'XX000', message: 'relation "placements" exploded' } };
  await page.getByRole('button', { name: /Join the waitlist/ }).first().click();
  await page.getByRole('alert').filter({ hasText: /did not go through/ }).waitFor();
  check(!(await page.content()).includes('exploded'), 'an unexpected error never leaks its message');
  state.joinError = null;
  check(await noOverflow(page), 'owner view: no horizontal scroll at 390px');
  sql(`update public.placement_limits set max_slots = 3 where tenant_id = '${tenant}' and slot_type = 'category'`);

  // ---------- a verified owner WITHOUT Enhanced ----------
  state.owned.add(cafe.id);
  await page.goto(`${root}/pricing?business=${cafe.slug}`);
  await page.getByRole('heading', { name: `Spots for ${cafe.name}` }).waitFor();
  text = await page.locator('main').innerText();
  check(/Featured is added on top of an Enhanced listing/.test(text) && (await page.getByRole('button', { name: /Join the waitlist/ }).count()) === 0, 'verified but no Enhanced: told to upgrade first, no waitlist or spot buttons');
  check((await page.locator(`a[href*="enhanced-monthly"][href*="${cafe.id}"]`).count()) === 1, 'and the Enhanced purchase link is offered, tagged with that business');

  // ---------- a missing payment link ----------
  sql(`update public.tenant_products set payment_link_url = null where code = 'enhanced_monthly' and tenant_id = '${tenant}'`);
  await page.goto(`${root}/pricing?business=${cafe.slug}`);
  await page.getByRole('heading', { name: `Spots for ${cafe.name}` }).waitFor();
  check((await page.locator('a', { hasText: /^Monthly/ }).count()) === 0 && (await page.locator('a', { hasText: /^Yearly/ }).count()) === 1 || /Online checkout is not open yet/.test(await page.locator('main').innerText()), 'a product without a Payment Link shows "not open yet" instead of a broken button');
  await page.goto(`${root}/`);
  check((await page.getByRole('link', { name: 'Plans and pricing' }).count()) > 0, 'the footer links to the pricing page');
} catch (err) { console.error(err); failed++; }
finally {
  try { sql(`update public.tenant_products set payment_link_url = null where tenant_id = '${tenant}'`); sql(`update public.placement_limits set max_slots = 3 where tenant_id = '${tenant}' and slot_type = 'category'`); } catch { /* best effort */ }
  await browser.close(); mock.close();
}
if (failed) { console.error(`\n${failed} pricing e2e check(s) failed`); process.exit(1); }
console.log('\nall pricing e2e checks passed');
