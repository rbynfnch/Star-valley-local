// The public claim flow in a REAL browser (Playwright + headless Chromium) against the Supabase + Twilio MOCK.
// Proves our wiring (sign-in, claim page states, SMS request, code entry, failure paths), not real Supabase/Twilio.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon SUPABASE_SERVICE_ROLE_KEY=service-secret \
//   TWILIO_ACCOUNT_SID=ACtest TWILIO_AUTH_TOKEN=tw-token TWILIO_FROM_NUMBER=+13075550100 TWILIO_API_BASE=http://localhost:54399 \
//   npm run dev -- -p 3101          (fixtures mode, `npm run fixtures` first)
//   node scripts/e2e-claim.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVICE_KEY, startMock, state } from './mock-supabase.mjs';

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
const dental = fx.businesses.find((b) => b.slug === 'sample-smile-dental');   // unclaimed, has a phone
const plumber = fx.businesses.find((b) => b.slug === 'sample-valley-plumbing'); // already claimed
const digits = dental.phone.replace(/\D/g, '');
state.destinationDigits = digits;

const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  const claimUrl = `${root}/list-your-business?claim=${dental.slug}`;
  const text = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

  // ---- states that need no sign-in ----
  let r = await page.goto(`${root}/list-your-business?claim=no-such-business`); check(r.status() === 404, 'an unknown business is a 404');
  r = await page.goto(`${root}/list-your-business?claim=Bad%20Slug`); check(r.status() === 404, 'a malformed slug is a 404');
  await page.goto(`${root}/list-your-business?claim=${plumber.slug}`);
  check(/already been claimed/.test(await text()) && (await page.getByRole('button', { name: 'Text me a code' }).count()) === 0, 'an already-claimed business offers no claim form');
  await page.goto(`${root}/list-your-business`);
  check(/Find your business/.test(await text()), 'the bare page explains how to start from a business');

  // ---- signed out ----
  await page.goto(claimUrl);
  check(/Sign in or create a free account/.test(await text()) && (await page.getByRole('button', { name: 'Text me a code' }).count()) === 0, 'signed out: asked to sign in first, no claim form');
  const html = await page.content();
  check(!html.includes(digits) && !html.includes(dental.phone.replace(/\D/g, '').slice(0, 6)), 'the page never prints the full phone number');

  // ---- sign in ----
  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.locator('#email').waitFor();
  check(page.url().includes('/account/sign-in?next=%2Flist-your-business%3Fclaim%3D' + dental.slug), 'the sign-in link carries a safe return path');
  await page.locator('#email').fill('owner@example.test'); await page.locator('#password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('alert').filter({ hasText: 'did not match' }).waitFor();
  check(true, 'a wrong password gives one generic message');
  await page.locator('#password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/list-your-business?claim=' + dental.slug);
  check(/Signed in as owner@example\.test/.test(await text()), 'after signing in you land back on the claim page');
  check((await text()).includes('(•••) •••-' + digits.slice(-4)) && !(await page.content()).includes(dental.phone), 'the phone is masked to its last four digits');

  // ---- start the claim ----
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await page.locator('#code').waitFor();
  const start = state.rpc.filter((c) => c.name === 'claim_start').at(-1);
  check(start?.body.p_business === dental.id && start?.body.p_user === 'u-owner' && start?.body.p_method === 'sms_code' && start?.body.p_tenant, 'claim_start got the business id from the server, and the signed-in user');
  check(start?.key === SERVICE_KEY, 'claim_start ran with the service key (not the user token)');
  const sms = state.sms.at(-1);
  check(sms?.to === '+1' + digits && sms?.from === '+13075550100', 'the text went to the number on file, from the configured sender');
  check(sms?.auth === 'Basic ' + Buffer.from('ACtest:tw-token').toString('base64'), 'Twilio was called with basic auth from the environment');
  check(/482913/.test(sms?.body ?? '') && /Sample Smile Dental/.test(sms?.body ?? '') && /10 minutes/.test(sms?.body ?? ''), 'the message names the business, the code and the expiry');
  check(!(await page.content()).includes('482913'), 'the code is never in the page');
  check(/texted a 6-digit code/.test(await text()), 'step 2 asks for the code');

  // ---- wrong and malformed codes ----
  const verifyCalls = () => state.rpc.filter((c) => c.name === 'claim_verify').length;
  await page.locator('#code').fill('abc');
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.getByRole('alert').filter({ hasText: 'Enter the 6-digit code' }).waitFor();
  check(verifyCalls() === 0, 'a malformed code never reaches the database (no attempt used)');
  await page.locator('#code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.getByRole('alert').filter({ hasText: '4 tries left' }).waitFor();
  check(verifyCalls() === 1, 'a wrong code shows how many tries are left');
  // ---- right code ----
  await page.locator('#code').fill('482 913');
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.getByText("You're verified").waitFor();
  const v = state.rpc.filter((c) => c.name === 'claim_verify').at(-1);
  check(v?.body.p_secret === '482913' && v?.body.p_user === 'u-owner' && v?.key === SERVICE_KEY, 'the cleaned code and the user went to claim_verify (service key)');
  check(await page.getByRole('link', { name: 'View your listing' }).isVisible() && /coming soon/.test(await text()), 'success shows a link to the listing and is honest that owner tools are coming');

  // ---- failure paths ----
  state.smsFail = true;
  await page.goto(claimUrl);
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await page.getByRole('alert').filter({ hasText: 'could not send the text' }).waitFor();
  check(state.claimCancels.length === 1 && !(await page.content()).includes('+13075550111'), 'a failed text cancels the claim and leaks nothing from the provider');
  state.smsFail = false;
  state.claimStartError = { status: 400, body: { code: '53400', message: 'a code was just sent; wait a minute before asking for another' } };
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await page.getByRole('alert').filter({ hasText: 'A code was just sent; wait a minute' }).waitFor();
  check(true, 'a rate-limit message from the database is shown readably');
  state.claimStartError = { status: 500, body: { code: 'XX000', message: 'relation "claims" exploded' } };
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await page.getByRole('alert').filter({ hasText: 'did not work' }).waitFor();
  check(!(await page.content()).includes('exploded'), 'an unexpected database error never leaks its message');
  state.claimStartError = null;

  // ---- sign-up page ----
  await page.goto(`${root}/account/sign-up?next=${encodeURIComponent('/list-your-business?claim=' + dental.slug)}`);
  await page.locator('#email').fill('new@example.test'); await page.locator('#password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('alert').filter({ hasText: 'at least 10 characters' }).waitFor();
  check(state.signups.length === 0, 'a short password is refused before reaching Supabase');
  await page.locator('#password').fill('a-long-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('status').filter({ hasText: 'Check your email' }).waitFor();
  check(state.signups.length === 1 && state.signups[0].email === 'new@example.test', 'sign-up asks Supabase to create the account and tells the visitor to confirm by email');
  await page.goto(`${root}/account/sign-in?next=${encodeURIComponent('https://evil.example')}`);
  check((await page.locator('input[name=next]').inputValue()) === '/', 'an off-site next is replaced with the home page');
  await page.goto(`${root}/account/sign-in?next=${encodeURIComponent('/admin')}`);
  check((await page.locator('input[name=next]').inputValue()) === '/', 'a public sign-in never sends you to /admin');

  // ---- layout ----
  await page.goto(claimUrl);
  check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, 'no horizontal scroll at 390px');
} catch (e) { console.error(e); failed++; }
finally { await browser.close(); mock.close(); }
if (failed) { console.error(`\n${failed} claim e2e check(s) failed`); process.exit(1); }
console.log('\nall claim e2e checks passed');
