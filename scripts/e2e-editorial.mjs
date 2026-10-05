// The editorial admin (articles, events, deals list) in a REAL browser against the Supabase MOCK.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon SUPABASE_SERVICE_ROLE_KEY=service-secret npm run dev -- -p 3101
//   node scripts/e2e-editorial.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { BIZ, cookieFor, freshEditorial, startMock, state } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
let chromium;
for (const where of [undefined, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']) { try { ({ chromium } = require(where ? join(where, 'playwright') : 'playwright')); break; } catch { /* next */ } }
if (!chromium) { console.error('Playwright not found (install it globally, e.g. npm i -g playwright)'); process.exit(2); }
const exe = (() => { const b = '/opt/pw-browsers'; for (const d of existsSync(b) ? readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)) : []) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return undefined; })();
const port = process.argv[2] ?? '3101', host = process.argv[3] ?? 'star-valley.localhost', root = `http://${host}:${port}`;
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
const calls = (n) => state.rpc.filter((c) => c.name === n);
const A1 = 'a1000000-0000-4000-8000-000000000001', E1 = 'e1000000-0000-4000-8000-000000000001';

const crc = (() => { const t = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); return (b) => { let c = ~0; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; }; })();
const png = (w, h) => { const ch = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); }; const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * h); return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]); };
const dir = mkdtempSync(join(tmpdir(), 'svl-ed-')); const file = (n, d) => { const p = join(dir, n); writeFileSync(p, d); return p; };
const good = file('a.png', png(300, 200)), good2 = file('b.png', png(320, 220)), svg = file('x.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');

const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const as = async (tok) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 1400 } }); const [name, value] = cookieFor(tok).split('='); await ctx.addCookies([{ name, value, url: root }]); return ctx.newPage(); };
const reset = () => { state.editorial = freshEditorial(); state.rpc.length = 0; state.storage = {}; state.storageRemoved = []; state.failNext = null; };
const body = async (page) => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
const waitCalls = async (n, c = 1) => { for (let i = 0; i < 80 && calls(n).length < c; i++) await new Promise((r) => setTimeout(r, 100)); };
try {
  reset();
  // ---------- access ----------
  let page = await as('tok-sales'); await page.goto(`${root}/admin/content`);
  check(page.url().endsWith('/admin'), 'sales staff: the content area sends you back to the dashboard');
  check((await page.locator('nav[aria-label="Admin"]').innerText()).indexOf('Content') === -1, 'and the nav has no Content link');
  page = await as('tok-editor'); await page.goto(`${root}/admin/content`);
  await page.getByRole('heading', { level: 1, name: 'Content' }).waitFor();
  check((await page.locator('nav[aria-label="Admin"]').innerText()).includes('Content'), 'an editor sees the Content link');
  let t = await body(page);
  check(/Articles 2 in all, 1 draft/.test(t) && /Events 2 in all, 1 pending/.test(t) && /Deals 2 from businesses/.test(t), 'the hub shows counts');
  const adm = await as('tok-admin'); await adm.goto(`${root}/admin/content`); check(adm.url().endsWith('/admin/content'), 'an admin can open it too');

  // ---------- article list ----------
  await page.goto(`${root}/admin/content/articles`);
  t = await body(page);
  check(/Fall hiking <b>guide<\/b>/.test(t) && (await page.locator('main b').count()) === 0, 'a title containing markup is shown as text');
  check(/Published · featured 1/.test(t) && /Draft/.test(t) && /\/articles\/fall-hiking/.test(t), 'status, featured position and address are shown');

  // ---------- create an article ----------
  await page.getByRole('link', { name: 'New article' }).click();
  await page.locator('#title').waitFor();
  await page.locator('#slug').fill('Bad Slug!');
  await page.locator('#title').fill('  Ten  Things  ');
  await page.getByRole('button', { name: 'Create article' }).click();
  await page.getByRole('alert').filter({ hasText: /web address/ }).waitFor();
  check(calls('save_article').length === 0, 'a bad web address is refused before any call');
  await page.locator('#slug').fill('');
  await page.locator('#body').fill('Line one\r\n\r\nLine two');
  await page.locator('#author').fill(' Pat Writer ');
  await page.locator('#category').selectOption({ label: 'Things to Do' });
  await page.locator('#item_title_0').fill('Hike');
  await page.locator('#item_body_0').fill('Go early');
  await page.locator('#item_biz_0').fill('Alpha-Plumbing');
  await page.getByRole('button', { name: 'Create article' }).click();
  await page.waitForURL(/\/admin\/content\/articles\/[0-9a-f-]{36}\?created=1/);
  const s1 = calls('save_article')[0].body;
  check(s1.p_title === 'Ten Things' && s1.p_id === null && s1.p_status === 'draft' && s1.p_publish_at === null && s1.p_slug === null && s1.p_author === 'Pat Writer' && s1.p_body === 'Line one\n\nLine two', 'the draft is saved with a cleaned title, LF newlines and no slug or time');
  check(JSON.stringify(s1.p_items) === JSON.stringify([{ title: 'Hike', body: 'Go early', business_slug: 'alpha-plumbing' }]) && !!s1.p_category, 'guide items go with it, the business address lower-cased');
  check(/Created as a draft/.test(await body(page)) && /Not visible to the public yet/.test(await body(page)), 'the new article page says it is a draft');
  const newId = page.url().match(/articles\/([0-9a-f-]{36})/)[1];

  // ---------- edit ----------
  check((await page.locator('#title').inputValue()) === 'Ten Things' && (await page.locator('#item_title_0').count()) === 1, 'the edit form loads the article');
  await page.locator('#status').selectOption('scheduled');
  await page.getByRole('button', { name: 'Save article' }).click();
  await page.getByRole('alert').filter({ hasText: /go live/ }).waitFor();
  check(calls('save_article').length === 1, 'scheduling without a time is refused before any call');
  await page.locator('#publish_date').fill('2026-12-01'); await page.locator('#publish_time').fill('08:30');
  await page.locator('#featured_rank').selectOption('2');
  await page.getByRole('button', { name: 'Save article' }).click(); await page.getByRole('status').filter({ hasText: 'Article saved' }).waitFor();
  const s2 = calls('save_article')[1].body;
  check(s2.p_id === newId && s2.p_status === 'scheduled' && s2.p_publish_at === '2026-12-01T15:30:00.000Z' && s2.p_featured_rank === 2, 'a scheduled article is saved with its time in Mountain time (UTC-7 in December)');
  state.failNext = { rpc: 'save_article', status: 400, body: { code: '22023', message: 'that web address is already used by another article' } };
  await page.getByRole('button', { name: 'Save article' }).click(); await page.getByRole('alert').filter({ hasText: 'That web address is already used by another article.' }).waitFor();
  check((await page.locator('#title').inputValue()) === 'Ten Things', 'a rule message from the database is shown and the form keeps its values');
  state.failNext = 'save_article';
  await page.getByRole('button', { name: 'Save article' }).click(); await page.getByRole('alert').filter({ hasText: 'could not be saved' }).waitFor();
  check(!/boom/.test(await body(page)), 'any other failure gets the generic message');
  await page.goto(`${root}/admin/content/articles/${A1}`);
  check((await page.locator('#title').inputValue()) === 'Fall hiking <b>guide</b>' && (await page.locator('#featured_rank').inputValue()) === '1' && (await page.locator('#item_title_0').inputValue()) === 'Hike the ridge' && (await page.locator('#author').inputValue()) === 'Taylor Jensen', 'an existing article loads with its category, author, featured position and guide items');
  check(/Live at \/articles\/fall-hiking/.test(await body(page)), 'a live article links to its public page');
  const r404 = await page.goto(`${root}/admin/content/articles/not-a-uuid`); check(r404?.status() === 404, 'a malformed id is a 404');
  const r404b = await page.goto(`${root}/admin/content/articles/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`); check(r404b?.status() === 404, 'an unknown article is a 404');

  // ---------- cover image ----------
  await page.goto(`${root}/admin/content/articles/${newId}`);
  const up = async (path, alt) => { await page.locator('#cover-file').setInputFiles(path); await page.locator('#cover-alt').fill(alt); await page.getByRole('button', { name: /Upload image|Replace image/ }).click(); };
  await up(svg, 'x'); await page.getByRole('alert').filter({ hasText: /JPEG, PNG or WebP/ }).waitFor();
  check(Object.keys(state.storage).length === 0, 'an SVG is refused and nothing is stored');
  await up(good, 'The valley at dusk'); await page.getByRole('status').filter({ hasText: 'Image saved' }).waitFor();
  let stored = Object.keys(state.storage);
  check(stored.length === 1 && new RegExp(`/articles/${newId}/[0-9a-f-]{36}\\.png$`).test(stored[0]), 'the cover is stored under <tenant>/articles/<article>/<random>.png');
  const si = state.editorial.saved.find((x) => x.rpc === 'set_content_image');
  check(si?.p_kind === 'article' && si.p_alt === 'The valley at dusk' && si.p_path === stored[0], 'and recorded with its alt text');
  await page.reload(); check((await page.locator('img[alt="The valley at dusk"]').count()) === 1, 'the cover shows on the edit page');
  await up(good2, 'A new cover'); await page.getByRole('status').filter({ hasText: 'Image saved' }).waitFor();
  check(Object.keys(state.storage).length === 1 && state.storageRemoved.includes(stored[0]), 'a new cover replaces the old one and the old file is deleted');
  state.storageRemoved = []; state.failNext = { rpc: 'set_content_image', status: 400, body: { code: '22023', message: 'images can be at most 5 MB' } };
  const before = Object.keys(state.storage).length;
  await up(good, 'Another'); await page.getByRole('alert').filter({ hasText: 'Images can be at most 5 MB.' }).waitFor();
  check(Object.keys(state.storage).length === before && state.storageRemoved.length === 1, 'if recording fails the just-uploaded file is removed');
  await page.getByRole('button', { name: 'Remove image' }).click(); await page.getByRole('status').filter({ hasText: 'Image removed' }).waitFor();
  check(Object.keys(state.storage).length === 0, 'removing the cover deletes the file');

  // ---------- delete ----------
  await page.goto(`${root}/admin/content/articles/${A1}`);
  await page.getByRole('button', { name: 'Delete article…' }).click();
  check(calls('delete_article').length === 0, 'deleting needs a confirmation');
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await page.getByRole('alert').filter({ hasText: /archive a published or scheduled article/i }).waitFor();
  check(true, 'a published article cannot be deleted; the rule is explained');
  await page.goto(`${root}/admin/content/articles/${newId}`);
  await up(good, 'Cover to be deleted with the article'); await page.getByRole('status').filter({ hasText: 'Image saved' }).waitFor();
  state.storageRemoved = [];
  await page.locator('#status').selectOption('archived'); await page.getByRole('button', { name: 'Save article' }).click(); await page.getByRole('status').filter({ hasText: 'Article saved' }).waitFor();
  await page.getByRole('button', { name: 'Delete article…' }).click(); await page.getByRole('button', { name: 'Yes, delete' }).click();
  await page.waitForURL(/\/admin\/content\/articles\?deleted=1/); check(/Deleted\./.test(await body(page)), 'an archived article is deleted and the list says so');
  check(state.storageRemoved.length === 1 && Object.keys(state.storage).length === 0, 'deleting an article also deletes its cover file');

  // ---------- events ----------
  await page.goto(`${root}/admin/content/events`);
  t = await body(page); check(/Farmers Market/.test(t) && /Repeats/i.test(t) && /Pending/.test(t), 'the event list shows status and repeats');
  await page.getByRole('link', { name: 'New event' }).click(); await page.locator('#title').waitFor();
  check((await page.locator('#start_time').count()) === 1, 'a timed event asks for times');
  await page.locator('#title').fill('Harvest Dinner'); await page.locator('#start_date').fill('2026-10-17'); await page.locator('#start_time').fill('18:00'); await page.locator('#end_time').fill('17:00');
  await page.getByRole('button', { name: 'Create event' }).click(); await page.getByRole('alert').filter({ hasText: /cannot end before/ }).waitFor();
  check(calls('save_event').length === 0, 'ending before the start is refused before any call');
  await page.locator('#end_time').fill('21:00');
  await page.locator('#repeat').selectOption('weekly');
  check((await page.locator('input[name="repeat_days"]').count()) === 7 && (await page.locator('#repeat_interval').count()) === 1, 'choosing weekly shows the days and the interval');
  await page.locator('input[name="repeat_days"][value="SA"]').check(); await page.locator('input[name="repeat_days"][value="TU"]').check(); await page.locator('#repeat_interval').fill('2'); await page.locator('#repeat_until').fill('2026-12-31');
  await page.locator('#organizer').fill('no-such-biz');
  await page.getByRole('button', { name: 'Create event' }).click(); await page.getByRole('alert').filter({ hasText: /No business has the web address name/ }).waitFor();
  check(calls('save_event').length === 0, 'an unknown organizer is refused with its name in the message');
  await page.locator('#organizer').fill('alpha-plumbing');
  await page.getByRole('button', { name: 'Create event' }).click(); await page.waitForURL(/\/admin\/content\/events\/[0-9a-f-]{36}\?created=1/);
  const e1 = calls('save_event')[0].body;
  check(e1.p_starts === '2026-10-18T00:00:00.000Z' && e1.p_ends === '2026-10-18T03:00:00.000Z' && e1.p_rrule === 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SA' && e1.p_until === '2027-01-01T06:59:00.000Z' && e1.p_organizer === BIZ && e1.p_status === 'published', 'times are Mountain time, the rule is built in order, the organizer resolved to its id');
  await page.goto(`${root}/admin/content/events/${E1}`);
  check((await page.locator('#start_date').inputValue()) === '2026-10-10' && (await page.locator('#start_time').inputValue()) === '08:00' && (await page.locator('#end_time').inputValue()) === '13:00', 'an existing event shows its times in Mountain time');
  check((await page.locator('#repeat').inputValue()) === 'weekly' && (await page.locator('input[name="repeat_days"][value="SA"]').isChecked()) && (await page.locator('#repeat_until').inputValue()) === '2026-12-19', 'and its repeat rule as choices');
  await page.locator('#all_day').check();
  check((await page.locator('#start_time').count()) === 0 && (await page.locator('#end_time').count()) === 0, 'all day hides the time fields');
  await page.locator('#all_day').uncheck(); await page.locator('#title').fill('Farmers Market (renamed)');
  await page.getByRole('button', { name: 'Save event' }).click(); await page.getByRole('status').filter({ hasText: 'Event saved' }).waitFor();
  const e2 = calls('save_event').at(-1).body; check(e2.p_id === E1 && e2.p_title === 'Farmers Market (renamed)' && e2.p_starts === '2026-10-10T14:00:00.000Z', 'saving an unchanged time round-trips exactly');
  await page.getByRole('button', { name: 'Delete event…' }).click(); await page.getByRole('button', { name: 'Yes, delete' }).click();
  await page.getByRole('alert').filter({ hasText: /cancel a published event/i }).waitFor(); check(true, 'a published event cannot be deleted; the rule is explained');
  await page.locator('#repeat').selectOption('none'); await page.locator('#status').selectOption('cancelled');
  const nSaves = calls('save_event').length;
  await page.getByRole('button', { name: 'Save event' }).click(); await waitCalls('save_event', nSaves + 1);
  const e3 = calls('save_event').at(-1).body; check(e3.p_rrule === null && e3.p_until === null && e3.p_status === 'cancelled', 'switching the repeat off clears the rule and its end date; cancelling is saved');
  await page.goto(`${root}/admin/content/events/e1000000-0000-4000-8000-000000000002`);
  check((await page.locator('#all_day').isChecked()) && (await page.locator('#status').inputValue()) === 'pending', 'an all-day pending event loads as such');
  await page.getByRole('button', { name: 'Delete event…' }).click(); await page.getByRole('button', { name: 'Yes, delete' }).click();
  await page.waitForURL(/\/admin\/content\/events\?deleted=1/); check(state.editorial.deleted.some((d) => d.kind === 'event'), 'an unpublished event is deleted');

  // ---------- deals ----------
  await page.goto(`${root}/admin/content/deals`);
  t = await body(page);
  check(/20% off tune-up/.test(t) && /Live/.test(t) && /Old promo/.test(t) && /Archived/.test(t), 'the deals list shows live and archived deals');
  check((await page.getByRole('link', { name: 'Alpha Plumbing' }).count()) === 0 && /ask sales staff/.test(t), 'an editor sees the business name but no link into the sales-only editor');
  const admin = await as('tok-admin'); await admin.goto(`${root}/admin/content/deals`);
  check((await admin.getByRole('link', { name: 'Alpha Plumbing' }).first().getAttribute('href')) === `/admin/businesses/${BIZ}/content`, 'an admin can jump to the business\'s content editor');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal overflow at 390px');
} catch (e) { console.log('FAIL - unexpected error:', e.message.split('\n').slice(0, 6).join(' | ')); failed++; }
await browser.close(); mock.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
