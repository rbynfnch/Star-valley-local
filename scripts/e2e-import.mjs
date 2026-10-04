// The admin CSV import wizard in a REAL browser against the Supabase MOCK: upload, column mapping, check, decisions, commit.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npm run dev -- -p 3101
//   node scripts/e2e-import.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BIZ, cookieFor, startMock, state } from './mock-supabase.mjs';

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
const CAT = '4f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b';

const CSV = [
  'Business Name,Phone,Town,Type,Website',
  'Aspen Electric,307-555-0142,Thayne,Plumbing,aspen.example',     // 2: create
  'Alpha Plumbing,(307) 555-0101,Afton,Plumbing,',                  // 3: already listed (name + phone)
  'Odd Name,,Nowhere,Basket Weaving,',                              // 4: needs a decision
  ',,Afton,,',                                                      // 5: no name
  '',                                                               // 6: blank line (skipped, numbering unchanged)
  'Aspen Electric,307-555-0142,Thayne,Plumbing,',                   // 7: duplicate of row 2 in the file
  'Explode,307-555-0999,Thayne,Plumbing,',                          // 8: create, but the database refuses it
].join('\n');

// 1400 other businesses come BEFORE the one the file duplicates: the duplicate lookup must read past the first 1000-row page.
state.existingBusinesses = [...Array.from({ length: 1400 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, name: `Filler Business ${i}`, phone_digits: null, address_line1: null })),
  { id: BIZ, name: 'Alpha Plumbing', phone_digits: '3075550101', address_line1: '1 Main St' }];
const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const as = async (tok) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 1000 } }); const [name, value] = cookieFor(tok).split('='); await ctx.addCookies([{ name, value, url: root }]); return ctx.newPage(); };
const upload = (page, name, content) => page.locator('#csv-file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(content) });
const alert = (page, re) => page.getByRole('alert').filter({ hasText: re }).waitFor();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).then((n) => n <= 0);
try {
  // ---- access ----
  let page = await as('tok-editor'); await page.goto(`${root}/admin/import`);
  check(page.url().endsWith('/admin'), 'editor: the import page sends you back to the dashboard');
  page = await as('tok-sales'); await page.goto(`${root}/admin/import`);
  await page.getByRole('heading', { level: 1, name: 'Import businesses' }).waitFor();
  check((await page.getByRole('link', { name: 'Import' }).count()) === 1, 'sales: the nav has Import');
  check((await page.getByRole('link', { name: 'Download a template' }).getAttribute('href')).startsWith('data:text/csv'), 'a template CSV is offered');

  // ---- bad files ----
  await page.getByRole('button', { name: 'Read the file' }).click(); await alert(page, /Choose a CSV file/);
  await upload(page, 'empty.csv', 'Name\n'); await page.getByRole('button', { name: 'Read the file' }).click(); await alert(page, /header row and at least one business/);
  await upload(page, 'broken.csv', 'Name\n"unterminated'); await page.getByRole('button', { name: 'Read the file' }).click(); await alert(page, /unterminated/i);
  await upload(page, 'binary.csv', 'Name\nA\u0000B'); await page.getByRole('button', { name: 'Read the file' }).click(); await alert(page, /does not look like a CSV/);
  await upload(page, 'big.csv', 'Name\n' + 'x'.repeat(1_200_000)); await page.getByRole('button', { name: 'Read the file' }).click(); await alert(page, /larger than 1 MB|could not be completed/);
  check(state.rpc.every((c) => c.name !== 'import_businesses'), 'bad files never reach the database');

  // ---- map ----
  await upload(page, 'list.csv', CSV); await page.getByRole('button', { name: 'Read the file' }).click();
  await page.getByRole('heading', { name: 'Match the columns' }).waitFor();
  check((await page.locator('#map-name').inputValue()) === '0' && (await page.locator('#map-phone').inputValue()) === '1' && (await page.locator('#map-website').inputValue()) === '4', 'columns are guessed from the headers');
  check(/6 rows/.test(await page.locator('main').innerText()) && (await page.getByText('Aspen Electric').first().isVisible()), 'the file name, row count and first rows are shown');
  check(await noOverflow(page), 'mapping step: no horizontal scroll at 390px');
  await page.locator('#map-name').selectOption('');
  await page.getByRole('button', { name: 'Check the file' }).click(); await alert(page, /which column holds the business name/);
  await page.locator('#map-name').selectOption('0');
  await page.locator('#map-community').selectOption('2'); await page.locator('#map-category').selectOption('3');

  // ---- check ----
  await page.getByRole('button', { name: 'Check the file' }).click();
  await page.getByRole('heading', { name: 'Check before importing' }).waitFor();
  check(/2 will be added, 1 need your decision, 2 are already listed, 1 cannot be imported\./.test(await page.getByRole('status').innerText()), 'the summary counts every kind of row');
  const text = await page.locator('main').innerText();
  check(/Row 7:.*Aspen Electric/s.test(text) && /duplicate of line 2 in this file/.test(text), 'row numbers match the spreadsheet (blank row 6 skipped); the in-file duplicate points at row 2');
  check(/category "Basket Weaving" not recognised/.test(text) && /community "Nowhere" not recognised/.test(text), 'a review row says exactly why');
  check(/no business name/.test(text), 'an invalid row says why');
  check(/hidden prospects/.test(text), 'the page says imports are hidden prospects');
  check((await page.getByLabel(/Add this business anyway/).count()) === 1 && (await page.getByLabel(/Update Alpha Plumbing/).count()) === 1, 'a review row offers "add anyway"; a listed business offers "update"');
  check((await page.getByRole('button', { name: /^Import 2 businesses$/ }).isVisible()), 'by default only the clean rows are selected');
  check(await noOverflow(page), 'check step: no horizontal scroll at 390px');
  await page.getByRole('button', { name: 'Back to columns' }).click(); await page.getByRole('heading', { name: 'Match the columns' }).waitFor();
  check((await page.locator('#map-community').inputValue()) === '2', 'going back keeps your column choices');
  await page.getByRole('button', { name: 'Check the file' }).click(); await page.getByRole('heading', { name: 'Check before importing' }).waitFor();

  // ---- decisions + commit ----
  await page.getByLabel(/Add this business anyway/).check();
  await page.getByLabel(/Update Alpha Plumbing/).check();
  await page.getByRole('button', { name: 'Import 4 businesses' }).click();
  await page.getByRole('heading', { name: 'Import finished' }).waitFor();
  const rows = state.imported.at(-1);
  check(rows.length === 4, 'exactly the 4 chosen rows were sent (not the invalid row, not the in-file duplicate)');
  const aspen = rows.find((r) => r.name === 'Aspen Electric'), odd = rows.find((r) => r.name === 'Odd Name'), alpha = rows.find((r) => r.existing_id);
  check(aspen?.home_community_id === BIZ && aspen?.primary_category_id === CAT && aspen?.website === 'https://aspen.example' && aspen?.phone === '(307) 555-0142' && aspen?.force === undefined, 'a clean row carries resolved ids and normalised values');
  check(odd?.force === true && odd?.home_community_id === null, 'a review row is sent with force and no invented ids');
  check(alpha?.existing_id === BIZ && alpha?.name === 'Alpha Plumbing', 'an update row carries the existing business id');
  check(rows.every((r) => !('status' in r) && !('verification_level' in r) && !('id' in r)), 'rows contain only importable fields (never status or verification)');
  const done = await page.locator('main').innerText();
  check(/2 added as hidden prospects, 1 updated, 0 skipped, 1 with problems/.test(done), 'the result summary matches');
  check(/Row 8 \(Explode\)/.test(done), 'a database refusal is reported against its row');
  check((await page.getByRole('link', { name: 'Review the new prospects' }).getAttribute('href')) === '/admin/businesses?status=prospect', 'it links to the new prospects');
  check(await noOverflow(page), 'result step: no horizontal scroll at 390px');
  await page.getByRole('button', { name: 'Import another file' }).click(); await page.getByRole('heading', { name: 'Choose a file' }).waitFor();
  check(true, 'start over returns to the first step');

  // ---- nothing selected is refused ----
  state.imported.length = 0;
  await upload(page, 'only-dups.csv', 'Business Name,Phone\nAlpha Plumbing,(307) 555-0101\n'); await page.getByRole('button', { name: 'Read the file' }).click();
  await page.getByRole('heading', { name: 'Match the columns' }).waitFor(); await page.getByRole('button', { name: 'Check the file' }).click();
  await page.getByRole('heading', { name: 'Check before importing' }).waitFor();
  check(await page.getByRole('button', { name: /^Import 0 businesses$/ }).isDisabled(), 'with nothing selected the import button is disabled');
  check(state.imported.length === 0, 'and nothing was sent');
} catch (err) { console.error(err); failed++; }
finally { await browser.close(); mock.close(); }
if (failed) { console.error(`\n${failed} import e2e check(s) failed`); process.exit(1); }
console.log('\nall import e2e checks passed');
