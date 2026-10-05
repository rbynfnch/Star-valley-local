// Automated WCAG 2.1 A/AA scan (axe-core) over public and admin pages in a real browser. Dev tool only: axe-core is NOT a project
// dependency; install it somewhere and pass the path:  AXE_PATH=/tmp/axe/node_modules/axe-core/axe.min.js node scripts/a11y-axe.mjs [port]
// Same environment as the other e2e scripts (fixtures-mode dev server + Supabase mock on :54399).
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BIZ, cookieFor, freshDetail, freshHotlist, freshPostcards, startMock, state } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
let chromium;
for (const where of [undefined, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']) { try { ({ chromium } = require(where ? join(where, 'playwright') : 'playwright')); break; } catch { /* next */ } }
const exe = (() => { const b = '/opt/pw-browsers'; for (const d of existsSync(b) ? readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)) : []) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return undefined; })();
const axeSrc = readFileSync(process.env.AXE_PATH ?? '', 'utf8');
const port = process.argv[2] ?? '3101';
const root = `http://star-valley.localhost:${port}`;
const fx = JSON.parse(readFileSync('.fixtures/directory.json', 'utf8'));
const biz = fx.businesses.find((b) => b.slug === 'sample-valley-plumbing') ?? fx.businesses[0];
const PUBLIC = ['/', '/businesses', '/businesses?q=plumb', '/categories/plumbing', `/business/${biz.slug}`, '/business/sample-creekside-cafe', '/events', '/hotlist', '/hotlist?view=deals', '/hotlist/half-day-guided-fly-fishing', '/hotlist/pie-of-the-week', '/hotlist/submit', '/verify/postcard', '/articles', '/things-to-do', '/pricing',
  '/list-your-business', '/list-your-business?claim=sample-smile-dental', '/suggest-business', '/suggest-update', '/submit-event', '/account/sign-in', '/account/sign-up', '/styleguide', '/admin/login'];
const ADMIN = ['/admin', '/admin/businesses', `/admin/businesses/${BIZ}`, `/admin/businesses/${BIZ}/edit`, `/admin/businesses/${BIZ}/content`, '/admin/import', '/admin/moderation', '/admin/placements', '/admin/email', '/admin/content', '/admin/content/articles', '/admin/content/events', '/admin/content/deals', '/admin/hotlist/new', '/admin/postcards', '/admin/hotlist', '/admin/content/articles/new', '/admin/content/events/new'];
state.detail = freshDetail();
state.postcards = freshPostcards(); state.hotlist = freshHotlist(fx.tenants[0].id);
const mock = await startMock();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
let total = 0;
async function scan(ctx, paths, label) {
  for (const path of paths) {
    const page = await ctx.newPage();
    try {
      const r = await page.goto(root + path, { waitUntil: 'load' }); await page.waitForTimeout(400);
      if (!r || r.status() >= 400) { console.log(`SKIP ${label} ${path} (${r?.status()})`); continue; }
      await page.addScriptTag({ content: axeSrc });
      const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }));
      for (const v of res.violations) { total++; console.log(`${v.impact?.toUpperCase().padEnd(8)} ${label} ${path}  ${v.id}: ${v.help}  [${v.nodes.length}] e.g. ${v.nodes[0].target.join(' ')} :: ${(v.nodes[0].failureSummary ?? '').split('\n')[1] ?? ''}`.slice(0, 400)); }
      if (!res.violations.length) console.log(`ok   ${label} ${path}`);
    } catch (e) { console.log(`ERR  ${label} ${path} ${e.message.slice(0, 100)}`); } finally { await page.close(); }
  }
}
try {
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    const pub = await browser.newContext({ viewport: { width: w, height: h } });
    await scan(pub, PUBLIC, `public@${w}`);
    const [name, value] = cookieFor('tok-admin').split('=');
    const adm = await browser.newContext({ viewport: { width: w, height: h } }); await adm.addCookies([{ name, value, url: root }]);
    await scan(adm, ADMIN, `admin@${w}`);
  }
} finally { await browser.close(); await mock.close(); }
console.log(`${total} violation group(s)`);
