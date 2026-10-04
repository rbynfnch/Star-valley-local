// Layout checks in a REAL browser (headless Chromium): no horizontal overflow at any width, and that key controls are
// actually visible (not merely present in the HTML) at the widths where they should be. Needs a running dev server:
//   node scripts/check-layout.mjs [port] [host]
// Loads each page inside a same-origin iframe of the exact width (a headless window cannot be narrower than ~500px).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const port = process.argv[2] ?? '3101';
const host = process.argv[3] ?? 'star-valley.localhost';
const WIDTHS = [320, 360, 390, 600, 768, 900, 1024, 1280];

// selector must be visible at widths >= min (and, when `hiddenBelow`, must NOT be visible below it)
const ADMIN_COOKIE = process.env.ADMIN_COOKIE; // set by smoke-admin.mjs --layout: checks the admin pages signed in (mock auth)
const ADMIN_PAGES = [
  { path: '/admin', visible: [{ sel: 'h1', min: 0 }, { sel: 'nav[aria-label="Admin"]', min: 0 }, { sel: 'dl', min: 0 }] },
  { path: '/admin/businesses', visible: [{ sel: 'h1', min: 0 }, { sel: '#q', min: 0 }, { sel: 'ul.space-y-3 li', min: 0, hiddenAt: 768 }, { sel: 'table', min: 768 }, { sel: 'button[type="submit"]', min: 0 }] },
  { path: '/admin/businesses/3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b', visible: [{ sel: 'h1', min: 0 }, { sel: '#stage', min: 0 }, { sel: '#body', min: 0 }, { sel: 'dl', min: 0 }, { sel: 'ol', min: 0 }] },
  { path: '/admin/businesses/3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b/edit', visible: [{ sel: 'h1', min: 0 }, { sel: '#name', min: 0 }, { sel: '#description', min: 0 }, { sel: 'button[type="submit"]', min: 0 }] },
  { path: '/admin/businesses?tier=free&page=2', visible: [{ sel: 'h1', min: 0 }, { sel: 'nav[aria-label="Pagination"]', min: 0 }] },
];
const PUBLIC_PAGES = [
  { path: '/', visible: [{ sel: 'h1', min: 0 }, { sel: 'form[role="search"] button[type="submit"]', min: 0 }] },
  { path: '/categories/plumbing', visible: [{ sel: 'h1', min: 0 }, { sel: 'nav[aria-label="Breadcrumb"]', min: 0 }, { sel: '#featured-heading', min: 0 }, { sel: '#all-heading', min: 0 }] },
  { path: '/communities/afton', visible: [{ sel: 'h1', min: 0 }, { sel: 'nav[aria-label="Breadcrumb"]', min: 0 }, { sel: '#all-heading', min: 0 }] },
  { path: '/categories/plumbing/afton', visible: [{ sel: 'h1', min: 0 }, { sel: 'nav[aria-label="Breadcrumb"]', min: 0 }, { sel: '#featured-heading', min: 0 }, { sel: '#all-heading', min: 0 }] },
  { path: '/businesses', visible: [
    { sel: 'form[role="search"]', min: 0, optional: true },
    { sel: '#dir-q', min: 0 }, { sel: 'button[type="submit"][form="directory-form"]', min: 1024 },
    { sel: 'input[name="community"]', min: 1024 }, { sel: 'input[name="verified"]', min: 1024 },
    { sel: 'aside summary', min: 0, hiddenAt: 1024 },
  ] },
  { path: '/business/sample-valley-plumbing', visible: [{ sel: 'h1', min: 0 }, { sel: '#services', min: 0 }, { sel: '#photos', min: 0 }, { sel: '#faqs', min: 0 }, { sel: 'nav[aria-label="Breadcrumb"]', min: 0 }] },
  { path: '/business/sample-creekside-cafe', visible: [{ sel: 'h1', min: 0 }, { sel: '#about', min: 0 }] },
];
const PAGES = ADMIN_COOKIE ? ADMIN_PAGES : PUBLIC_PAGES;

const findChrome = () => {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const base = '/opt/pw-browsers';
  if (existsSync(base)) for (const d of readdirSync(base).filter((x) => /^chromium-\d+$/.test(x))) { const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; }
  throw new Error('Set CHROMIUM to a Chromium/Chrome binary');
};

const frame = `<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="out">pending</div><script>
${ADMIN_COOKIE ? `document.cookie=${JSON.stringify(ADMIN_COOKIE + '; path=/')};` : ''}
const PAGES=${JSON.stringify(PAGES)}, WIDTHS=${JSON.stringify(WIDTHS)}, res=[]; let total=PAGES.length*WIDTHS.length, n=0;
for (const pg of PAGES) for (const w of WIDTHS) { const f=document.createElement('iframe');
  f.style.cssText='width:'+w+'px;height:900px;border:0;position:absolute;left:0;top:'+(60+n*5)+'px'; f.src=pg.path;
  f.onload=()=>setTimeout(()=>{ const d=f.contentDocument, root=d.documentElement, cw=root.clientWidth, out=[];
    if (root.scrollWidth>cw) { const wide=[...d.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>cw+1).slice(0,2).map(e=>e.tagName+'.'+String(e.className).split(' ')[0]); out.push({k:'overflow',ok:false,msg:'scrollWidth '+root.scrollWidth+' > '+cw+' ('+wide.join(',')+')'}); } else out.push({k:'overflow',ok:true});
    for (const v of pg.visible) { const el=d.querySelector(v.sel); const vis=!!el && el.checkVisibility({contentVisibilityAuto:true,visibilityProperty:true,opacityProperty:true});
      const want = w>=v.min; if (v.hiddenAt!==undefined && w>=v.hiddenAt) { out.push({k:'hidden',sel:v.sel,ok:!vis,msg:v.sel+' should be hidden at '+w+'px'}); continue; }
      if (want && !(v.optional && !el)) out.push({k:'visible',sel:v.sel,ok:vis,msg:v.sel+(el?' present but NOT visible':' missing')+' at '+w+'px'}); }
    res.push({path:pg.path,w,out}); if (res.length===total) document.getElementById('out').textContent='RESULT'+JSON.stringify(res); },2500);
  document.body.appendChild(f); n++; }
</script>`;

mkdirSync('public', { recursive: true });
const file = join('public', '_layout-check.html');
writeFileSync(file, frame);
let html = '';
try {
  html = execFileSync(findChrome(), ['--headless', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=60000', '--dump-dom', `http://${host}:${port}/_layout-check.html`], { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'ignore'] });
} finally { rmSync(file, { force: true }); }

const m = /RESULT(\[.*\])/.exec(html.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
if (!m) { console.error('FAIL - the browser did not report results'); process.exit(1); }
const results = JSON.parse(m[1]);
let failed = 0;
for (const pg of PAGES) {
  const rs = results.filter((r) => r.path === pg.path).sort((a, b) => a.w - b.w);
  const bad = rs.flatMap((r) => r.out.filter((o) => !o.ok).map((o) => `@${r.w}px ${o.msg}`));
  console.log(`${bad.length ? 'FAIL' : 'ok  '} - ${pg.path}: no overflow and controls visible where expected at ${WIDTHS.join(', ')}px`);
  for (const b of bad) console.log('       ' + b);
  failed += bad.length;
}
process.exit(failed ? 1 : 0);
