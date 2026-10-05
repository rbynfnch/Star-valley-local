// Local Hotlist in a REAL browser against the Supabase + storage MOCK: the editors' admin (create, photo, review, slots, redeem) and
// the public "Get deal" claim. Same environment as e2e-editorial.mjs (fixtures-mode dev server + mock on :54399).
//   node scripts/e2e-hotlist.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cookieFor, freshHotlist, startMock, state } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
let chromium;
for (const where of [undefined, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']) { try { ({ chromium } = require(where ? join(where, 'playwright') : 'playwright')); break; } catch { /* next */ } }
if (!chromium) { console.error('Playwright not found'); process.exit(2); }
const exe = (() => { const b = '/opt/pw-browsers'; for (const d of existsSync(b) ? readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)) : []) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return undefined; })();
const port = process.argv[2] ?? '3101', host = process.argv[3] ?? 'star-valley.localhost', root = `http://${host}:${port}`;
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
const fx = JSON.parse(readFileSync('.fixtures/directory.json', 'utf8'));
state.hotlist = freshHotlist(fx.tenants[0].id);
const H = state.hotlist, calls = (n) => H.calls.filter((c) => c.rpc === n);
const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const as = async (tok) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } }); if (tok) { const [name, value] = cookieFor(tok).split('='); await ctx.addCookies([{ name, value, url: root }]); } return ctx.newPage(); };
const main = async (page) => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
try {
  // ---------- access ----------
  const sales = await as('tok-sales'); await sales.goto(`${root}/admin/hotlist`);
  check(!/\/admin\/hotlist/.test(sales.url()), 'sales staff cannot open the Hotlist admin');
  const page = await as('tok-editor');
  await page.goto(`${root}/admin/hotlist`);
  await page.getByRole('heading', { level: 1, name: 'Hotlist' }).waitFor();
  check((await page.locator('nav[aria-label="Admin"]').innerText()).includes('Hotlist'), 'editors see the Hotlist link');
  let t = await main(page);
  check(/Waiting for review \(1\)/.test(t) && /Owner submission/.test(t) && /submitted by the business/.test(t) && /no photo yet/.test(t), 'the approval queue shows the business submission');
  check(/Published \(1\)/.test(t) && /1 of 10 claimed/.test(t) && /\$25 \(was \$40\)/.test(t), 'published items show price, claims and quantity');

  // ---------- review: photo first ----------
  await page.getByRole('link', { name: 'Owner submission' }).click();
  await page.getByRole('heading', { name: 'Review (submitted by the business)' }).waitFor();
  await page.getByRole('button', { name: 'Approve and publish' }).click();
  await page.getByRole('alert').filter({ hasText: 'photo before approving' }).waitFor();
  check(calls('review_hotlist_item').at(-1)?.p_decision === 'approve', 'approving without a photo is refused by the database and the message is shown');
  await page.locator('#cover-file').setInputFiles('supabase/seed-media/media/demo/hl-pie.png');
  await page.locator('#cover-alt').fill('A slice of pie');
  await page.getByRole('button', { name: 'Upload image' }).click();
  await page.getByText('Image saved.').waitFor();
  const img = calls('set_content_image').at(-1);
  check(img?.p_kind === 'hotlist' && /\/hotlists\/f0000000/.test(img.p_path) && img.p_alt === 'A slice of pie', 'the photo is stored under the item\'s folder with its alt text');
  await page.getByRole('button', { name: 'Reject…' }).click();
  await page.getByRole('button', { name: 'Reject offer' }).click();   // reason is required by the browser: nothing is sent
  check(calls('review_hotlist_item').length === 1, 'rejecting needs a reason before anything is sent');
  await page.locator('#reason').fill('Needs a bigger saving');
  await page.getByRole('button', { name: 'Reject offer' }).click();
  await page.getByText('Rejected.').waitFor();
  check(H.items[1].status === 'rejected' && H.items[1].reject_reason === 'Needs a bigger saving', 'a rejection carries its reason');

  // ---------- create a deal ----------
  await page.goto(`${root}/admin/hotlist/new`);
  await page.locator('#business').fill('sample-creekside-cafe');
  await page.locator('#title').fill('  Breakfast   for two ');
  await page.locator('#original').fill('$36'); await page.locator('#price').fill('24.50'); await page.locator('#quantity').fill('40');
  await page.locator('#code_prefix').fill('cafe24'); await page.locator('#redemption').fill('Show the code.');
  await page.locator('#end_date').fill('2026-12-31');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.waitForURL(/\/admin\/hotlist\/[0-9a-f-]{36}\?created=1/);
  const s = calls('save_hotlist_item').at(-1);
  check(s.p_id === null && s.p_status === 'draft' && s.p_fields.title === 'Breakfast for two' && s.p_fields.original_cents === 3600 && s.p_fields.price_cents === 2450 && s.p_fields.quantity === 40 && s.p_fields.code_prefix === 'CAFE24', 'the draft is saved with cents, a clean title and an upper-case prefix');
  check(s.p_fields.ends_at === '2027-01-01T07:00:00.000Z', 'the last day is stored as the start of the next local day');
  check(s._who === 'u-editor' && s.p_business === 'b1', 'it is saved as the editor, for the business found by its web address name');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByText('Saved.').waitFor();
  await page.locator('#status').selectOption('published');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('alert').filter({ hasText: 'add a photo before publishing' }).waitFor();
  check(true, 'publishing without a photo is refused with the database\'s message');
  H.saveError = { status: 500, body: { code: 'XX000', message: 'secret internal detail' } };
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('alert').filter({ hasText: 'could not be saved' }).waitFor();
  check(!/secret internal/.test(await page.content()), 'unexpected errors never leak details'); H.saveError = null;
  await page.goto(`${root}/admin/hotlist/new`);
  await page.locator('#business').fill('no-such-business'); await page.locator('#title').fill('Whatever'); await page.locator('#original').fill('40'); await page.locator('#price').fill('20'); await page.locator('#code_prefix').fill('ABC'); await page.locator('#redemption').fill('x'); await page.locator('#end_date').fill('2026-12-31');
  const before = calls('save_hotlist_item').length;
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.getByRole('alert').filter({ hasText: 'No business has' }).waitFor();
  check(calls('save_hotlist_item').length === before, 'an unknown business is caught before the save');
  await page.locator('#kind').selectOption('pick');
  check((await page.locator('#original').count()) === 0 && (await page.locator('#badge').count()) === 0, 'a pick has no price or label fields');

  // ---------- slots ----------
  await page.goto(`${root}/admin/hotlist`);
  await page.locator('#hottest-1').selectOption({ index: 1 });
  await page.locator('form', { has: page.locator('#hottest-1') }).getByRole('button', { name: 'Save slot' }).click();
  await page.locator('form', { has: page.locator('#hottest-1') }).getByText('Saved.').waitFor();
  const f = calls('set_hotlist_features').at(-1);
  check(f?.p_slot === 'hottest' && f.p_items.length === 1, 'a slot is saved as an ordered list of ids');
  check((await page.locator('#hottest-1 option').allInnerTexts()).filter((x) => /Live deal/.test(x)).length === 1 && !(await page.locator('#hottest-1 option').allInnerTexts()).some((x) => /Owner submission|draft pick/.test(x)), 'only published, current items can be chosen');
  await page.reload(); check((await page.locator('#hottest-1').inputValue()) === H.items[0].id, 'the slot shows its saved item after a reload');

  // ---------- newsletter block + redeem ----------
  check(/This week's Hotlist for the newsletter/.test(await main(page)) && /This week&#39;s Hotlist/.test(await page.locator('#nl-html').inputValue()), 'the newsletter block is built from the slots');
  await page.locator('#redeem-code').fill('svl25-abcde');
  await page.getByRole('button', { name: 'Mark redeemed' }).click();
  await page.getByText('Redeemed: Live deal.').waitFor();
  check(H.claims[0].redeemed_at !== null, 'a code is marked redeemed (case does not matter)');
  await page.getByRole('button', { name: 'Mark redeemed' }).click();
  await page.getByText('Already redeemed: Live deal.').waitFor();
  check(true, 'a second redemption is reported, not repeated');

  // ---------- public: get a deal ----------
  const slug = 'half-day-guided-fly-fishing';
  const out = await as(null); await out.goto(`${root}/hotlist/${slug}`);
  check((await out.getByRole('link', { name: 'Get deal' }).getAttribute('href'))?.includes('/account/sign-in?next=%2Fhotlist%2F' + slug), 'signed out: Get deal leads to sign-in and back');
  const nu = await as('tok-new'); await nu.goto(`${root}/hotlist/${slug}`);
  check(/Confirm your email address/.test(await main(nu)) && (await nu.getByRole('button', { name: 'Get deal' }).count()) === 0, 'an unconfirmed email cannot get the deal');
  const own = await as('tok-owner'); await own.goto(`${root}/hotlist/${slug}`);
  check(/How to redeem/.test(await main(own)) && /Nothing is charged on this site/.test(await main(own)), 'the page explains redemption and that nothing is charged here');
  await own.getByRole('button', { name: 'Get deal' }).click();
  await own.getByRole('heading', { name: /Your Hotlist code/ }).waitFor();
  const claim = calls('hotlist_claim').at(-1);
  check(claim?._who === 'service' && claim.p_user === 'u-owner' && /^[0-9a-f-]{36}$/.test(claim.p_item) && claim.p_tenant === fx.tenants[0].id, 'the claim goes through the server with the account id and the item id from the database, never the browser');
  check(/SVL25-TEST\d/.test(await main(own)) && /Show this code at/.test(await main(own)), 'the pass shows the code and what to do with it');
  await own.reload(); check(/SVL25-TEST\d/.test(await main(own)) && (await own.getByRole('button', { name: 'Get deal' }).count()) === 0, 'the pass is still there on the next visit while signed in');
  H.claims.length = 1; H.claimError = { status: 400, body: { code: '22023', message: 'this deal is sold out' } };
  const own2 = await as('tok-owner'); await own2.goto(`${root}/hotlist/${slug}`);
  await own2.getByRole('button', { name: 'Get deal' }).click();
  await own2.getByRole('alert').filter({ hasText: 'sold out' }).waitFor();
  check(true, 'database rule messages (sold out, daily limit) are shown');
  H.claimError = { status: 500, body: { code: 'XX000', message: 'secret internal detail' } };
  await own2.getByRole('button', { name: 'Get deal' }).click();
  await own2.getByRole('alert').filter({ hasText: 'did not work' }).waitFor();
  check(!/secret internal/.test(await own2.content()), 'unexpected claim errors never leak details'); H.claimError = null;
  const pick = await as('tok-owner'); await pick.goto(`${root}/hotlist/pie-of-the-week`);
  check(/nothing to claim/.test(await main(pick)) && (await pick.getByRole('button', { name: 'Get deal' }).count()) === 0, 'a pick has no claim button');
} finally { await browser.close(); await mock.close(); }
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('ALL PASSED');
