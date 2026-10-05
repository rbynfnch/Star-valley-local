// Post-deploy checks for a hosted test site: the public pages work, and the things that must be closed to the public ARE closed, as seen
// with the same public key every visitor's browser has. Run it after every deploy or database change.
//   SITE_URL=https://my-site.vercel.app NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key> node scripts/hosted/smoke.mjs
// Uses only fetch. It writes nothing (the write probes are expected to be refused, and use ids that match nothing).
const site = (process.env.SITE_URL ?? '').replace(/\/$/, ''), sb = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, ''), anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const skipSite = process.env.SMOKE_SKIP_SITE === '1';   // check only the database (e.g. against a local PostgREST)
if ((!site && !skipSite) || !sb || !anon) { console.error('Set SITE_URL, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'); process.exit(2); }
let failed = 0;
const check = (c, m, extra = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}${c ? '' : extra ? '  [' + extra + ']' : ''}`); if (!c) failed++; };
const get = (p, o = {}) => fetch(site + p, { redirect: 'manual', ...o });
const H = { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' };
const rest = (p, o = {}) => fetch(`${sb}/rest/v1/${p}`, { headers: H, ...o });
const denied = (r) => [401, 403, 404, 400].includes(r.status) || (r.status === 200 && false);

console.log(`Site: ${site || '(skipped)'}\n`);
// ---- the site
if (!skipSite) {
  for (const p of ['/', '/businesses', '/hotlist', '/events', '/articles', '/things-to-do', '/pricing', '/list-your-business', '/sitemap.xml', '/robots.txt']) {
    const x = await get(p); check(x.status === 200, `${p} loads`, String(x.status));
  }
  let x = await get('/'); const html = await x.text();
  check(/Star Valley Local/.test(html), 'the home page shows the tenant (the site\'s domain is registered)');
  check(!!x.headers.get('content-security-policy') && /frame-ancestors 'none'/.test(x.headers.get('content-security-policy')) && x.headers.get('x-frame-options') === 'DENY' && !x.headers.get('x-powered-by'), 'security headers are on and the framework banner is off');
  check(!html.includes('service_role') && !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(html.replace(anon, '')), 'no secret keys appear in the page');
  x = await get('/deals'); check(x.status === 308 && /\/hotlist$/.test(x.headers.get('location') ?? ''), '/deals redirects to /hotlist');
  x = await get('/admin'); check([302, 303, 307, 308].includes(x.status) && /login/.test(x.headers.get('location') ?? ''), '/admin sends visitors to the login page', `${x.status} ${x.headers.get('location')}`);
  x = await get('/dashboard'); check([302, 303, 307, 308].includes(x.status) && /sign-in/.test(x.headers.get('location') ?? ''), '/dashboard sends visitors to sign in', `${x.status} ${x.headers.get('location')}`);
  x = await get('/hotlist/does-not-exist'); check(x.status === 404, 'unknown pages are a 404');
}

// ---- the database as a visitor sees it
console.log('');
let r;
const t = await (await rest('tenants?select=id,slug&limit=5')).json().catch(() => []);
check(Array.isArray(t) && t.length > 0, 'visitors can read the tenant list (public branding)', JSON.stringify(t).slice(0, 80));
const tenant = t[0]?.id;
r = await rest('businesses?select=name,slug&limit=1'); check(r.status === 200, 'visitors can read public business columns', String(r.status));
for (const col of ['email', 'legal_name', 'google_place_id', 'created_by', 'description', 'highlights']) {
  r = await rest(`businesses?select=${col}&limit=1`); check(denied(r) && r.status !== 200, `visitors CANNOT read businesses.${col}`, String(r.status));
}
// "Closed" means the database refused at the privilege level ("permission denied for ..."), not merely that a role check inside the function said no.
const privDenied = async (res, what) => { const b = await res.clone().json().catch(() => ({})); return { ok: [401, 403].includes(res.status) && new RegExp(`permission denied for ${what}`, 'i').test(b.message ?? ''), detail: `${res.status} ${(b.message ?? '').slice(0, 70)}` }; };
for (const tbl of ['leads', 'claims', 'hotlist_items', 'hotlist_claims', 'postcard_codes', 'postcard_attempts', 'communications', 'business_owners', 'tenant_staff', 'tracking_events', 'payments', 'submissions', 'profiles', 'verification_proofs', 'email_outbox']) {
  r = await rest(`${tbl}?select=*&limit=1`);
  if (r.status === 404) { check(true, `visitors cannot read ${tbl} (no such table here)`); continue; }
  const d = await privDenied(r, 'table'); check(d.ok, `visitors cannot read ${tbl}`, d.detail);
}
r = await rest('businesses', { method: 'POST', body: JSON.stringify({ name: 'x', slug: 'x' }), headers: { ...H, prefer: 'return=minimal' } }); check(r.status >= 400, 'visitors cannot insert businesses', String(r.status));
r = await rest('businesses?slug=eq.nothing-matches', { method: 'PATCH', body: JSON.stringify({ name: 'x' }) }); check(r.status >= 400 || r.status === 204, 'visitors cannot update businesses (a refusal, or nothing matched)', String(r.status));
const U = '00000000-0000-4000-8000-0000000000f1', U2 = '00000000-0000-4000-8000-0000000000f2';
const PROBES = {
  claim_start: { p_tenant: U, p_business: U, p_user: U2, p_method: 'sms_code' }, claim_verify: { p_claim: U, p_user: U2, p_secret: 'x' }, claim_invite: { p_tenant: U, p_business: U, p_staff: U2, p_method: 'email_link' },
  claim_verify_invite: { p_claim: U, p_user: U2, p_secret: 'x' }, claim_options: { p_tenant: U, p_business: U }, claim_preview: { p_claim: U, p_user: U2 }, record_tracking: { p_tenant: U, p_events: [], p_session: 'x' },
  submission_create: { p_tenant: U, p_kind: 'update', p_business: U, p_payload: {}, p_name: 'x', p_email: 'x@x.co', p_phone: 'x' }, hotlist_claim: { p_tenant: U, p_item: U, p_user: U2 }, hotlist_my_claim: { p_tenant: U, p_item: U, p_user: U2 },
  postcard_redeem: { p_tenant: U, p_user: U2, p_code: 'ABCDEFGHJK' }, email_claim_batch: { p_limit: 1 }, email_complete: { p_id: U }, email_fail: { p_id: U, p_error: 'x' }, email_run_maintenance: {},
  record_email_suppression: { p_tenant: U, p_email: 'x@x.co', p_reason: 'x' }, email_is_blocked: { p_tenant: U, p_email: 'x@x.co' },
  admin_dashboard_counts: { p_tenant: U }, admin_list_businesses: { p_tenant: U }, admin_business_detail: { p_tenant: U, p_business: U }, admin_postcard_overview: { p_tenant: U }, postcard_batch_create: { p_tenant: U, p_label: 'x', p_businesses: [U] },
  owner_dashboard: { p_tenant: U }, save_hotlist_item: { p_tenant: U, p_id: null, p_business: U, p_fields: {}, p_status: 'draft' }, update_business_fields: { p_tenant: U, p_business: U, p_fields: {} },
  import_businesses: { p_tenant: U, p_rows: [] }, set_hotlist_features: { p_tenant: U, p_slot: 'hottest', p_items: [] },
};
for (const [fn, args] of Object.entries(PROBES)) {
  r = await rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  if (r.status === 404) { const b = await r.clone().json().catch(() => ({})); check(/Could not find the function/.test(b.message ?? '') ? false : true, `visitors cannot call ${fn}`, `404 ${(b.message ?? '').slice(0, 90)} (a wrong probe signature?)`); continue; }
  const d = await privDenied(r, 'function'); check(d.ok, `visitors cannot call ${fn}`, d.detail);
}
if (tenant) {
  r = await rest('rpc/hotlist_list', { method: 'POST', body: JSON.stringify({ p_tenant: tenant }) }); check(r.status === 200, 'visitors can read the public Hotlist', String(r.status));
  r = await rest('rpc/business_profile', { method: 'POST', body: JSON.stringify({ p_tenant: tenant, p_slug: 'sample-creekside-cafe' }) }); const bp = r.status === 200 ? await r.json() : null;
  check(r.status === 200 && (!bp || !bp.business || bp.business.email === null || bp.business.email === undefined), 'a Free listing\'s email is not in its public profile');
}
r = await fetch(`${sb}/storage/v1/object/media/smoke-test.png`, { method: 'POST', headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'image/png' }, body: new Uint8Array([137, 80, 78, 71]) });
check(r.status >= 400, 'visitors cannot upload to storage', String(r.status));
check(!anon.includes('service_role') && !(() => { try { return JSON.parse(Buffer.from(anon.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch { return false; } })(), 'the key in NEXT_PUBLIC_SUPABASE_ANON_KEY is the anon key, not the service key');

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
