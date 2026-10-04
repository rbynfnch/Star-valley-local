// The Enhanced content editor (/admin/businesses/[id]/content), in a REAL browser against the Supabase MOCK.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon SUPABASE_SERVICE_ROLE_KEY=service-secret npm run dev -- -p 3101
//   node scripts/e2e-content.mjs [appPort] [host]
import { createRequire } from 'node:module';
import { existsSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { BIZ, cookieFor, freshContent, freshDetail, startMock, state } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
let chromium;
for (const where of [undefined, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']) { try { ({ chromium } = require(where ? join(where, 'playwright') : 'playwright')); break; } catch { /* next */ } }
if (!chromium) { console.error('Playwright not found (install it globally, e.g. npm i -g playwright)'); process.exit(2); }
const exe = (() => { const b = '/opt/pw-browsers'; for (const d of existsSync(b) ? readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)) : []) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return undefined; })();

const port = process.argv[2] ?? '3101';
const host = process.argv[3] ?? 'star-valley.localhost';
const root = `http://${host}:${port}`;
const URL_ = `${root}/admin/businesses/${BIZ}/content`;
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
const calls = (n) => state.rpc.filter((c) => c.name === n);

// A real PNG of the given size (solid colour), built here so the test needs no fixture files.
const crc = (() => { const t = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); return (b) => { let c = ~0; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; }; })();
const png = (w, h) => {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 40; raw[o + 1] = 90; raw[o + 2] = 160; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const dir = mkdtempSync(join(tmpdir(), 'svl-content-'));
const file = (name, data) => { const p = join(dir, name); writeFileSync(p, data); return p; };
const good = file('shop.png', png(240, 240)), good2 = file('shop2.png', png(300, 220)), tiny = file('tiny.png', png(50, 50));
const fakePng = file('notes.png', 'this is just text'), svg = file('evil.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), svgAsPng = file('evil2.png', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const as = async (tok) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 1200 } }); const [name, value] = cookieFor(tok).split('='); await ctx.addCookies([{ name, value, url: root }]); return ctx.newPage(); };
// A form control by the start of its label. (getByLabel alone also matches the <section aria-labelledby> landmarks.)
const L = (ctx, name) => ctx.locator('input,textarea,select').and(ctx.getByLabel(new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
const sec = (page, id) => page.locator(`section[aria-labelledby="${id}-h"]`);
const alert = (s, re) => s.getByRole('alert').filter({ hasText: re }).waitFor();
const status = (s, re) => s.getByRole('status').filter({ hasText: re }).waitFor();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).then((n) => n <= 0);
const expectCalls = async (name, n) => { for (let i = 0; i < 100 && calls(name).length < n; i++) await new Promise((r) => setTimeout(r, 100)); };
const reset = () => { state.content = freshContent(); state.detail = freshDetail(); state.rpc.length = 0; state.storage = {}; state.storageRemoved = []; state.failNext = null; };
const OLD_COVER = freshContent().photos[0].path;

try {
  reset();
  // ---------- access ----------
  let page = await as('tok-editor'); await page.goto(URL_);
  check(page.url().endsWith('/admin'), 'editor: the content page sends you back to the dashboard');
  check(calls('business_content').length === 0, 'editor: nothing was fetched');
  page = await as('tok-sales');
  const r404 = await page.goto(`${root}/admin/businesses/not-a-uuid/content`);
  check(r404?.status() === 404, 'a malformed business id is a 404');

  // ---------- loads with the saved values ----------
  await page.goto(URL_);
  await page.getByRole('heading', { level: 1, name: 'Edit content' }).waitFor();
  const TENANT = calls('business_content')[0]?.body.p_tenant;
  check(!!TENANT, 'the page asks for the content of this tenant and business');
  check((await page.getByRole('note').count()) === 0, 'Enhanced business: no Free-plan notice');
  check((await L(page, 'Highlights').inputValue()) === 'Family owned' && (await L(page, 'Price level').inputValue()) === '2', 'highlights and price level are filled in');
  check((await L(page, 'Monday range 1 opens').inputValue()) === '08:00' && (await L(page, 'Monday range 1 closes').inputValue()) === '17:00' && (await L(page, 'Tuesday range 1 opens').inputValue()) === '', 'hours are filled in per day');
  check((await L(page, 'Services, one per line').inputValue()) === 'Drain cleaning\nWater heaters', 'services are filled in');
  check((await L(page, 'Facebook').inputValue()) === 'https://facebook.com/alpha', 'links are filled in');
  check((await L(page, 'Question 1').inputValue()) === 'Free quotes?' && (await L(page, 'Question 4').count()) === 1 && (await L(page, 'Question 5').count()) === 0, 'FAQ shows the saved row plus three blanks');
  check((await L(page, 'Alpine').count()) === 1 && (await L(page, 'Thayne').count()) === 0, 'the home community is not offered as an extra service area');
  check((await L(page, 'Plumbing').count()) === 0 && (await L(page, 'Heating and cooling').count()) === 1, 'the primary category is not offered as an extra category');
  const dealSec = sec(page, 'deal-d0000000-0000-4000-8000-000000000001');
  check((await L(dealSec, 'Title').inputValue()) === '10% off first visit' && (await L(dealSec, 'First day').inputValue()) === '2026-07-01' && (await L(dealSec, 'Last day').inputValue()) === '2026-11-30', 'a deal shows its dates as the tenant calendar days (end is the day before the stored next-day start)');
  const coverImg = page.locator('img[alt="Front of the shop"]');
  check((await coverImg.count()) === 1 && /\/media\/[0-9a-f-]{36}\/3f2a8c1e-[0-9a-f-]+\/cover\.png$/.test((await coverImg.getAttribute('src')) ?? ''), 'the photo preview points at the public media URL for its path');
  check(await noOverflow(page), 'no horizontal overflow at 390px');

  // ---------- highlights ----------
  const hs = sec(page, 'highlights');
  await L(hs, 'Highlights').fill('Licensed\r\n  Free estimates  \n\n24-hour emergency');
  await L(hs, 'Price level').selectOption('3');
  await hs.getByRole('button', { name: 'Save' }).click(); await status(hs, 'Highlights saved');
  let f = calls('update_business_fields').at(-1)?.body;
  check(JSON.stringify(f?.p_fields) === JSON.stringify({ highlights: ['Licensed', 'Free estimates', '24-hour emergency'], price_range: 3 }), 'highlights save as a clean list with the price level as a number');
  await L(hs, 'Highlights').fill('x'.repeat(41));
  const before = calls('update_business_fields').length;
  await hs.getByRole('button', { name: 'Save' }).click(); await alert(hs, /40 characters/);
  check(calls('update_business_fields').length === before && (await L(hs, 'Highlights').inputValue()) === 'x'.repeat(41), 'a too-long highlight is refused before any call, and what was typed stays');
  await L(hs, 'Highlights').fill(''); await L(hs, 'Price level').selectOption('');
  await hs.getByRole('button', { name: 'Save' }).click(); await status(hs, 'Highlights saved');
  check(JSON.stringify(calls('update_business_fields').at(-1)?.body.p_fields) === JSON.stringify({ highlights: [], price_range: null }), 'clearing both sends an empty list and no price level');

  // ---------- hours ----------
  const hh = sec(page, 'hours');
  await L(page, 'Tuesday range 1 opens').fill('09:00'); await L(page, 'Tuesday range 1 closes').fill('12:00');
  await L(page, 'Tuesday range 2 opens').fill('13:00'); await L(page, 'Tuesday range 2 closes').fill('17:30');
  await hh.getByRole('button', { name: 'Save' }).click(); await status(hh, 'Hours saved');
  const rows = calls('set_business_hours').at(-1)?.body.p_rows;
  check(JSON.stringify(rows) === JSON.stringify([{ day: 1, opens: '08:00', closes: '17:00' }, { day: 2, opens: '09:00', closes: '12:00' }, { day: 2, opens: '13:00', closes: '17:30' }]), 'hours save as day/open/close rows, Monday kept');
  await L(page, 'Wednesday range 1 opens').fill('09:00');
  const nh = calls('set_business_hours').length;
  await hh.getByRole('button', { name: 'Save' }).click(); await alert(hh, /Wednesday.*both/);
  check(calls('set_business_hours').length === nh, 'a half-filled day is refused without a call');
  await L(page, 'Wednesday range 1 closes').fill('08:00');
  await hh.getByRole('button', { name: 'Save' }).click(); await alert(hh, /Wednesday.*after/);
  await L(page, 'Wednesday range 1 closes').fill('12:00'); await L(page, 'Wednesday range 2 opens').fill('11:00'); await L(page, 'Wednesday range 2 closes').fill('14:00');
  await hh.getByRole('button', { name: 'Save' }).click(); await alert(hh, /Wednesday.*overlap/);
  check(calls('set_business_hours').length === nh, 'backwards and overlapping ranges are refused without a call');
  state.failNext = { rpc: 'set_business_hours', status: 400, body: { code: '22023', message: 'two time ranges on the same day overlap' } };
  await L(page, 'Wednesday range 2 opens').fill('13:00');
  await hh.getByRole('button', { name: 'Save' }).click(); await alert(hh, /Two time ranges on the same day overlap\./);
  check(true, 'a rule message from the database is shown in plain words');
  state.failNext = 'set_business_hours';
  await hh.getByRole('button', { name: 'Save' }).click(); await alert(hh, /could not be saved/);
  check(!/boom/.test(await hh.innerText()), 'any other failure gets the generic message, not the raw error');
  await hh.getByRole('button', { name: 'Save' }).click(); await status(hh, 'Hours saved');

  // ---------- services ----------
  const ss = sec(page, 'services');
  await L(ss, 'Services, one per line').fill('- Repipes\r\n• Sump pumps\nrepipes\n\n  Gas lines ');
  await ss.getByRole('button', { name: 'Save' }).click(); await status(ss, 'Services saved');
  check(JSON.stringify(calls('set_business_services').at(-1)?.body.p_names) === JSON.stringify(['Repipes', 'Sump pumps', 'Gas lines']), 'services: bullets stripped, duplicates and blanks dropped');

  // ---------- links ----------
  const ls = sec(page, 'links');
  await L(ls, 'Facebook').fill('https://evil.example/facebook.com');
  await ls.getByRole('button', { name: 'Save' }).click(); await alert(ls, /Facebook/);
  await L(ls, 'Facebook').fill('https://www.facebook.com/alpha'); await L(ls, 'Other link 1').fill('javascript:alert(1)');
  await ls.getByRole('button', { name: 'Save' }).click(); await alert(ls, /Other link.*http/);
  check(calls('set_business_links').length === 0, 'a wrong-network or javascript: link is refused without a call');
  await L(ls, 'Other link 1').fill('https://menu.example/alpha'); await L(ls, 'Instagram').fill('https://instagram.com/alpha');
  await ls.getByRole('button', { name: 'Save' }).click(); await status(ls, 'Links saved');
  check(JSON.stringify(calls('set_business_links').at(-1)?.body.p_items) === JSON.stringify([{ kind: 'facebook', url: 'https://www.facebook.com/alpha' }, { kind: 'instagram', url: 'https://instagram.com/alpha' }, { kind: 'other', url: 'https://menu.example/alpha' }]), 'links save with their types');

  // ---------- FAQs ----------
  const fs = sec(page, 'faqs');
  await L(fs, 'Question 2').fill('Do you work weekends?');
  await fs.getByRole('button', { name: 'Save' }).click(); await alert(fs, /Question 2.*both/);
  check(calls('set_business_faqs').length === 0, 'a question without an answer is refused without a call');
  await L(fs, 'Answer 2').fill('Yes,\r\nby appointment.');
  await fs.getByRole('button', { name: 'Save' }).click(); await status(fs, 'Questions saved');
  check(JSON.stringify(calls('set_business_faqs').at(-1)?.body.p_items) === JSON.stringify([{ question: 'Free quotes?', answer: 'Yes.' }, { question: 'Do you work weekends?', answer: 'Yes,\nby appointment.' }]), 'FAQs save in order with LF newlines');

  // ---------- areas ----------
  const as_ = sec(page, 'areas');
  await L(as_, 'Alpine').check(); await L(as_, 'Afton').check(); await L(as_, 'Heating and cooling').check();
  await as_.getByRole('button', { name: 'Save' }).click(); await status(as_, 'Service area saved');
  const ar = calls('set_business_areas').at(-1)?.body;
  check(ar?.p_community_ids.length === 2 && ar?.p_category_ids.length === 1, 'checked communities and categories are sent');
  await L(as_, 'Alpine').uncheck(); await L(as_, 'Afton').uncheck(); await L(as_, 'Heating and cooling').uncheck();
  await as_.getByRole('button', { name: 'Save' }).click(); await page.waitForFunction(() => true); await expectCalls('set_business_areas', 2);
  check(calls('set_business_areas').at(-1)?.body.p_community_ids.length === 0, 'unchecking everything clears the area');

  // ---------- deals ----------
  await L(dealSec, 'Title').fill('15% off any repair');
  await L(dealSec, 'Percent off').fill('15');
  await dealSec.getByRole('button', { name: 'Save deal' }).click(); await status(dealSec, 'Deal saved');
  let d = calls('save_deal').at(-1)?.body;
  check(d?.p_id === 'd0000000-0000-4000-8000-000000000001' && d.p_title === '15% off any repair' && d.p_discount_value === 15 && d.p_discount_type === 'percent', 'editing a deal sends its id, type and value');
  check(d?.p_starts_at === '2026-07-01T06:00:00.000Z' && d?.p_ends_at === '2026-12-01T07:00:00.000Z', 'its dates round-trip exactly (days in Mountain time)');
  const ns = sec(page, 'deal-new');
  await L(ns, 'Title').fill('Free drain camera look'); await L(ns, 'Percent off').fill('150');
  const nd = calls('save_deal').length;
  await ns.getByRole('button', { name: 'Add deal' }).click(); await alert(ns, /between 0 and 100/);
  check(calls('save_deal').length === nd, 'a 150% deal is refused without a call');
  await L(ns, 'Kind of deal').selectOption('bogo');
  check((await L(ns, 'Percent off').count()) === 0, 'a buy-one-get-one deal has no amount field');
  await L(ns, 'Last day').fill('2026-10-01'); await L(ns, 'First day').fill('2026-10-05');
  await ns.getByRole('button', { name: 'Add deal' }).click(); await alert(ns, /end after it starts/);
  await L(ns, 'First day').fill('2026-09-01');
  await ns.getByRole('button', { name: 'Add deal' }).click(); await status(ns, 'Deal added');
  d = calls('save_deal').at(-1)?.body;
  check(d.p_id === null && d.p_discount_type === 'bogo' && d.p_discount_value === null && d.p_status === 'published', 'a new deal has no id and no amount for bogo');
  await page.waitForFunction(() => document.querySelectorAll('section[aria-labelledby^="deal-d0"]').length === 2);
  check((await L(ns, 'Title').inputValue()) === '', 'the add form is cleared after a successful add');
  const newCard = page.locator('li', { hasText: 'Free drain camera look' });
  await newCard.getByRole('button', { name: 'Delete deal…' }).click();
  check(calls('delete_deal').length === 0, 'deleting needs a confirmation first');
  await newCard.getByRole('button', { name: 'Keep' }).click();
  await newCard.getByRole('button', { name: 'Delete deal…' }).click(); await newCard.getByRole('button', { name: 'Yes, delete' }).click();
  await page.waitForFunction(() => document.querySelectorAll('section[aria-labelledby^="deal-d0"]').length === 1);
  check(calls('delete_deal').length === 1, 'a confirmed delete removes the deal');

  // ---------- photos: refused uploads leave nothing behind ----------
  const ps = sec(page, 'photo-new');
  const up = async (path, o = {}) => {
    await L(ps, 'Photo file').setInputFiles(path);
    await L(ps, 'Alt text').fill(o.alt ?? 'Shop front'); await L(ps, 'Caption').fill(o.caption ?? ''); await L(ps, 'Use as').selectOption(o.role ?? 'gallery');
    await ps.getByRole('button', { name: 'Upload photo' }).click();
  };
  await up(fakePng); await alert(ps, /JPEG, PNG or WebP/);
  await up(svg); await alert(ps, /JPEG, PNG or WebP/);
  await up(svgAsPng); await alert(ps, /JPEG, PNG or WebP/);
  await up(tiny); await alert(ps, /too small/);
  check(Object.keys(state.storage).length === 0 && calls('add_business_photo').length === 0, 'text, SVG (even renamed .png) and tiny images are refused: nothing stored, nothing recorded');
  await up(good, { alt: '' }); await alert(ps, /Describe the photo/);
  check(Object.keys(state.storage).length === 0, 'a missing alt text is refused before anything is stored');

  // ---------- a good upload ----------
  await up(good, { role: 'cover', alt: 'The new shop sign', caption: 'Fresh sign' }); await status(ps, 'Cover photo set');
  const stored = Object.keys(state.storage);
  check(stored.length === 1 && new RegExp(`^${TENANT}/${BIZ}/[0-9a-f-]{36}\\.png$`).test(stored[0]), 'the file is stored under <tenant>/<business>/<random>.png (extension from the bytes, not the filename)');
  check(state.storage[stored[0]]?.type === 'image/png', 'with the sniffed content type');
  const ab = calls('add_business_photo').at(-1)?.body;
  check(ab?.p_path === stored[0] && ab.p_width === 240 && ab.p_height === 240 && ab.p_role === 'cover' && ab.p_alt === 'The new shop sign' && ab.p_bytes > 100, 'the record carries the path, measured size and metadata');
  check(JSON.stringify(state.storageRemoved) === JSON.stringify([OLD_COVER]), 'the replaced cover photo\'s file was removed after the database let go of it');
  await page.waitForFunction(() => !!document.querySelector('img[alt="The new shop sign"]'));
  check((await page.locator('img[alt="Front of the shop"]').count()) === 0, 'the page now shows the new cover and no longer the old one');
  await ps.getByRole('button', { name: 'Upload photo' }).waitFor();
  check((await L(ps, 'Alt text').inputValue()) === '', 'the upload form was cleared');

  // ---------- upload whose record fails: the file is removed ----------
  state.storageRemoved = [];
  state.failNext = { rpc: 'add_business_photo', status: 400, body: { code: '22023', message: 'a business can have at most 30 photos' } };
  await up(good2, { alt: 'Another view' }); await alert(ps, /At most 30 photos|can have at most 30 photos/i);
  check(Object.keys(state.storage).length === 1 && state.storageRemoved.length === 1, 'when recording fails the just-uploaded file is deleted again');
  check(!/boom/.test(await ps.innerText()), 'and the message is the rule\'s own words');
  state.failNext = 'add_business_photo';
  await up(good2, { alt: 'Another view' }); await alert(ps, /could not be saved/);
  check(Object.keys(state.storage).length === 1, 'an unexpected failure also cleans up and shows the generic message');

  // ---------- gallery photos, reorder, update, delete ----------
  await up(good, { alt: 'First gallery', caption: '<img src=x onerror=window.__pwned=1>' }); await status(ps, 'Photo added');
  await up(good2, { alt: 'Second gallery' }); await status(ps, 'Photo added');
  await page.waitForFunction(() => document.querySelectorAll('img[alt="Second gallery"]').length === 1);
  check((await page.evaluate(() => window.__pwned)) === undefined && (await page.locator('img[src="x"]').count()) === 0, 'markup in a caption is shown as text, never run');
  const first = page.locator('li', { hasText: 'Photo 2' }), second = page.locator('li', { hasText: 'Photo 3' });
  check((await first.getByRole('button', { name: /Move photo 2 earlier/ }).isDisabled()) && !(await second.getByRole('button', { name: /Move photo 3 earlier/ }).isDisabled()), 'the first gallery photo cannot move earlier; the second can');
  await second.getByRole('button', { name: /Move photo 3 earlier/ }).click();
  await page.waitForFunction(() => document.querySelector('li img[alt="Second gallery"]')?.closest('li')?.textContent?.includes('Photo 2'));
  const order = calls('reorder_business_photos').at(-1)?.body.p_ids;
  check(order?.length === 2 && state.content.photos.filter((p) => p.role === 'gallery')[0].alt === 'Second gallery', 'moving a photo sends the new gallery order');
  const g2 = page.locator('li', { hasText: 'Photo 3' });
  const gs = g2.locator('section');
  await L(gs, 'Alt text').fill('First gallery, updated'); await L(gs, 'Caption').fill('New caption');
  await gs.getByRole('button', { name: 'Save photo' }).click(); await status(gs, 'Photo saved');
  const up1 = calls('update_business_photo').at(-1)?.body;
  check(up1.p_alt === 'First gallery, updated' && up1.p_caption === 'New caption' && up1.p_role === 'gallery', 'editing alt text and caption sends them');
  await L(gs, 'Alt text').fill('');
  await gs.getByRole('button', { name: 'Save photo' }).click();
  check((await L(gs, 'Alt text').evaluate((el) => el.validity.valueMissing)), 'alt text cannot be blanked on a saved photo (the browser stops it)');
  state.storageRemoved = [];
  const delPhoto = page.locator('li', { hasText: 'Photo 2' });
  await delPhoto.getByRole('button', { name: 'Delete…' }).click();
  check(calls('delete_business_photo').length === 0, 'deleting a photo needs a confirmation first');
  await delPhoto.getByRole('button', { name: 'Yes, delete' }).click();
  await page.waitForFunction(() => document.querySelectorAll('img[alt="Second gallery"]').length === 0);
  check(calls('delete_business_photo').length === 1 && state.storageRemoved.length === 1, 'a confirmed delete removes the record and then the file');

  // ---------- escaping and layout ----------
  state.content.services = ['<img src=x onerror=window.__pwned2=1>', 'W'.repeat(120)];
  state.content.faqs = [{ question: '<script>window.__pwned3=1</script>', answer: 'A'.repeat(300) }];
  await page.reload(); await page.getByRole('heading', { level: 1, name: 'Edit content' }).waitFor();
  check((await L(page, 'Services, one per line').inputValue()).startsWith('<img src=x') && (await page.evaluate(() => window.__pwned2 ?? window.__pwned3)) === undefined, 'stored markup appears as text inside the fields, never as markup');
  check(await noOverflow(page), 'long unbroken text does not break the layout at 390px');

  // ---------- free plan notice ----------
  state.content.enhanced = false; await page.reload();
  check(/Free.*plan/.test(await page.getByRole('note').innerText()) && /only while it has an active Enhanced listing/.test(await page.getByRole('note').innerText()), 'a Free business gets the notice that Enhanced content stays hidden');

  // ---------- business page links here; a missing business is a 404 ----------
  await page.goto(`${root}/admin/businesses/${BIZ}`);
  await page.getByRole('link', { name: 'Edit content' }).click(); await page.waitForURL(/\/content$/);
  check(true, 'the business page links to the content editor');
  state.failNext = { rpc: 'business_content', status: 404, body: { code: 'P0002', message: 'business not found' } };
  const r2 = await page.goto(`${root}/admin/businesses/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/content`);
  check(r2?.status() === 404, 'an unknown business is a 404');
} catch (e) { console.log('FAIL - unexpected error:', e.message.split('\n').slice(0, 6).join(' | ')); try { console.log((await browser.contexts().at(-1).pages()[0].locator('section[aria-labelledby="deal-new-h"]').innerText()).slice(-400)); } catch { /* none */ } failed++; }
await browser.close(); mock.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
