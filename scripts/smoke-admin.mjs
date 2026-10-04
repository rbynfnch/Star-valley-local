// Exercises the admin guard end to end against a MOCK of Supabase auth + RPC (no real Supabase needed).
// It proves our wiring (proxy, session cookie, staff check, dashboard, denied path), NOT real Supabase behaviour.
// Start the app first, pointing it at the mock:
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npm run dev -- -p 3101
//   node scripts/smoke-admin.mjs [appPort] [host]
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);   // async: the mock server lives in THIS process and must keep answering

const port = process.argv[2] ?? '3101';
const host = process.argv[3] ?? 'star-valley.localhost';
const MOCK = 54399;
const base = `http://localhost:${port}`;
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };

const USERS = { 'tok-sales': { id: 'u-sales', email: 'sales@example.test', role: 'sales' }, 'tok-editor': { id: 'u-editor', email: 'editor@example.test', role: 'editor' }, 'tok-rando': { id: 'u-rando', email: 'rando@example.test', role: null } };
const calls = []; let lastList = null; let listRows = [
  { id: 'b1', slug: 'a', name: 'Alpha Plumbing', status: 'unclaimed', phone: '(307) 555-0101', verification_level: 'gold', community: 'Thayne', category: 'Plumbing', lead_stage: 'interested', tier: 'enhanced', featured: true },
  { id: 'b2', slug: 'b', name: 'Bravo Cafe', status: 'prospect', phone: null, verification_level: 'none', community: null, category: null, lead_stage: 'new', tier: 'free', featured: false }];
const mock = http.createServer((req, res) => {
  const tok = (req.headers.authorization ?? '').replace('Bearer ', '');
  const u = USERS[tok];
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    calls.push(`${req.method} ${req.url}`);
    const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url.startsWith('/auth/v1/user')) return u ? json(200, { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }) : json(401, { msg: 'invalid' });
    if (req.url.startsWith('/rest/v1/rpc/my_staff_role')) return json(200, u?.role ?? null);
    if (req.url.startsWith('/rest/v1/rpc/admin_dashboard_counts')) {
      if (!u?.role) return json(403, { code: '42501', message: 'staff only' });
      return json(200, { total: 27, prospects: 4, verified: 9, enhanced: 6, featured: 3, needing_verification: 11 });
    }
    if (req.url.startsWith('/rest/v1/rpc/admin_list_businesses')) {
      if (!u?.role || u.role === 'editor') return json(403, { code: '42501', message: 'sales staff only' });
      lastList = JSON.parse(body || '{}'); return json(200, { total: listRows.length === 0 ? 0 : 60, rows: listRows });
    }
    if (req.url.startsWith('/rest/v1/communities')) return json(200, [{ id: '3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b', name: 'Thayne' }]);
    if (req.url.startsWith('/rest/v1/categories')) return json(200, [{ id: '4f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b', name: 'Plumbing' }]);
    json(404, {});
  });
});
await new Promise((r) => mock.listen(MOCK, r));

const cookieFor = (tok) => {
  const session = { access_token: tok, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: USERS[tok]?.id ?? 'forged', email: USERS[tok]?.email ?? 'forged@example.test' } };
  return `sb-localhost-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
};
const get = async (path, tok) => {
  const r = await fetch(base + path, { redirect: 'manual', headers: { host: `${host}:${port}`, ...(tok ? { cookie: cookieFor(tok) } : {}) } });
  return { status: r.status, loc: r.headers.get('location'), body: await r.text(), headers: r.headers };
};
const text = (b) => b.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

try {
  let r = await get('/admin');
  check(r.status === 307 && r.loc === '/admin/login?next=%2Fadmin', 'signed out: /admin redirects to login');

  r = await get('/admin', 'tok-sales');
  check(r.status === 200, 'staff (sales): /admin is 200');
  const t = text(r.body);
  check(/Star Valley Local\s+admin/.test(t) && /sales@example\.test · sales/.test(t), 'shows the tenant, the email and the role');
  check(/Businesses\s+27/.test(t) && /Prospects\s+4/.test(t) && /Verified\s+9/.test(t) && /Needing verification\s+11/.test(t) && /Enhanced\s+6/.test(t) && /Featured\s+3/.test(t), 'dashboard shows all six counts from the RPC');
  check(/noindex/.test(r.body), 'admin pages are noindex');
  check(/Sign out/.test(t), 'has a sign-out control');
  check(!/service_role|SUPABASE_SERVICE/i.test(r.body), 'no server secrets in the page');

  r = await get('/admin', 'tok-editor');
  check(r.status === 200, 'staff (editor): can open the dashboard');

  r = await get('/admin', 'tok-rando');
  check(r.status === 307 && r.loc === '/admin/login?denied=1', 'signed in but NOT staff: sent to the denied page, no dashboard');
  r = await get('/admin/login?denied=1', 'tok-rando');
  check(r.status === 200 && /not staff for this site/.test(r.body), 'the denied page explains and offers sign-out (no redirect loop)');

  r = await get('/admin', 'tok-bogus');
  check(r.status === 307 && /\/admin\/login/.test(r.loc ?? ''), 'a forged or unknown token is treated as signed out');
  r = await get('/admin/login?next=https://evil.example');
  check(/name="next" value="\/admin"/.test(r.body), 'login ignores an off-site next');

  // ---- business list ----
  r = await get('/admin/businesses');
  check(r.status === 307 && r.loc === '/admin/login?next=%2Fadmin%2Fbusinesses', 'signed out: the list redirects to login');
  r = await get('/admin/businesses', 'tok-editor');
  check(r.status === 307 && r.loc === '/admin', 'editor has no access to the business list (back to the dashboard)');
  r = await get('/admin/businesses', 'tok-sales');
  const lt = text(r.body);
  check(r.status === 200 && /Alpha Plumbing/.test(lt) && /Bravo Cafe/.test(lt), 'sales: the list shows the rows');
  check(/60 businesses/.test(lt) && /Page 1 of 3/.test(lt), 'shows the total and "Page 1 of 3" (25 per page)');
  check(/Gold verified/.test(lt) && /Not verified/.test(lt) && /Featured/.test(lt) && /Lead: Interested/.test(lt), 'badges are written out in words, not colour alone');
  check(lastList.p_offset === 0 && lastList.p_limit === 25 && lastList.p_status === null, 'default filters reach the RPC unchanged');
  check(/href="tel:3075550101"/.test(r.body), 'phone numbers are tap-to-call on mobile');
  check(/<label[^>]*for="q"/.test(r.body) && /<label[^>]*for="stage"/.test(r.body) && /<label[^>]*for="verified"/.test(r.body), 'every filter has a label');
  check(/<nav[^>]*aria-label="Pagination"/.test(r.body) && /rel="next"/.test(r.body) && !/rel="prev"/.test(r.body), 'pagination: Next on page 1, no Previous');

  r = await get('/admin/businesses?status=prospect&tier=enhanced&stage=lead&verified=yes&page=2&community=3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b&category=%27%3B--&q=roof', 'tok-sales');
  check(lastList.p_status?.[0] === 'prospect' && lastList.p_tier === 'enhanced' && lastList.p_stage === null && lastList.p_verified === true && lastList.p_offset === 25 && lastList.p_q === 'roof', 'valid filters are forwarded, the invalid stage is dropped, page 2 = offset 25');
  check(lastList.p_community === '3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b' && lastList.p_category === null, 'a real id is kept; a hostile category id is dropped');
  check(/rel="prev"/.test(r.body) && /Page 2 of 3/.test(text(r.body)), 'page 2 has Previous');
  check(/value="roof"/.test(r.body), 'the search box keeps what was typed');
  r = await get('/admin/businesses?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E', 'tok-sales');
  check(!/<script>alert\(1\)<\/script>/.test(r.body) && /&lt;script&gt;/.test(r.body), 'search text is escaped when shown');
  listRows = [];
  r = await get('/admin/businesses?q=zzz', 'tok-sales');
  check(/No businesses match these filters/.test(r.body) && /0 businesses match/.test(text(r.body)), 'empty result has a clear message');
  check(/href="\/admin\/businesses"[^>]*>Clear/.test(r.body), 'filtered view offers Clear');

  r = await get('/businesses');
  check(r.status === 200 && !/x-robots-tag/i.test([...r.headers.keys()].join()), 'public pages are not affected by the admin proxy');
  if (process.argv.includes('--layout')) {   // real-browser layout of the admin pages, signed in against the mock
    listRows = [{ id: 'b1', slug: 'a', name: 'Alpha Plumbing & Heating of Star Valley Ranch', status: 'unclaimed', phone: '(307) 555-0101', verification_level: 'gold', community: 'Star Valley Ranch', category: 'Home & Property Services', lead_stage: 'interested', tier: 'enhanced', featured: true }];
    try { console.log((await run('node', ['scripts/check-layout.mjs', port, host], { env: { ...process.env, ADMIN_COOKIE: cookieFor('tok-sales') }, timeout: 240000 })).stdout); }
    catch (e) { console.log(e.stdout ?? ''); failed++; }
  }
} finally { mock.close(); }

if (failed) { console.error(`\n${failed} admin smoke check(s) failed`); process.exit(1); }
console.log('\nall admin smoke checks passed');
