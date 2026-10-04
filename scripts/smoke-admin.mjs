// Exercises the admin guard end to end against a MOCK of Supabase auth + RPC (no real Supabase needed).
// It proves our wiring (proxy, session cookie, staff check, dashboard, denied path), NOT real Supabase behaviour.
// Start the app first, pointing it at the mock:
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npm run dev -- -p 3101
//   node scripts/smoke-admin.mjs [appPort] [host]
import http from 'node:http';

const port = process.argv[2] ?? '3101';
const host = process.argv[3] ?? 'star-valley.localhost';
const MOCK = 54399;
const base = `http://localhost:${port}`;
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };

const USERS = { 'tok-sales': { id: 'u-sales', email: 'sales@example.test', role: 'sales' }, 'tok-editor': { id: 'u-editor', email: 'editor@example.test', role: 'editor' }, 'tok-rando': { id: 'u-rando', email: 'rando@example.test', role: null } };
const calls = [];
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

  r = await get('/businesses');
  check(r.status === 200 && !/x-robots-tag/i.test([...r.headers.keys()].join()), 'public pages are not affected by the admin proxy');
} finally { mock.close(); }

if (failed) { console.error(`\n${failed} admin smoke check(s) failed`); process.exit(1); }
console.log('\nall admin smoke checks passed');
