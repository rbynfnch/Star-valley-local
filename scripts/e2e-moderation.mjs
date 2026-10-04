// The admin moderation queue in a REAL browser against the Supabase MOCK: roles, approve/apply/duplicate/reject/spam, errors, escaping.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npm run dev -- -p 3101
//   node scripts/e2e-moderation.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BIZ, SUB_IDS, cookieFor, freshModRows, startMock, state } from './mock-supabase.mjs';

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

const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const as = async (tok) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 1000 } });
  const [name, value] = cookieFor(tok).split('=');
  await ctx.addCookies([{ name, value, url: root }]);
  return ctx.newPage();
};
const reviews = () => state.rpc.filter((c) => c.name === 'review_submission');
const card = (page, re) => page.locator('li').filter({ hasText: re });
try {
  state.modRows = freshModRows();
  let page = await as('tok-sales');
  await page.goto(`${root}/admin/moderation`);
  await page.getByRole('heading', { level: 1, name: 'Moderation' }).waitFor();
  check((await page.locator('main ul > li').count()) === 4, 'sales: the queue shows the 4 pending submissions');
  check(await page.getByRole('link', { name: 'Suggested update (1)' }).isVisible() && await page.getByRole('link', { name: 'Submitted event (1)' }).isVisible(), 'the type chips show pending counts');
  check((await page.getByRole('link', { name: 'Pending' }).getAttribute('aria-current')) === 'page', 'the active status is marked for assistive tech');

  // update card
  const upd = card(page, /Suggested update for/);
  check(await upd.getByText('Says this business has closed for good').isVisible() && /Mon-Fri 8-5/.test(await upd.innerText()), 'update: shows the closed claim, the hours and the note');
  check((await upd.getByRole('link', { name: 'Alpha Plumbing' }).getAttribute('href')) === `/admin/businesses/${BIZ}`, 'update: links to the business in the admin');
  check(/phone, website/.test(await upd.getByLabel(/Apply the suggested/).evaluate((el) => el.parentElement.innerText)), 'update: the apply option names the fields (hours are not offered)');
  await upd.getByLabel('Notes').fill('Verified by phone');
  await upd.getByLabel(/Apply the suggested/).check();
  await upd.getByRole('button', { name: 'Approve' }).click();
  await page.getByText('Approved. Applied: phone, website.').waitFor();
  const a1 = reviews().at(-1)?.body;
  check(a1.p_id === SUB_IDS.update && a1.p_action === 'approve' && a1.p_apply === true && a1.p_force === false && a1.p_notes === 'Verified by phone' && a1.p_tenant, 'update: the RPC got id, approve, apply, notes and tenant');
  await page.waitForFunction(() => document.querySelectorAll('main ul > li').length === 3, null, { timeout: 10000 }).catch(() => {});
  check((await page.locator('main ul > li').count()) === 3, 'update: the card leaves the pending queue');

  // event card as sales: cannot approve
  const ev = card(page, /Submitted event/);
  check((await ev.getByRole('button', { name: 'Approve' }).count()) === 0 && /Only editors and admins can publish an event/.test(await ev.innerText()), 'sales: an event has no Approve button and says why');
  check(/Oct 17, 2026, 6:30 PM/.test(await ev.innerText()), 'event: times are shown in Mountain time');
  await ev.getByLabel('Notes').fill('Not for us'); await ev.getByRole('button', { name: 'Reject' }).click();
  await page.getByText('Rejected.').waitFor();
  check(reviews().at(-1).body.p_action === 'reject' && reviews().at(-1).body.p_notes === 'Not for us', 'sales: can still reject an event');

  // business with duplicate
  state.duplicateFor = [SUB_IDS.business];
  const biz = card(page, /Sourdough Corner/);
  await biz.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('alert').filter({ hasText: 'already in the directory' }).waitFor();
  check(reviews().at(-1).body.p_force === false && (await biz.getByRole('link', { name: 'Alpha Plumbing' }).getAttribute('href')) === `/admin/businesses/${BIZ}`, 'business: a duplicate is reported with a link to the existing business, nothing created');
  await biz.getByRole('button', { name: 'Add it anyway' }).click();
  await page.getByText('Approved. A hidden prospect was created.').waitFor();
  check(reviews().at(-1).body.p_force === true, 'business: "Add it anyway" resends with force');

  // escaping
  check((await page.locator('img[src="x"]').count()) === 0 && (await page.locator('b', { hasText: 'Eve' }).count()) === 0, 'hostile submission text is shown as text, never as HTML');
  check(/<img src=x onerror=alert\(1\)>/.test(await card(page, /Eve/).innerText()), '(and it is visible to the moderator exactly as sent)');
  await card(page, /Eve/).getByRole('button', { name: 'Spam' }).click();
  await page.getByText('Marked as spam.').waitFor();
  check(reviews().at(-1).body.p_action === 'spam', 'spam: marks as spam');
  await page.getByText('Nothing waiting for review.').waitFor();
  check(true, 'an empty queue says so');

  // reviewed lists and filters
  await page.goto(`${root}/admin/moderation?status=approved`);
  check((await page.locator('main ul > li').count()) === 2 && (await page.getByRole('button', { name: 'Approve' }).count()) === 0, 'approved list: reviewed cards have no action buttons');
  check(/Approved · /.test(await page.locator('main ul > li').first().innerText()), 'approved list: shows the decision and when');
  await page.goto(`${root}/admin/moderation?status=bogus&kind=nonsense`);
  check(await page.getByRole('link', { name: 'Pending' }).getAttribute('aria-current') === 'page', 'junk filters fall back to the pending queue');

  // errors
  state.modRows = freshModRows();
  await page.goto(`${root}/admin/moderation?kind=update`);
  state.failNext = { rpc: 'review_submission', status: 400, body: { code: '22023', message: 'this submission was already reviewed' } };
  await page.getByRole('button', { name: 'Reject' }).click();
  await page.getByRole('alert').filter({ hasText: 'This submission was already reviewed.' }).waitFor();
  check(true, 'a rule message from the database is shown readably');
  state.failNext = { rpc: 'review_submission', status: 500, body: { code: 'XX000', message: 'relation "submissions" exploded' } };
  await page.getByRole('button', { name: 'Reject' }).click();
  await page.getByRole('alert').filter({ hasText: 'could not be saved' }).waitFor();
  check(!(await page.content()).includes('exploded'), 'an unexpected error never leaks its message');
  check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, 'no horizontal scroll at 390px');

  // editor role
  state.modRows = freshModRows();
  page = await as('tok-editor');
  await page.goto(`${root}/admin/moderation`);
  await page.getByRole('heading', { level: 1, name: 'Moderation' }).waitFor();
  check((await card(page, /Submitted event/).getByRole('button', { name: 'Approve' }).count()) === 1, 'editor: can approve (publish) an event');
  check((await card(page, /Sourdough Corner/).getByRole('button', { name: 'Approve' }).count()) === 0 && /Only sales staff and admins can add a business/.test(await card(page, /Sourdough Corner/).innerText()), 'editor: cannot approve a business, and is told why');
  check((await card(page, /Suggested update for/).getByLabel(/Apply the suggested/).count()) === 0 && (await card(page, /Suggested update for/).getByRole('button', { name: 'Approve' }).count()) === 1, 'editor: can approve an update but is never offered "apply"');
  check((await page.getByRole('link', { name: 'Businesses' }).count()) === 0 && (await page.getByRole('link', { name: 'Moderation' }).count()) === 1, 'editor: the nav shows Moderation but not Businesses');

  // other roles
  page = await as('tok-rando'); const r = await page.goto(`${root}/admin/moderation`);
  check(page.url().includes('/admin/login') && !(await page.content()).includes('Sourdough'), 'a signed-in non-staff user is sent away and sees nothing');
  const anon = await browser.newPage(); await anon.goto(`${root}/admin/moderation`);
  check(anon.url().includes('/admin/login?next=%2Fadmin%2Fmoderation'), 'signed out: redirected to sign-in with a safe return path');
  void r;
} catch (err) { console.error(err); failed++; }
finally { await browser.close(); mock.close(); }
if (failed) { console.error(`\n${failed} moderation e2e check(s) failed`); process.exit(1); }
console.log('\nall moderation e2e checks passed');
