// Claim by emailed link, in a REAL browser against the Supabase + Postmark MOCK.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon SUPABASE_SERVICE_ROLE_KEY=service-secret \
//   POSTMARK_BUSINESS_SERVER_TOKEN=pm-token EMAIL_FROM_BUSINESS='Star Valley Local <business@biz.example.test>' POSTMARK_API_BASE=http://localhost:54399 \
//   npm run dev -- -p 3101          (fixtures mode, `npm run fixtures` first)
//   node scripts/e2e-claim-email.mjs [appPort] [host]
import { createRequire } from 'node:module';
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
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
const fx = JSON.parse(readFileSync('.fixtures/directory.json', 'utf8'));
const dental = fx.businesses.find((b) => b.slug === 'sample-smile-dental');
state.destinationDigits = dental.phone.replace(/\D/g, '');
const calls = (n) => state.rpc.filter((c) => c.name === n);
const reset = (o = {}) => { Object.assign(state, { claims: {}, claimCancels: [], sms: [], emailHint: 'o•••@alpha.example', emailDestination: 'owner@alpha.example', noPhone: false, optionsNull: false, blockedEmail: null, nextToken: null, claimBiz: null }, o); state.rpc.length = 0; state.failNext = null; state.email.postmark.length = 0; state.email.postmarkReplies.length = 0; };

const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const as = async (tok) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } }); if (tok) { const [name, value] = cookieFor(tok).split('='); await ctx.addCookies([{ name, value, url: root }]); } return ctx.newPage(); };
const main = async (page) => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
const claimUrl = `${root}/list-your-business?claim=${dental.slug}`;
try {
  reset();
  let page = await as('tok-owner');
  // ---------- the choice ----------
  await page.goto(claimUrl);
  let t = await main(page);
  check(/Text message to \(•••\) •••-\d{4}/.test(t) && /Email to o•••@alpha\.example/.test(t), 'both options are offered, each masked');
  check((await page.getByRole('button', { name: 'Text me a code' }).count()) === 1 && (await page.getByRole('button', { name: 'Email me a link' }).count()) === 1, 'there is a button for each');
  check(!(await page.content()).includes('owner@alpha.example'), 'the full email address is never in the page');
  state.noPhone = true; await page.reload(); t = await main(page);
  check((await page.getByRole('button', { name: 'Text me a code' }).count()) === 0 && (await page.getByRole('button', { name: 'Email me a link' }).count()) === 1, 'no usable phone: only the email option');
  state.noPhone = false; state.emailHint = null; await page.reload();
  check((await page.getByRole('button', { name: 'Email me a link' }).count()) === 0 && (await page.getByRole('button', { name: 'Text me a code' }).count()) === 1, 'no email on file: only the text option');
  state.noPhone = true; await page.reload(); t = await main(page);
  check(/no phone number or email address/.test(t) && (await page.locator('main button[type="submit"]').count()) === 0, 'neither: told it cannot be verified online, no form');
  reset({ optionsNull: true }); await page.reload();
  check(/no phone number or email address/.test(await main(page)), 'if the database offers nothing, the page does not guess');
  reset();

  // ---------- asking for the link ----------
  await page.goto(claimUrl);
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await page.getByRole('heading', { name: 'Check your email' }).waitFor();
  check(calls('claim_start').at(-1)?.body.p_method === 'email_link', 'the claim is started with the email method');
  check(state.email.postmark.length === 1 && state.sms.length === 0, 'one email went out and no text message');
  const m = state.email.postmark[0];
  check(m.token === 'pm-token' && m.body.To === 'owner@alpha.example' && m.body.From.includes('business@biz.example.test') && m.body.MessageStream === 'outbound' && m.body.Tag === 'claim_link', 'it went from the business sender to the address on file');
  const link = /Confirm: (\S+)/.exec(m.body.TextBody)?.[1] ?? '';
  const lm = /^http:\/\/star-valley\.localhost:\d+\/list-your-business\/confirm\?c=([0-9a-f-]{36})&t=([0-9a-f]{64})$/.exec(link);
  check(!!lm, 'it contains a link to the confirm page with the claim id and a 256-bit token');
  check(/Check your email/.test(await main(page)) && /o•••@alpha\.example/.test(await main(page)) && !(await page.content()).includes(lm?.[2] ?? 'x'), 'the page says where it went (masked) and never shows the token');
  check(m.body.TrackOpens === false && m.body.TrackLinks === 'None', 'no tracking on the link');

  // ---------- opening the link does nothing by itself ----------
  const verifiesBefore = calls('claim_verify').length;
  const p2 = await as('tok-owner'); await p2.goto(link);
  await p2.getByRole('button', { name: 'Yes, I manage this business' }).waitFor();
  check(calls('claim_verify').length === verifiesBefore, 'merely opening the link does not verify (mail scanners open links)');
  check(/Sample Smile Dental/.test(await main(p2)) && /Signed in as/.test(await main(p2)), 'it shows which business and which account');
  check((await p2.locator('meta[name="referrer"]').getAttribute('content')) === 'no-referrer' && /noindex/.test((await p2.locator('meta[name="robots"]').getAttribute('content')) ?? ''), 'the page keeps the token out of Referer headers and search results');
  await p2.getByRole('button', { name: 'Yes, I manage this business' }).click();
  await p2.getByRole('heading', { name: "You're verified" }).waitFor();
  const v = calls('claim_verify').at(-1)?.body;
  check(v?.p_user === 'u-owner' && v.p_secret === lm?.[2] && v.p_claim === lm?.[1], 'pressing the button verifies as the signed-in user with the token from the link');
  check((await p2.getByRole('link', { name: 'View your listing' }).getAttribute('href')) === `/business/${dental.slug}`, 'and offers a link to the listing');
  await p2.reload(); check(/already verified/.test(await main(p2)), 'opening the link again says it is already verified');

  // ---------- who can use the link ----------
  reset(); await page.goto(claimUrl); await page.getByRole('button', { name: 'Email me a link' }).click(); await page.getByRole('heading', { name: 'Check your email' }).waitFor();
  const link2 = /Confirm: (\S+)/.exec(state.email.postmark[0].body.TextBody)[1];
  const anon = await as(null); await anon.goto(link2);
  check(/Sign in with the account you used/.test(await main(anon)), 'signed out: asked to sign in');
  const href = await anon.getByRole('link', { name: 'Sign in' }).getAttribute('href');
  check(decodeURIComponent(href).includes('next=/list-your-business/confirm?c=') && decodeURIComponent(href).includes(link2.split('t=')[1]), 'the sign-in link returns to the same confirm link afterwards');
  const other = await as('tok-sales'); await other.goto(link2);
  check(/not for the account you are signed in with/.test(await main(other)) && (await other.getByRole('button', { name: 'Yes, I manage this business' }).count()) === 0, 'a different account is refused and sees no confirm button');
  check(!(await other.content()).includes('Sample Smile Dental') , 'and learns nothing about the business');
  const bad = await as('tok-owner');
  for (const q of ['', '?c=x&t=y', `?c=${link2.match(/c=([0-9a-f-]{36})/)[1]}&t=${'A'.repeat(64)}`, `?c=${link2.match(/c=([0-9a-f-]{36})/)[1]}&t=${'a'.repeat(63)}`]) {
    await bad.goto(`${root}/list-your-business/confirm${q}`);
    check(/That link is not valid/.test(await main(bad)), `a malformed link is refused (${q.slice(0, 18) || 'empty'})`);
  }
  const before = calls('claim_verify').length;
  await bad.goto(`${root}/list-your-business/confirm?c=${link2.match(/c=([0-9a-f-]{36})/)[1]}&t=${'b'.repeat(64)}`);
  await bad.getByRole('button', { name: 'Yes, I manage this business' }).click();
  await bad.getByRole('alert').filter({ hasText: /./ }).and(bad.locator('main *')).waitFor();
  check(calls('claim_verify').length === before + 1 && state.claims[link2.match(/c=([0-9a-f-]{36})/)[1]].status === 'pending', 'a wrong token reaches the database as a wrong attempt and does not verify');

  // ---------- expired ----------
  const id2 = link2.match(/c=([0-9a-f-]{36})/)[1]; state.claims[id2].expired = true;
  await bad.goto(link2);
  check(/expired or was replaced/.test(await main(bad)) && /Ask for a new link/.test(await main(bad)), 'an expired link says so and offers a new one');

  // ---------- refusals when asking ----------
  reset({ blockedEmail: 'owner@alpha.example' }); await page.goto(claimUrl);
  await page.getByRole('button', { name: 'Email me a link' }).click(); await page.getByRole('alert').filter({ hasText: 'cannot email' }).waitFor();
  check(/cannot email the address/.test(await main(page)) && state.email.postmark.length === 0 && state.claimCancels.length === 1, 'a bounced address is not emailed, and the claim is cancelled');
  reset(); state.email.postmarkReplies = [{ status: 500, body: { Message: 'down' } }]; await page.goto(claimUrl);
  await page.getByRole('button', { name: 'Email me a link' }).click(); await page.getByRole('alert').filter({ hasText: 'could not send' }).waitFor();
  check(/could not send the email/.test(await main(page)) && state.claimCancels.length === 1 && !/down/.test(await main(page)), 'if sending fails the claim is cancelled and the user gets a plain message');
  reset(); state.claimStartError = { status: 400, body: { code: '22023', message: 'there is no email address on file for this business' } };
  await page.goto(claimUrl); await page.getByRole('button', { name: 'Email me a link' }).click(); await page.getByRole('alert').filter({ hasText: 'no email address on file' }).waitFor();
  check(/no email address on file/.test(await main(page)) && state.email.postmark.length === 0, 'a rule message from the database is shown');
  state.claimStartError = null;
  reset(); await page.goto(claimUrl); await page.getByRole('button', { name: 'Email me a link' }).click(); await page.getByRole('heading', { name: 'Check your email' }).waitFor();
  await page.getByRole('button', { name: /different method/ }).click();
  check((await page.getByRole('button', { name: 'Text me a code' }).count()) === 1, 'the user can go back and choose the text option instead');

  // ---------- text still works ----------
  reset(); await page.goto(claimUrl); await page.getByRole('button', { name: 'Text me a code' }).click();
  await page.locator('#code').waitFor();
  check(calls('claim_start').at(-1)?.body.p_method === 'sms_code' && state.email.postmark.length === 0, 'the text option still starts an SMS claim and sends no email');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal overflow at 390px');
} catch (e) { console.log('FAIL - unexpected error:', e.message.split('\n').slice(0, 6).join(' | ')); failed++; }
await browser.close(); mock.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
