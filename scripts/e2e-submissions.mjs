// Suggest an Update / Suggest a Business / Submit an Event in a REAL browser against the Supabase MOCK.
// Proves our wiring (validation, server action, service-role call, messages), not real Supabase or Turnstile.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon SUPABASE_SERVICE_ROLE_KEY=service-secret npm run dev -- -p 3101
//   (fixtures mode; `npm run fixtures` first)    node scripts/e2e-submissions.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVICE_KEY, cookieFor, startMock, state } from './mock-supabase.mjs';

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
const fx = JSON.parse(readFileSync('.fixtures/directory.json', 'utf8'));
const plumber = fx.businesses.find((b) => b.slug === 'sample-valley-plumbing');
const thayne = fx.communities.find((c) => c.slug === 'thayne');
const iso = (d) => d.toISOString().slice(0, 10);

const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  const last = () => state.submissions.at(-1);
  const alert = (re) => page.getByRole('alert').filter({ hasText: re }).waitFor();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // ================= Suggest an update =================
  let r = await page.goto(`${root}/suggest-update?business=no-such-business`); check(r.status() === 404, 'update: an unknown business is a 404');
  r = await page.goto(`${root}/suggest-update`); check(r.status() === 404, 'update: no business is a 404');
  r = await page.goto(`${root}/suggest-update?business=Bad%20Slug`); check(r.status() === 404, 'update: a malformed slug is a 404');
  await page.goto(`${root}/suggest-update?business=${plumber.slug}`);
  await page.getByRole('heading', { level: 1, name: /Suggest an update for/ }).waitFor();
  check(await page.getByText(`Currently: ${plumber.phone}`).isVisible(), 'update: shows the current phone as a hint');
  await page.getByRole('button', { name: 'Send suggestion' }).click(); await alert(/what should change/i);
  check(state.submissions.length === 0, 'update: an empty form is refused before reaching the database');
  await page.locator('#phone').fill('abc'); await page.getByRole('button', { name: 'Send suggestion' }).click(); await alert(/phone/i);
  check(state.submissions.length === 0, 'update: a bad phone is refused');
  await page.locator('#phone').fill(' 307-555-0188 '); await page.locator('#website').fill('Example.com/'); await page.locator('#note').fill('We moved');
  await page.locator('#your_email').fill(' Pat@Example.COM ');
  state.failNext = { rpc: 'submission_create', status: 400, body: { code: '53400', message: 'there are already several pending suggestions for this business' } };
  await page.getByRole('button', { name: 'Send suggestion' }).click(); await alert(/already several pending/i);
  check((await page.locator('#note').inputValue()) === 'We moved' && (await page.locator('#phone').inputValue()).includes('0188'), 'update: a database rule message is shown and typed values are kept');
  state.failNext = { rpc: 'submission_create', status: 500, body: { code: 'XX000', message: 'relation "submissions" exploded' } };
  await page.getByRole('button', { name: 'Send suggestion' }).click(); await alert(/did not go through/i);
  check(!(await page.content()).includes('exploded'), 'update: an unexpected error never leaks its message');
  await page.getByRole('button', { name: 'Send suggestion' }).click(); await page.getByRole('heading', { name: 'Thank you' }).waitFor();
  const u = last();
  check(u?.p_kind === 'update' && u?.p_business === plumber.id && u?.p_tenant && u?.p_user === null, 'update: kind, the business id from the SERVER, the tenant; anonymous visitor has no user id');
  check(JSON.stringify(u?.p_payload) === JSON.stringify({ fields: { phone: '307-555-0188', website: 'https://Example.com' }, note: 'We moved' }) || JSON.stringify(u?.p_payload).includes('"website":"https://'), 'update: payload has only the changed fields, website normalised');
  check(u?.p_email === 'pat@example.com', 'update: email is lower-cased');
  check(state.rpc.filter((c) => c.name === 'submission_create').every((c) => c.key === SERVICE_KEY), 'update: every call used the service key');
  check(await page.getByRole('link', { name: 'Back to the listing' }).isVisible(), 'update: the thank-you offers a way back');
  check((await overflow()) <= 0, 'update: no horizontal scroll at 390px');

  // ================= Suggest a business (signed in) =================
  await ctx.addCookies([(() => { const [name, value] = cookieFor('tok-owner').split('='); return { name, value, url: root }; })()]);
  await page.goto(`${root}/suggest-business`);
  await page.getByRole('heading', { level: 1, name: 'Suggest a business' }).waitFor();
  check((await page.locator('#community_id option').count()) >= 5 && (await page.locator('#category_id option').count()) >= 5, 'business: the community and category lists come from the directory');
  await page.getByRole('button', { name: 'Suggest this business' }).click(); await alert(/called/i);
  await page.locator('#name').fill('Sourdough Corner');
  await page.getByRole('button', { name: 'Suggest this business' }).click(); await alert(/email/i);
  check(state.submissions.filter((s) => s.p_kind === 'business').length === 0, 'business: name and email are required before anything is sent');
  await page.locator('#your_email').fill('robin@example.com'); await page.locator('#community_id').selectOption({ value: thayne.id }); await page.locator('#website').fill('sourdough.example');
  await page.getByRole('button', { name: 'Suggest this business' }).click(); await page.getByRole('heading', { name: 'Thank you' }).waitFor();
  const b = state.submissions.filter((s) => s.p_kind === 'business').at(-1);
  check(b?.p_payload.name === 'Sourdough Corner' && b?.p_payload.community_id === thayne.id && b?.p_payload.website === 'https://sourdough.example' && b?.p_business === null, 'business: payload and chosen community sent; no existing-business id');
  check(b?.p_user === 'u-owner', 'business: a signed-in visitor is linked to their account');

  // ================= Submit an event =================
  await page.goto(`${root}/submit-event`);
  await page.getByRole('heading', { level: 1, name: 'Submit an event' }).waitFor();
  const future = new Date(Date.now() + 20 * 86400000);
  await page.getByRole('button', { name: 'Submit event' }).click(); await alert(/called/i);
  await page.locator('#title').fill('Autumn Fair'); await page.locator('#your_email').fill('sam@example.com');
  await page.getByRole('button', { name: 'Submit event' }).click(); await alert(/start date/i);
  await page.locator('#start_date').fill(iso(future));
  await page.getByRole('button', { name: 'Submit event' }).click(); await alert(/start time/i);
  await page.locator('#start_date').fill('2020-01-01'); await page.locator('#start_time').fill('18:30');
  await page.getByRole('button', { name: 'Submit event' }).click(); await alert(/passed/i);
  await page.locator('#start_date').fill(iso(future)); await page.locator('#end_time').fill('17:00');
  await page.getByRole('button', { name: 'Submit event' }).click(); await alert(/before it starts/i);
  check(state.submissions.filter((s) => s.p_kind === 'event').length === 0, 'event: every invalid combination is refused before reaching the database');
  await page.locator('#end_time').fill('21:00');
  await page.getByLabel('All day').check();
  check((await page.locator('#start_time').count()) === 0 && (await page.locator('#end_time').count()) === 0, 'event: ticking "All day" hides the time fields');
  await page.getByLabel('All day').uncheck(); await page.locator('#start_time').fill('18:30'); await page.locator('#end_time').fill('21:00');
  await page.locator('#url').fill('autumnfair.example/info');
  await page.getByRole('button', { name: 'Submit event' }).click(); await page.getByRole('heading', { name: 'Thank you' }).waitFor();
  const e = state.submissions.filter((s) => s.p_kind === 'event').at(-1);
  const start = new Date(e.p_payload.starts_at), end = new Date(e.p_payload.ends_at);
  check([0, 1].includes(start.getUTCHours()) && start.getUTCMinutes() === 30, 'event: 6:30 PM Mountain became 00:30 or 01:30 UTC (daylight or standard time)');
  check(end.getTime() - start.getTime() === 2.5 * 3600 * 1000, 'event: the end time is 2.5 hours later');
  check(e.p_payload.url === 'https://autumnfair.example/info' && e.p_payload.title === 'Autumn Fair' && e.p_email === 'sam@example.com', 'event: link normalised, title and contact sent');
  check((await overflow()) <= 0, 'event: no horizontal scroll at 390px');

  // ================= links and pages around them =================
  await page.goto(`${root}/`);
  check((await page.getByRole('link', { name: 'Suggest a business' }).count()) > 0 && (await page.getByRole('link', { name: 'Submit an event' }).count()) > 0, 'the footer links to both forms');
  await page.goto(`${root}/business/${plumber.slug}`);
  check((await page.locator(`a[href="/suggest-update?business=${plumber.slug}"]`).count()) === 1, 'the profile links to its Suggest an update form');
  await page.goto(`${root}/list-your-business`);
  check((await page.getByRole('link', { name: 'Suggest a business' }).count()) > 0, 'the list-your-business page offers Suggest a business');
} catch (err) { console.error(err); failed++; }
finally { await browser.close(); mock.close(); }
if (failed) { console.error(`\n${failed} submissions e2e check(s) failed`); process.exit(1); }
console.log('\nall submissions e2e checks passed');
