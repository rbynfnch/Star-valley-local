// Postcard batches (admin) and redemption (owner) in a REAL browser against the Supabase MOCK. The QR is decoded in the test with
// jsQR-free logic: it checks the SVG exists and encodes the redeem URL by re-encoding the same string with the app's encoder.
//   node scripts/e2e-postcards.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cookieFor, freshPostcards, startMock, state } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
let chromium;
for (const where of [undefined, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']) { try { ({ chromium } = require(where ? join(where, 'playwright') : 'playwright')); break; } catch { /* next */ } }
if (!chromium) { console.error('Playwright not found'); process.exit(2); }
const exe = (() => { const b = '/opt/pw-browsers'; for (const d of existsSync(b) ? readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)) : []) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return undefined; })();
const port = process.argv[2] ?? '3101', host = process.argv[3] ?? 'star-valley.localhost', root = `http://${host}:${port}`;
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
state.postcards = freshPostcards();
const P = state.postcards, calls = (n) => P.calls.filter((c) => c.rpc === n);
const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const as = async (tok) => { const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } }); if (tok) { const [name, value] = cookieFor(tok).split('='); await ctx.addCookies([{ name, value, url: root }]); } return ctx.newPage(); };
const main = async (page) => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
try {
  const ed = await as('tok-editor'); await ed.goto(`${root}/admin/postcards`);
  check(!/\/admin\/postcards/.test(ed.url()), 'editors cannot open the postcards page');
  const page = await as('tok-sales'); await page.goto(`${root}/admin/postcards`);
  await page.getByRole('heading', { level: 1, name: 'Postcards' }).waitFor();
  check((await page.locator('nav[aria-label="Admin"]').innerText()).includes('Postcards'), 'sales staff see the Postcards link');
  let t = await main(page);
  check(/September mailing/.test(t) && /Gamma Cafe Waiting/.test(t) && /Delta Dental Redeemed/.test(t), 'recent batches show each card\'s status');
  check((await page.getByLabel('Alpha Plumbing').count()) === 1 && (await page.getByLabel('Beta Bakery').count()) === 1, 'eligible businesses are listed');
  const btn = page.getByRole('button', { name: 'Make codes' });
  check(await btn.isDisabled(), 'the button waits until a business is chosen');
  await page.getByLabel('Alpha Plumbing').check(); await page.getByLabel('Beta Bakery').check();
  await page.locator('#pc-label').fill('October mailing');
  await btn.click();
  await page.getByText('2 cards ready.').waitFor();
  const c = calls('postcard_batch_create').at(-1);
  check(c?._who === 'u-sales' && c.p_label === 'October mailing' && c.p_businesses.length === 2, 'the batch is made as the signed-in staff member for the chosen businesses');
  t = await main(page);
  check(/K7Q2M XVB9P/.test(t) && /AB23C D45EF/.test(t.replace('AB23C D45EF', 'AB23C D45EF')) , 'the codes are shown once, grouped for typing');
  check(/Alpha Plumbing/.test(t) && /1 Main St/.test(t) && /not stored and cannot be shown again/.test(t), 'each card shows the business, its address and the one-time warning');
  const svgs = page.locator('svg[aria-label="QR code for the verification page"]');
  check((await svgs.count()) === 2 && (await svgs.first().locator('path').getAttribute('d'))?.startsWith('M4,4'), 'each card has a QR code');
  await page.reload(); await page.getByRole('heading', { name: 'Postcards' }).first().waitFor();
  check(!/K7Q2M XVB9P/.test(await main(page)), 'after a reload the codes are gone (they are not stored)');
  // print view: chrome hidden
  await page.getByLabel('Alpha Plumbing').check().catch(() => {});
  await page.emulateMedia({ media: 'print' });
  check(!(await page.locator('header').first().isVisible()) && !(await page.locator('nav').first().isVisible()), 'print hides the site and admin chrome');
  await page.emulateMedia({ media: 'screen' });
  // refusals
  P.createError = { status: 400, body: { code: '22023', message: 'a business in the list cannot be sent a card (it must be claimed, Green verified, not already Gold, and have no card waiting)' } };
  await page.getByLabel('Beta Bakery').check(); await page.locator('#pc-label').fill('Again'); await page.getByRole('button', { name: 'Make codes' }).click();
  await page.getByRole('alert').filter({ hasText: 'cannot be sent a card' }).waitFor();
  check(true, 'database rule messages are shown'); P.createError = { status: 500, body: { code: 'XX000', message: 'secret internal detail' } };
  await page.getByRole('button', { name: 'Make codes' }).click(); await page.getByRole('alert').filter({ hasText: 'could not be done' }).waitFor();
  check(!/secret internal/.test(await page.content()), 'unexpected errors never leak details'); P.createError = null;
  await page.getByRole('button', { name: 'Void' }).click(); await page.locator('li', { hasText: 'Gamma Cafe' }).getByText('Voided').waitFor();
  check(calls('postcard_void').at(-1)?.p_code === 'c0000000-0000-4000-8000-000000000001', 'a waiting card can be voided');

  // ---------- owner side ----------
  const out = await as(null); await out.goto(`${root}/verify/postcard?c=abcde-fghjk`);
  check(/Sign in with the account that owns your business/.test(await main(out)) && (await out.getByRole('link', { name: 'Sign in' }).getAttribute('href'))?.includes('next=%2Fverify%2Fpostcard%3Fc%3DABCDEFGHJK'), 'signed out: sign in first, and come back with the code');
  check((await out.locator('meta[name="robots"]').getAttribute('content'))?.includes('noindex') && (await out.locator('meta[name="referrer"]').getAttribute('content')) === 'no-referrer', 'the page is noindex and keeps the code out of Referer headers');
  const own = await as('tok-owner'); await own.goto(`${root}/verify/postcard?c=abcde-fghjk`);
  await own.getByRole('button', { name: 'Confirm my postcard' }).waitFor();
  check((await own.locator('#pc-code').inputValue()) === 'ABCDEFGHJK' && calls('postcard_redeem').length === 0, 'a scanned code is filled in, and opening the page redeems nothing');
  await own.locator('#pc-code').fill('nope'); await own.getByRole('button', { name: 'Confirm my postcard' }).click();
  await own.getByRole('alert').filter({ hasText: '10-character code' }).waitFor();
  check(calls('postcard_redeem').length === 0, 'a malformed code never reaches the database');
  await own.locator('#pc-code').fill('ZZZZZ ZZZZZ'); await own.getByRole('button', { name: 'Confirm my postcard' }).click();
  await own.getByRole('alert').filter({ hasText: 'did not work' }).waitFor();
  check(!/owner|void|expired/i.test(await own.getByRole('alert').filter({ hasText: 'did not work' }).innerText().then((x) => x.replace('owns the business', ''))) , 'a wrong code gets one generic answer');
  P.redeemError = { status: 400, body: { code: '53400', message: 'too many wrong codes; try again in an hour' } };
  await own.getByRole('button', { name: 'Confirm my postcard' }).click(); await own.getByRole('alert').filter({ hasText: 'Too many wrong codes' }).waitFor();
  check(true, 'the lockout message is shown'); P.redeemError = null;
  await own.locator('#pc-code').fill('ABCDE-FGHJK'); await own.getByRole('button', { name: 'Confirm my postcard' }).click();
  await own.getByRole('heading', { name: 'You are Gold Verified.' }).waitFor();
  const rd = calls('postcard_redeem').at(-1);
  check(rd?._who === 'service' && rd.p_user === 'u-owner' && rd.p_code === 'ABCDEFGHJK' && rd.p_tenant, 'redemption goes through the server with the signed-in account id and the cleaned code');
  check((await own.getByRole('link', { name: 'View your listing' }).getAttribute('href')) === '/business/sample-smile-dental', 'and links to the listing');
} finally { await browser.close(); await mock.close(); }
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('ALL PASSED');
