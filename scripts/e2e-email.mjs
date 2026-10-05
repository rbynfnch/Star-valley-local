// The email delivery job: cron route, Postmark sending, bounce webhook and the admin queue page, against the Supabase + Postmark MOCK.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon SUPABASE_SERVICE_ROLE_KEY=service-secret \
//   CRON_SECRET=cron-secret-0123456789 POSTMARK_BUSINESS_SERVER_TOKEN=pm-token EMAIL_FROM_BUSINESS='Star Valley Local <business@biz.example.test>' \
//   POSTMARK_API_BASE=http://localhost:54399 POSTMARK_WEBHOOK_USER=pmhook POSTMARK_WEBHOOK_PASSWORD=webhook-pass-12345 npm run dev -- -p 3101
//   node scripts/e2e-email.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BIZ, cookieFor, freshEmailQueue, startMock, state } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
let chromium;
for (const where of [undefined, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']) { try { ({ chromium } = require(where ? join(where, 'playwright') : 'playwright')); break; } catch { /* next */ } }
if (!chromium) { console.error('Playwright not found (install it globally, e.g. npm i -g playwright)'); process.exit(2); }
const exe = (() => { const b = '/opt/pw-browsers'; for (const d of existsSync(b) ? readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)) : []) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return undefined; })();

const port = process.argv[2] ?? '3101';
const host = process.argv[3] ?? 'star-valley.localhost';
const root = `http://${host}:${port}`;
const CRON = 'cron-secret-0123456789', HOOK = 'Basic ' + Buffer.from('pmhook:webhook-pass-12345').toString('base64');
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
const T = '3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b';
const queued = (id, kind, over = {}) => ({ id, kind, recipient_email: `${id}@owner.example.test`, attempts: 1, payload: { business_name: 'Alpha Plumbing', ends_at: '2026-12-01T07:00:00Z', due_at: '2026-12-01T07:00:00Z', days_left: 7, ...over },
  tenant: { id: T, slug: 'star-valley', name: 'Star Valley Local', mailing_address: '1 Main St, Afton, WY 83110', contact_email: 'hello@svl.example.test', timezone: 'America/Denver', domain: 'starvalleylocal.example' }, business: { id: BIZ, slug: 'alpha-plumbing', name: 'Alpha Plumbing' } });
const reset = () => { Object.assign(state.email, { batches: [], completes: [], fails: [], suppressions: [], maintenance: 0, maintenanceFails: false, retries: [], retryError: null, postmark: [], postmarkReplies: [], queueView: freshEmailQueue() }); state.failNext = null; state.failNextSuppression = false; };
const cron = (headers = {}, qs = '', method = 'POST') => fetch(`http://localhost:${port}/api/cron/email${qs}`, { method, headers: { host: `${host}:${port}`, ...headers } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cache: r.headers.get('cache-control') }));
const hook = (body, auth = HOOK) => fetch(`http://localhost:${port}/api/webhooks/postmark`, { method: 'POST', headers: { host: `${host}:${port}`, 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
try {
  reset();
  // ---------- the cron route is locked ----------
  let r = await cron();
  check(r.status === 401 && r.cache === 'no-store', 'cron: no credentials is 401');
  r = await cron({ authorization: 'Bearer wrong-secret-0123456789' }); check(r.status === 401, 'cron: a wrong secret is 401');
  r = await cron({ authorization: `Bearer ${CRON}x` }); check(r.status === 401, 'cron: a near-miss secret is 401');
  r = await cron({ authorization: `Bearer ${CRON}` }, '', 'GET'); check(r.status === 200, 'cron: GET works too (schedulers that only GET)');
  check(state.email.maintenance === 1 && state.rpc.every((c) => c.name !== 'email_claim_batch' || c.key === 'service-secret'), 'cron: the job ran maintenance and uses the service key only');
  reset();

  // ---------- a normal run ----------
  state.email.batches = [[queued('n1', 'placement_renewal_reminder'), queued('n2', 'verification_reminder')]];
  r = await cron({ authorization: `Bearer ${CRON}` });
  check(r.status === 200 && r.body.sent === 2 && r.body.retried === 0 && r.body.failed === 0 && r.body.maintenance === 'ok', 'a run sends everything claimed and reports it');
  check(state.email.maintenance === 1, 'the daily reminders were queued first');
  check(state.email.postmark.length === 2 && state.email.postmark.every((m) => m.token === 'pm-token'), 'both went to Postmark with the business server token');
  const m1 = state.email.postmark[0].body;
  check(m1.From === 'Star Valley Local <business@biz.example.test>' && m1.To === 'n1@owner.example.test' && m1.MessageStream === 'outbound' && m1.Tag === 'placement_renewal_reminder', 'sender, recipient, stream and tag are right');
  check(m1.Metadata.notification_id === 'n1' && m1.Metadata.tenant_id === T && m1.TrackOpens === false, 'metadata ties the email back to its row and tenant; no tracking');
  check(/Alpha Plumbing/.test(m1.Subject) && /pricing/.test(m1.TextBody) && /1 Main St/.test(m1.TextBody) && /<a href="https:\/\/starvalleylocal\.example\/pricing"/.test(m1.HtmlBody), 'the content names the business, links to pricing, and carries the address');
  check(state.email.completes.length === 2 && state.email.completes[0].p_message_id === 'pm-1', 'each row was completed with Postmark\'s message id');

  // ---------- failures ----------
  reset();
  state.email.batches = [[queued('a', 'listing_renewal_reminder'), queued('b', 'listing_renewal_reminder'), queued('c', 'listing_renewal_reminder'), queued('d', 'staff_no_contact_alert')]];
  state.email.postmarkReplies = [{ status: 500, body: { Message: 'down' } }, { status: 422, body: { ErrorCode: 406, Message: 'Inactive recipient' } }];
  r = await cron({ authorization: `Bearer ${CRON}` }, '?maintenance=0');
  check(r.status === 200 && r.body.sent === 2 && r.body.retried === 1 && r.body.failed === 1 && r.body.maintenance === 'skipped', 'a 5xx is a retry, an inactive recipient is a permanent failure, the rest still send');
  check(state.email.maintenance === 0, '?maintenance=0 skips queueing');
  const fa = state.email.fails.find((f) => f.p_id === 'a'), fb = state.email.fails.find((f) => f.p_id === 'b');
  check(fa?.p_permanent === false && /postmark 500/.test(fa.p_error) && fb?.p_permanent === true && /#406/.test(fb.p_error), 'the database is told which is which, with the reason');
  check(!JSON.stringify(state.email.fails).includes('pm-token'), 'no secret appears in what is stored about a failure');
  check(/Staff: nobody to email/.test(state.email.postmark.at(-1).body.Subject) && /\/admin\/businesses\//.test(state.email.postmark.at(-1).body.TextBody), 'a staff alert goes out with an admin link');

  // ---------- maintenance failure does not block delivery; claim failure is reported ----------
  reset(); state.email.maintenanceFails = true; state.email.batches = [[queued('m1', 'verification_reminder')]];
  r = await cron({ authorization: `Bearer ${CRON}` });
  check(r.status === 200 && r.body.maintenance === 'error' && r.body.sent === 1, 'if queueing fails, already-queued mail is still delivered and the run says so');
  reset(); state.failNext = 'email_claim_batch';
  r = await cron({ authorization: `Bearer ${CRON}` });
  check(r.status === 500 && r.body.error === 'job failed' && !JSON.stringify(r.body).includes('boom'), 'a claim failure is a 500 with no internals');

  // ---------- unknown kind never reaches Postmark ----------
  reset(); state.email.batches = [[queued('x', 'newsletter')]];
  r = await cron({ authorization: `Bearer ${CRON}` }, '?maintenance=0');
  check(r.body.failed === 1 && state.email.postmark.length === 0 && state.email.fails[0]?.p_permanent === true, 'an email with no template fails permanently and is not sent');

  // ---------- webhook ----------
  reset();
  let h = await hook({ RecordType: 'Bounce', Type: 'HardBounce', Email: 'Gone@Owner.example.test', Metadata: { tenant_id: T } }, null);
  check(h.status === 401, 'webhook: no credentials is 401');
  h = await hook({ RecordType: 'Bounce' }, 'Basic ' + Buffer.from('pmhook:wrong-password-1').toString('base64')); check(h.status === 401, 'webhook: wrong password is 401');
  check(state.email.suppressions.length === 0, 'nothing was recorded for the refused calls');
  h = await hook({ RecordType: 'Bounce', Type: 'HardBounce', Email: 'Gone@Owner.example.test', Metadata: { tenant_id: T } });
  check(h.status === 200 && h.body.recorded && state.email.suppressions[0]?.p_email === 'gone@owner.example.test' && state.email.suppressions[0].p_reason === 'bounce' && state.email.suppressions[0].p_tenant === T, 'a hard bounce is recorded for the tenant, address lower-cased');
  h = await hook({ RecordType: 'SpamComplaint', Email: 'mad@owner.example.test' });
  check(state.email.suppressions[1]?.p_reason === 'complaint' && state.email.suppressions[1].p_tenant === null, 'a complaint without our metadata suppresses the address everywhere');
  const n = state.email.suppressions.length;
  h = await hook({ RecordType: 'Bounce', Type: 'SoftBounce', Email: 'busy@owner.example.test' }); check(h.status === 200 && h.body.ignored && state.email.suppressions.length === n, 'a soft bounce is acknowledged and ignored');
  h = await hook({ RecordType: 'Delivery', Recipient: 'ok@owner.example.test' }); check(h.status === 200 && h.body.ignored, 'delivery events are acknowledged and ignored');
  h = await hook('{not json'); check(h.status === 400, 'malformed JSON is 400');
  state.failNextSuppression = true;
  h = await hook({ RecordType: 'SpamComplaint', Email: 'again@owner.example.test' }); check(h.status === 500, 'when recording fails the webhook answers 500 so Postmark retries');

  // ---------- admin queue page ----------
  reset();
  const ctxAs = async (tok) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 1000 } }); const [name, value] = cookieFor(tok).split('='); await ctx.addCookies([{ name, value, url: root }]); return ctx.newPage(); };
  let page = await ctxAs('tok-editor'); await page.goto(`${root}/admin/email`);
  check(page.url().endsWith('/admin'), 'editor: the email page sends you back to the dashboard');
  page = await ctxAs('tok-sales'); await page.goto(`${root}/admin/email`);
  await page.getByRole('heading', { level: 1, name: 'Email queue' }).waitFor();
  const text = await page.locator('main').innerText();
  check(/1\s+Failed/.test(text) && /2\s+Waiting or sending/.test(text) && /14\s+Sent in 7 days/.test(text), 'counts are shown');
  const items = page.locator('main li');
  check((await items.first().innerText()).includes('Placement renewal reminder') && (await items.first().innerText()).includes('Failed'), 'the failed email is listed first');
  check((await page.locator('main').innerHTML()).includes('Inactive recipient &lt;b&gt;x&lt;/b&gt;') && (await page.locator('main b').count()) === 0, 'an error message with markup is shown as text');
  check((await page.getByRole('button', { name: 'Retry' }).count()) === 1, 'only the failed email has a Retry button');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal overflow at 390px with a very long address');
  state.email.retryError = 'only a failed email can be retried';
  await page.getByRole('button', { name: 'Retry' }).click(); await page.getByRole('alert').filter({ hasText: 'Only a failed email can be retried.' }).waitFor();
  check(state.email.retries.length === 0, 'a refused retry shows the rule\'s message');
  state.email.retryError = null;
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Inactive recipient') && document.querySelectorAll('main li').length === 3);
  check(state.email.retries[0] === 'e0000000-0000-4000-8000-000000000001', 'Retry asks the database to requeue exactly that email');
  check((await page.getByRole('button', { name: 'Retry' }).count()) === 0, 'and after the page refreshes it is no longer failed');
  check((await page.locator('nav').first().innerText()).includes('Email'), 'the admin nav links to Email');
} catch (e) { console.log('FAIL - unexpected error:', e.message.split('\n').slice(0, 6).join(' | ')); failed++; }
await browser.close(); mock.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
