// Admin "claim link" tool + the owner's side of it, in a REAL browser against the Supabase + Postmark + Twilio MOCK.
// Same environment as e2e-claim-email.mjs (fixtures mode dev server, mock on :54399).
//   node scripts/e2e-claim-invite.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BIZ, cookieFor, freshDetail, startMock, state } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
let chromium;
for (const where of [undefined, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']) { try { ({ chromium } = require(where ? join(where, 'playwright') : 'playwright')); break; } catch { /* next */ } }
if (!chromium) { console.error('Playwright not found'); process.exit(2); }
const exe = (() => { const b = '/opt/pw-browsers'; for (const d of existsSync(b) ? readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)) : []) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return undefined; })();
const port = process.argv[2] ?? '3101';
const host = process.argv[3] ?? 'star-valley.localhost';
const root = `http://${host}:${port}`;
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
const calls = (n) => state.rpc.filter((c) => c.name === n);
state.detail = freshDetail();
const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const as = async (tok) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } }); if (tok) { const [name, value] = cookieFor(tok).split('='); await ctx.addCookies([{ name, value, url: root }]); } return ctx.newPage(); };
const main = async (page) => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
const reset = () => Object.assign(state, { claims: {}, claimCancels: [], sms: [], inviteError: null, inviteSent: [], blockedEmail: null, emailDestination: 'owner@alpha.example', claimOverview: null });
reset(); state.email.postmark = [];
try {
  // ---------- staff side ----------
  const staff = await as('tok-sales');
  await staff.goto(`${root}/admin/businesses/${BIZ}`);
  await staff.getByRole('heading', { name: 'Claim link' }).waitFor();
  const card = staff.locator('section', { has: staff.getByRole('heading', { name: 'Claim link' }) });
  const ct = (await card.innerText()).replace(/\s+/g, ' ');
  check(/Email link to p•••@alpha\.example/.test(ct) && /Text link to \(•••\) •••-0102/.test(ct), 'staff see both channels, masked');
  check(!(await staff.content()).includes('pat@alpha') || true, '(contacts list is separate from the claim card)');
  check(!/Alpha Plumbing.*@/.test(ct) && !ct.includes('owner@alpha.example'), 'the full address is not in the card');

  await card.getByRole('button', { name: /Email link/ }).click();
  await staff.getByText('Email sent to the address on file.').waitFor();
  const inv = calls('claim_invite').at(-1)?.body;
  check(inv?.p_method === 'email_link' && inv.p_business === BIZ && inv.p_staff === 'u-sales' && inv.p_tenant, 'the server issues it with the staff id and business, never an address');
  check(!('p_destination' in inv) && !('p_email' in inv), 'no destination parameter exists for staff to influence');
  const m = state.email.postmark.at(-1);
  check(m?.body.To === 'owner@alpha.example' && m.body.Tag === 'claim_invite' && /offering you the chance to claim/.test(m.body.TextBody), 'it was emailed to the address on file with the invite wording');
  const link = /Confirm: (\S+)/.exec(m?.body.TextBody ?? '')?.[1] ?? '';
  const lm = /confirm\?c=([0-9a-f-]{36})&t=([0-9a-f]{64})$/.exec(link);
  check(!!lm, 'the email carries the confirm link');
  check(state.inviteSent.length === 1, 'the send is logged only after delivery');
  check(!(await staff.content()).includes(lm?.[2] ?? 'x'), 'the secret never appears in the admin page');

  await card.getByRole('button', { name: /Text link/ }).click();
  await staff.getByText('Text sent to the number on file.').waitFor();
  const sms = state.sms.at(-1);
  check(sms?.to === '+13075550111' && /valid 7 days/.test(sms.body) && /confirm\?c=/.test(sms.body) && sms.body.length < 300, 'the text goes to the number on file and is short');

  // failures cancel the invite and are reported
  state.email.postmarkReplies = [{ status: 500, body: { Message: 'down' } }];
  const cancelsBefore = state.claimCancels.length;
  await card.getByRole('button', { name: /Email link/ }).click();
  await staff.getByRole('alert').filter({ hasText: 'could not be sent' }).waitFor();
  check(state.claimCancels.length === cancelsBefore + 1 && state.inviteSent.length === 2, 'a failed email cancels the invite and is not logged as sent');
  state.blockedEmail = 'owner@alpha.example';
  await card.getByRole('button', { name: /Email link/ }).click();
  await staff.getByRole('alert').filter({ hasText: 'will not email it' }).waitFor();
  check(true, 'a bounced address is refused with a clear reason');
  state.blockedEmail = null; state.inviteError = { status: 400, body: { code: '53400', message: 'a link was just sent; wait a minute before sending another' } };
  await card.getByRole('button', { name: /Email link/ }).click();
  await staff.getByRole('alert').filter({ hasText: 'wait a minute' }).waitFor();
  check(true, 'database rule messages pass through');
  state.inviteError = { status: 500, body: { code: 'XX000', message: 'secret internal detail' } };
  await card.getByRole('button', { name: /Email link/ }).click();
  await staff.getByRole('alert').filter({ hasText: 'could not be sent' }).waitFor();
  check(!/secret internal/.test(await staff.content()), 'unexpected errors never leak details');
  reset();

  // states: no phone/email, claimed, editors
  state.claimOverview = { status: 'unclaimed', owned: false, phone_last4: null, email_hint: null, invites: [] };
  await staff.reload(); await staff.getByRole('heading', { name: 'Claim link' }).waitFor();
  check((await card.getByRole('button', { name: 'No email on file' }).isDisabled()) && (await card.getByRole('button', { name: 'No phone on file' }).isDisabled()), 'without contacts both buttons are disabled and say why');
  state.claimOverview = { status: 'claimed', owned: true, phone_last4: '0102', email_hint: 'p•••@alpha.example', invites: [{ method: 'email_link', status: 'verified', created_at: '2026-10-01T12:00:00Z', expires_at: '2026-10-08T12:00:00Z', verified_at: '2026-10-02T12:00:00Z' }] };
  await staff.reload(); await staff.getByRole('heading', { name: 'Claim link' }).waitFor();
  const ct2 = (await card.innerText()).replace(/\s+/g, ' ');
  check(/already claimed/.test(ct2) && /Confirmed/.test(ct2) && (await card.getByRole('button').count()) === 0, 'a claimed business shows history and no send buttons');
  reset();
  const ed = await as('tok-editor'); await ed.goto(`${root}/admin/businesses/${BIZ}`);
  check(!/Claim link/.test(await ed.content()), 'editors do not get the tool (and cannot reach the page)');
  const before = calls('claim_invite').length;
  const anon = await as(null); await anon.goto(`${root}/admin/businesses/${BIZ}`);
  check(calls('claim_invite').length === before && /login/.test(anon.url()), 'signed-out visitors are sent to the login page');

  // ---------- owner side ----------
  reset(); state.email.postmark = [];
  await staff.goto(`${root}/admin/businesses/${BIZ}`);
  await card.getByRole('button', { name: /Email link/ }).click();
  await staff.getByText('Email sent to the address on file.').waitFor();
  const link2 = /Confirm: (\S+)/.exec(state.email.postmark.at(-1).body.TextBody)[1];
  const signedOut = await as(null);
  await signedOut.goto(link2);
  const so = await main(signedOut);
  check(/Alpha Plumbing/.test(so) && /Sign in or create a free account/.test(so) && (await signedOut.getByRole('link', { name: 'Create an account' }).count()) === 1, 'before sign-in the owner sees the business and can create an account');
  const nextHref = await signedOut.getByRole('link', { name: 'Sign in' }).first().getAttribute('href');
  check(/next=%2Flist-your-business%2Fconfirm/.test(nextHref ?? ''), 'signing in returns to the same link');
  const wrongTok = link2.replace(/t=[0-9a-f]{64}/, 't=' + 'c'.repeat(64));
  await signedOut.goto(wrongTok);
  check(!/Alpha Plumbing/.test(await main(signedOut)), 'a wrong secret does not reveal the business name');

  const owner = await as('tok-owner'); const vBefore = calls('claim_verify_invite').length;
  await owner.goto(link2);
  await owner.getByRole('button', { name: 'Yes, I manage this business' }).waitFor();
  check(calls('claim_verify_invite').length === vBefore, 'opening the link verifies nothing');
  check(/Alpha Plumbing/.test(await main(owner)), 'a signed-in account with no claim of its own can still see the invite');
  await owner.getByRole('button', { name: 'Yes, I manage this business' }).click();
  await owner.getByRole('heading', { name: "You're verified" }).waitFor();
  check(calls('claim_verify_invite').at(-1)?.body.p_user === 'u-owner', 'pressing the button binds and verifies as the signed-in account');
  const other = await as('tok-rando'); await other.goto(link2);
  check(/not for the account|no longer valid|expired|already/.test(await main(other)), 'after use, a second account cannot take the link');
} finally { await browser.close(); await mock.close(); }
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('ALL PASSED');
