// Drives the business-detail forms in a REAL browser (Playwright + headless Chromium) against the Supabase MOCK.
// Dev tool only: Playwright is NOT a project dependency; this uses the globally installed copy.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npm run dev -- -p 3101
//   node scripts/e2e-admin-forms.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BIZ, cookieFor, freshDetail, startMock, state } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
let chromium;
for (const where of [undefined, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']) {
  try { ({ chromium } = require(where ? join(where, 'playwright') : 'playwright')); break; } catch { /* next */ }
}
if (!chromium) { console.error('Playwright not found (install it globally, e.g. npm i -g playwright)'); process.exit(2); }
const exe = (() => { const b = '/opt/pw-browsers'; for (const d of existsSync(b) ? readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)) : []) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return undefined; })();

const port = process.argv[2] ?? '3101';
const host = process.argv[3] ?? 'star-valley.localhost';
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
const rpcs = (name) => state.rpc.filter((c) => c.name === name);

state.detail = freshDetail();
const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, extraHTTPHeaders: {} });
  const [name, value] = cookieFor('tok-sales').split('=');
  await ctx.addCookies([{ name, value: value, url: `http://${host}:${port}` }]);
  const page = await ctx.newPage();
  await page.route('**/*', (route) => route.continue());
  await page.goto(`http://${host}:${port}/admin/businesses/${BIZ}`);
  await page.getByRole('heading', { name: 'Alpha Plumbing', level: 1 }).waitFor();

  // ---- lead stage ----
  check((await page.locator('#stage').inputValue()) === 'interested', 'stage select starts at the current stage');
  check((await page.locator('#lost_reason').count()) === 0, 'no "why lost" field unless the stage is Lost');
  await page.locator('#stage').selectOption('lost');
  await page.locator('#lost_reason').waitFor();
  check(true, 'choosing Lost reveals the reason field');
  await page.locator('#lost_reason').fill('went with a cousin');
  await page.getByRole('button', { name: 'Save stage' }).click();
  await page.getByText('Lead stage updated.').waitFor();
  const st = rpcs('set_lead_stage').at(-1)?.body;
  check(st?.p_stage === 'lost' && st?.p_lost_reason === 'went with a cousin' && st?.p_business === BIZ && st?.p_tenant, 'the RPC got stage, reason, business and tenant');
  await page.reload(); await page.locator('#stage').waitFor();
  check((await page.locator('#stage').inputValue()) === 'lost', 'after a reload the new stage is shown');

  // ---- entry form: validation ----
  const before = rpcs('add_communication').length;
  await page.getByRole('button', { name: 'Add to log' }).click();
  await page.getByRole('alert').filter({ hasText: 'Write something' }).waitFor();
  check(rpcs('add_communication').length === before, 'an empty entry shows a message and never calls the database');

  // ---- entry form: a visit ----
  check((await page.locator('#outcome').count()) === 0, 'the outcome field only appears for a visit');
  await page.locator('#kind').selectOption('visit');
  await page.locator('#outcome').selectOption('pitched');
  await page.locator('#subject').fill('Stopped in');
  await page.locator('#body').fill('Showed the badge.\nWants a quote.');
  await page.locator('#follow_up').fill('2026-12-10');
  await page.getByRole('button', { name: 'Add to log' }).click();
  await page.getByText('Saved to the log.').waitFor();
  const c = rpcs('add_communication').at(-1)?.body;
  check(c?.p_kind === 'visit' && c?.p_outcome === 'pitched' && c?.p_subject === 'Stopped in' && c?.p_body === 'Showed the badge.\nWants a quote.', 'the RPC got kind, outcome, subject and the multi-line note');
  check(c?.p_follow_up_at === '2026-12-10T16:00:00.000Z', 'follow-up date became 9:00 AM Mountain (16:00Z in December)');
  check((await page.locator('#body').inputValue()) === '' && (await page.locator('#subject').inputValue()) === '' && (await page.locator('#follow_up').inputValue()) === '', 'fields are cleared after a successful save');
  await page.getByText('Stopped in').first().waitFor();
  check(await page.getByText('Visit · Pitched · Stopped in').isVisible(), 'the new entry appears in the activity log without a manual reload');

  // ---- entry form: a failed save keeps what was typed ----
  await page.locator('#kind').selectOption('note');
  await page.locator('#body').fill('Long note typed on a bad connection');
  state.failNext = 'add_communication';
  await page.getByRole('button', { name: 'Add to log' }).click();
  await page.getByRole('alert').filter({ hasText: 'could not be saved' }).waitFor();
  check((await page.locator('#body').inputValue()) === 'Long note typed on a bad connection', 'after a failed save the typed note is still there');
  await page.getByRole('button', { name: 'Add to log' }).click();
  await page.getByText('Saved to the log.').waitFor();
  check(rpcs('add_communication').at(-1)?.body.p_body === 'Long note typed on a bad connection', 'retrying sends the same note');

  // ---- layout on a phone ----
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, 'no horizontal scroll at 390px');
} catch (e) { console.error(e); failed++; }
finally { await browser.close(); mock.close(); }
if (failed) { console.error(`\n${failed} e2e check(s) failed`); process.exit(1); }
console.log('\nall admin form e2e checks passed');
