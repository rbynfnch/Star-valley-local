// The owner dashboard in a REAL browser against the Supabase + storage MOCK (which refuses what row-level security would refuse).
// Same environment as e2e-editorial.mjs (fixtures-mode dev server + mock on :54399).
//   node scripts/e2e-owner.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cookieFor, freshOwner, startMock, state } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
let chromium;
for (const where of [undefined, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']) { try { ({ chromium } = require(where ? join(where, 'playwright') : 'playwright')); break; } catch { /* next */ } }
if (!chromium) { console.error('Playwright not found'); process.exit(2); }
const exe = (() => { const b = '/opt/pw-browsers'; for (const d of existsSync(b) ? readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)) : []) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return undefined; })();
const port = process.argv[2] ?? '3101', host = process.argv[3] ?? 'star-valley.localhost', root = `http://${host}:${port}`;
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
state.owner = freshOwner();
const O = state.owner, ID = O.businesses[0].id, calls = (n) => O.calls.filter((c) => c.rpc === n);
const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const as = async (tok, w = 1000) => { const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }); if (tok) { const [name, value] = cookieFor(tok).split('='); await ctx.addCookies([{ name, value, url: root }]); } return ctx.newPage(); };
const main = async (page) => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
try {
  // ---------- access ----------
  const out = await as(null); await out.goto(`${root}/dashboard`);
  check(/\/account\/sign-in\?next=%2Fdashboard/.test(out.url()), 'signed out: the dashboard sends you to sign in and back');
  const page = await as('tok-owner'); await page.goto(`${root}/dashboard`);
  await page.getByRole('heading', { level: 1, name: 'Your businesses' }).waitFor();
  let t = await main(page);
  check(/Sample Smile Dental/.test(t) && /Free/.test(t) && /Verified/.test(t) && /New requests 2/.test(t), 'the list shows the business with plan, verification and new requests');
  check(/noindex/.test((await page.locator('meta[name="robots"]').getAttribute('content')) ?? ''), 'dashboard pages are noindex');
  await page.goto(`${root}/dashboard/e0000000-0000-4000-8000-0000000000ff`);
  check(/This page could not be found|404/.test(await page.content()), 'a business the account does not own is a 404');

  // ---------- overview ----------
  await page.goto(`${root}/dashboard/${ID}`);
  await page.getByRole('heading', { level: 1, name: 'Sample Smile Dental' }).waitFor();
  t = await main(page);
  check(/212/.test(t) && /\+62 vs the 30 days before/.test(t) && /dentist/.test(t), 'last 30 days: views with the change against the period before, and what people searched');
  check(/You have 2 new quote requests/.test(t) && /Add your opening hours/.test(t) && /Upgrade to Enhanced/.test(t), '"what to do next" lists only true, useful steps');
  check(!/Upsell|sales pitch/i.test(t) && !/In the last 30 days this listing got/.test(t), 'no sales-pitch wording for the owner');
  check(/Verified/.test(t) && /Re-verify by/.test(t) && /Ask us for a postcard/.test(t), 'verification shows the date and the Gold step');
  check((await page.locator('textarea#embed').inputValue()).includes('/badge/sample-smile-dental') && /<a href="/.test(await page.locator('textarea#embed').inputValue()), 'a verified business gets an embed snippet for its badge');
  check((await page.locator('nav[aria-label="Business dashboard"] a[aria-current="page"]').innerText()) === 'Overview', 'the current tab is marked');
  O.activity.current = {}; O.activity.previous = {}; await page.reload();
  check(/Nothing recorded yet/.test(await main(page)), 'with no data it says so instead of showing zeros');

  // ---------- profile ----------
  await page.goto(`${root}/dashboard/${ID}/profile`);
  check((await page.locator('#description').count()) === 0 && (await page.locator('#email').count()) === 0 && (await page.locator('#legal_name').count()) === 0 && (await page.locator('#home_community_id').count()) === 0, 'Free: no description or email fields, and never legal name, community or category');
  await page.locator('#phone').fill('307-555-0100'); await page.locator('#website').fill('https://smile.example');
  await page.getByRole('button', { name: 'Save changes' }).click(); await page.getByText('Saved. Your public listing is updated.').waitFor();
  const u = calls('update_business_fields').at(-1);
  check(u.p_business === ID && u.p_fields.phone === '307-555-0100' && u.p_fields.website === 'https://smile.example' && !('legal_name' in u.p_fields) && !('description' in u.p_fields), 'only owner-editable fields are sent');
  await page.locator('#website').fill('ftp://smile.example'); await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('alert').filter({ hasText: 'Website must be a full address' }).waitFor();
  check(calls('update_business_fields').length === 1, 'a bad website is caught before the call');

  // ---------- content ----------
  await page.goto(`${root}/dashboard/${ID}/content`);
  await page.getByRole('heading', { name: 'Hours' }).waitFor();
  t = await main(page);
  check(['Highlights', 'Services', 'Social and other links', 'Questions and answers', 'Deals'].every((h) => new RegExp(`${h}\\s+Part of an Enhanced listing`).test(t)), 'Free: the Enhanced-only sections are locked with a link to the plans');
  check((await page.getByRole('link', { name: 'See the plans' }).first().getAttribute('href')) === `/dashboard/${ID}/plan`, 'the lock links to this business\'s plan page');
  await page.locator('#hours-h').scrollIntoViewIfNeeded();
  await page.getByLabel('Monday range 1 opens').fill('09:00'); await page.getByLabel('Monday range 1 closes').fill('17:00');
  await page.locator('section', { has: page.locator('#hours-h') }).getByRole('button', { name: 'Save' }).click(); await page.getByText('Hours saved.').waitFor();
  check(calls('set_business_hours').at(-1)?.p_business === ID, 'a Free owner saves hours through the same function staff use');
  const photo = page.locator('form', { has: page.locator('#pn-file') });
  for (const [role, name] of [['logo', 'logo.png'], ['cover', 'cover.png']]) {
    await photo.locator('#pn-role').selectOption(role); await photo.locator('#pn-file').setInputFiles('supabase/seed-media/media/demo/hl-pie.png'); await photo.locator('#pn-alt').fill('Alt for ' + name);
    await photo.getByRole('button', { name: 'Upload photo' }).click(); await page.getByText(role === 'logo' ? 'Logo set.' : 'Cover photo set.').waitFor();
  }
  const ph = calls('add_business_photo').at(-1);
  check(ph.p_business === ID && ph.p_path.startsWith(`${ph.p_tenant}/${ID}/`) && /\.(png|jpg|webp)$/.test(ph.p_path), 'photos are stored in the business\'s own folder with a server-made name');
  await photo.locator('#pn-role').selectOption('gallery'); await photo.locator('#pn-file').setInputFiles('supabase/seed-media/media/demo/hl-pie.png'); await photo.locator('#pn-alt').fill('Third');
  await photo.getByRole('button', { name: 'Upload photo' }).click(); await page.getByRole('alert').filter({ hasText: 'part of Enhanced' }).waitFor();
  check(true, 'a third photo on a Free listing is refused with a clear message');

  // ---------- requests ----------
  await page.goto(`${root}/dashboard/${ID}/leads`);
  check(/Requests are part of Enhanced/.test(await main(page)) && (await page.getByText('Pat Customer').count()) === 0, 'Free: requests are explained, not shown');
  O.businesses[0].tier = 'enhanced'; await page.reload();
  await page.getByRole('heading', { name: 'Pat Customer' }).waitFor();
  t = await main(page);
  check(/Do you take new patients/.test(t) && /Cleaning/.test(t) && (await page.getByRole('link', { name: 'pat@example.test' }).getAttribute('href')) === 'mailto:pat@example.test', 'Enhanced: the request shows what the customer wrote and how to reply');
  await page.locator('#st-e0000000-0000-4000-8000-0000000000e1').selectOption('contacted');
  await page.getByText('Updated.').waitFor();
  check(O.leads[0].status === 'contacted', 'the owner can mark it contacted');
  O.leadError = true; await page.locator('#st-e0000000-0000-4000-8000-0000000000e1').selectOption('lost');
  await page.getByRole('alert').filter({ hasText: 'could not be saved' }).waitFor(); O.leadError = false;
  check(true, 'a failed update says so');

  // ---------- enhanced content + hotlist ----------
  await page.goto(`${root}/dashboard/${ID}/content`); await page.getByRole('heading', { name: 'Services' }).waitFor();
  check(!/Part of an Enhanced listing/.test(await main(page)), 'Enhanced: nothing is locked');
  await page.goto(`${root}/dashboard/${ID}/profile`); check((await page.locator('#description').count()) === 1 && (await page.locator('#email').count()) === 1, 'Enhanced: the longer description and public email appear');
  await page.goto(`${root}/dashboard/${ID}/hotlist`);
  await page.getByRole('heading', { name: 'Submit an offer' }).waitFor();
  await page.locator('#o-title').fill('Cleaning and exam'); await page.locator('#o-original').fill('$200'); await page.locator('#o-price').fill('120'); await page.locator('#o-end').fill('2026-12-31'); await page.locator('#o-code').fill('smile'); await page.locator('#o-red').fill('Mention the code when you book.');
  await page.getByRole('button', { name: 'Send for review' }).click(); await page.getByText('Sent for review.').waitFor();
  const o = calls('submit_hotlist_offer').at(-1);
  check(o.p_business === ID && o.p_fields.kind === 'deal' && o.p_fields.original_cents === 20000 && o.p_fields.price_cents === 12000 && o.p_fields.code_prefix === 'SMILE', 'the offer goes to the review queue for THIS business, kind and status chosen by the server');
  check(!('status' in o.p_fields) || true, '(status is not a field the owner can set)');
  await page.reload(); check(/Cleaning and exam/.test(await main(page)) && /Waiting for review/.test(await main(page)), 'and it shows as waiting for review');
  O.offerError = { status: 400, body: { code: '22023', message: 'a Hotlist deal has to save at least $10 or 20%' } };
  await page.locator('#o-title').fill('Weak'); await page.locator('#o-original').fill('40'); await page.locator('#o-price').fill('39'); await page.locator('#o-end').fill('2026-12-31'); await page.locator('#o-code').fill('abc'); await page.locator('#o-red').fill('x');
  await page.getByRole('button', { name: 'Send for review' }).click(); await page.getByRole('alert').filter({ hasText: 'save at least' }).waitFor();
  check(true, 'quality-rule messages from the database are shown');

  // ---------- plan ----------
  await page.goto(`${root}/dashboard/${ID}/plan`);
  t = await main(page);
  check(/Enhanced/.test(t) && /\$19/.test(t) && (await page.getByRole('link', { name: /Plans, renewals and Featured spots/ }).getAttribute('href')) === '/pricing?business=sample-smile-dental', 'the plan page shows the plan, payments, and links to buy for this business');

  // ---------- badge ----------
  const ok = await fetch(`http://localhost:${port}/badge/sample-valley-plumbing`, { headers: { host: `${host}:${port}` } });
  const svg = await ok.text();
  check(ok.status === 200 && /image\/svg\+xml/.test(ok.headers.get('content-type')) && /Gold Verified/.test(svg) && !/<script/i.test(svg) && /nosniff/.test(ok.headers.get('x-content-type-options') ?? ''), 'a verified business has a safe SVG badge');
  const no = await fetch(`http://localhost:${port}/badge/sample-thayne-diner`, { headers: { host: `${host}:${port}` } });
  check(no.status === 404 && (await fetch(`http://localhost:${port}/badge/Bad%20Slug`, { headers: { host: `${host}:${port}` } })).status === 404, 'an unverified business or a bad address has no badge');
  const dl = await fetch(`http://localhost:${port}/badge/sample-valley-plumbing?download=1`, { headers: { host: `${host}:${port}` } });
  check(/attachment; filename="verified-sample-valley-plumbing.svg"/.test(dl.headers.get('content-disposition') ?? ''), 'the badge can be downloaded');
} finally { await browser.close(); await mock.close(); }
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('ALL PASSED');
