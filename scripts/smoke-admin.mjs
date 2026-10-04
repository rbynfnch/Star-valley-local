// Exercises the admin guard end to end against a MOCK of Supabase auth + RPC (no real Supabase needed).
// It proves our wiring (proxy, session cookie, staff check, dashboard, denied path), NOT real Supabase behaviour.
// Start the app first, pointing it at the mock:
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npm run dev -- -p 3101
//   node scripts/smoke-admin.mjs [appPort] [host]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);   // async: the mock server lives in THIS process and must keep answering

const port = process.argv[2] ?? '3101';
const host = process.argv[3] ?? 'star-valley.localhost';
import { BIZ, cookieFor, freshDetail, freshModRows, freshOverview, startMock, state } from './mock-supabase.mjs';
const base = `http://localhost:${port}`;
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) failed++; };
state.listRows = [
  { id: 'b1', slug: 'a', name: 'Alpha Plumbing', status: 'unclaimed', phone: '(307) 555-0101', verification_level: 'gold', community: 'Thayne', category: 'Plumbing', lead_stage: 'interested', tier: 'enhanced', featured: true },
  { id: 'b2', slug: 'b', name: 'Bravo Cafe', status: 'prospect', phone: null, verification_level: 'none', community: null, category: null, lead_stage: 'new', tier: 'free', featured: false }];
const mock = await startMock();
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
  check(state.lastList.p_offset === 0 && state.lastList.p_limit === 25 && state.lastList.p_status === null, 'default filters reach the RPC unchanged');
  check(/href="tel:3075550101"/.test(r.body), 'phone numbers are tap-to-call on mobile');
  check(/<label[^>]*for="q"/.test(r.body) && /<label[^>]*for="stage"/.test(r.body) && /<label[^>]*for="verified"/.test(r.body), 'every filter has a label');
  check(/<nav[^>]*aria-label="Pagination"/.test(r.body) && /rel="next"/.test(r.body) && !/rel="prev"/.test(r.body), 'pagination: Next on page 1, no Previous');

  r = await get('/admin/businesses?status=prospect&tier=enhanced&stage=lead&verified=yes&page=2&community=3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b&category=%27%3B--&q=roof', 'tok-sales');
  check(state.lastList.p_status?.[0] === 'prospect' && state.lastList.p_tier === 'enhanced' && state.lastList.p_stage === null && state.lastList.p_verified === true && state.lastList.p_offset === 25 && state.lastList.p_q === 'roof', 'valid filters are forwarded, the invalid stage is dropped, page 2 = offset 25');
  check(state.lastList.p_community === '3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b' && state.lastList.p_category === null, 'a real id is kept; a hostile category id is dropped');
  check(/rel="prev"/.test(r.body) && /Page 2 of 3/.test(text(r.body)), 'page 2 has Previous');
  check(/value="roof"/.test(r.body), 'the search box keeps what was typed');
  r = await get('/admin/businesses?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E', 'tok-sales');
  check(!/<script>alert\(1\)<\/script>/.test(r.body) && /&lt;script&gt;/.test(r.body), 'search text is escaped when shown');
  state.listRows = [];
  r = await get('/admin/businesses?q=zzz', 'tok-sales');
  check(/No businesses match these filters/.test(r.body) && /0 businesses match/.test(text(r.body)), 'empty result has a clear message');
  check(/href="\/admin\/businesses"[^>]*>Clear/.test(r.body), 'filtered view offers Clear');

  // ---- business detail ----
  state.detail = freshDetail();
  r = await get(`/admin/businesses/${BIZ}`);
  check(r.status === 307 && /\/admin\/login/.test(r.loc ?? ''), 'signed out: detail redirects to login');
  r = await get(`/admin/businesses/${BIZ}`, 'tok-editor');
  check(r.status === 307 && r.loc === '/admin', 'editor has no access to business detail');
  r = await get('/admin/businesses/not-a-uuid', 'tok-sales');
  check(r.status === 404, 'a malformed id is a 404 (and never reaches the database)');
  check(!state.rpc.some((c) => c.name === 'admin_business_detail' && c.body.p_business === 'not-a-uuid'), 'the malformed id was not sent to the RPC');
  state.detail = null;
  r = await get(`/admin/businesses/${BIZ}`, 'tok-sales');
  check(r.status === 404, 'a business that is not in this tenant (RPC returns null) is a 404');
  state.detail = freshDetail();
  r = await get(`/admin/businesses/${BIZ}`, 'tok-sales');
  const dt = text(r.body);
  check(r.status === 200 && /Alpha Plumbing/.test(dt) && /Plumbing · Thayne · Unclaimed/.test(dt), 'sales: detail renders the business header');
  check(/Phone\s+\(307\) 555-0101\s+Owner edited · Mar 2, 2026/.test(dt) && /Name\s+Alpha Plumbing\s+Imported/.test(dt) && /Short description\s+Pipes\s+Staff edited/.test(dt), 'provenance words sit beside each value (owner / imported / staff), dated in the tenant timezone');
  check(/Gold verified · since Mar 1, 2026/.test(dt) && /Re-verify by Mar 1, 2027/.test(dt) && /Sms code · Mar 1, 2026/.test(dt) && /Postcard/.test(dt), 'verification: level, dates and proofs');
  check(/Enhanced · Active · Paid/.test(dt) && /Category · Plumbing/.test(dt) && /Active · Paid · Apr 1, 2026 to Oct 30, 2026/.test(dt), 'listing and placements');
  check(/No social links: social opportunity/.test(dt) && /Has a website/.test(dt) && /No Google profile linked/.test(dt), 'marketing opportunity indicators');
  check(/Pat Owner/.test(dt) && /Website · Proposal · \$2,500/.test(dt) && /Interested in: Website, Seo aeo/.test(dt) && /Next: Bring postcard \(Oct 12, 2026\)/.test(dt), 'contacts, opportunities, services interest and next action');
  check(/Visit · Pitched · Dropped by/.test(dt) && /· you/.test(dt), 'activity log shows kind, outcome, subject and who');
  check(!/<b>idea<\/b>/.test(r.body) && /&lt;b&gt;idea&lt;\/b&gt;/.test(r.body), 'note text is escaped (no HTML injection from the log)');
  check(/href="tel:\+13075550101"/.test(r.body) && /href="\/business\/alpha-plumbing"/.test(r.body), 'call button and public-page link (published business)');
  check(/<label[^>]*for="stage"/.test(r.body) && /<label[^>]*for="kind"/.test(r.body) && /<label[^>]*for="body"/.test(r.body) && /<label[^>]*for="follow_up"/.test(r.body), 'every form field has a label');
  check(!/SECRET|evidence/i.test(r.body), 'no proof evidence in the page');
  state.detail.business.status = 'prospect';
  r = await get(`/admin/businesses/${BIZ}`, 'tok-sales');
  check(!/View public page/.test(r.body), 'a prospect has no public-page link');

  // ---- edit page access ----
  state.detail = freshDetail();
  r = await get(`/admin/businesses/${BIZ}/edit`);
  check(r.status === 307 && /\/admin\/login/.test(r.loc ?? ''), 'signed out: the edit page redirects to login');
  r = await get(`/admin/businesses/${BIZ}/edit`, 'tok-editor');
  check(r.status === 307 && r.loc === '/admin', 'editor cannot open the edit page');
  r = await get('/admin/businesses/nope/edit', 'tok-sales');
  check(r.status === 404, 'edit with a malformed id is a 404');
  r = await get(`/admin/businesses/${BIZ}/edit`, 'tok-sales');
  check(r.status === 200 && /Edit business/.test(text(r.body)) && /<label[^>]*for="website"/.test(r.body) && /<label[^>]*for="short_description"/.test(r.body), 'sales: the edit page renders with labelled fields');
  check(/href="\/admin\/businesses\/[0-9a-f-]+\/edit"/.test((await get(`/admin/businesses/${BIZ}`, 'tok-sales')).body), 'the detail page links to Edit');
  r = await get(`/admin/businesses/${BIZ}?saved=1`, 'tok-sales');
  check(/Changes saved\./.test(text(r.body)), 'the saved banner shows after an edit');

  // ---- moderation access ----
  state.modRows = freshModRows();
  r = await get('/admin/moderation');
  check(r.status === 307 && r.loc === '/admin/login?next=%2Fadmin%2Fmoderation', 'signed out: moderation redirects to login');
  r = await get('/admin/moderation', 'tok-rando');
  check(r.status === 307 && r.loc === '/admin/login?denied=1', 'signed in but not staff: moderation is refused');
  r = await get('/admin/moderation', 'tok-editor');
  check(r.status === 200 && /Sourdough Corner/.test(text(r.body)), 'editor: can open the moderation queue');
  r = await get('/admin/moderation', 'tok-sales');
  check(r.status === 200 && /Suggested update for/.test(text(r.body)) && /Submitted event/.test(text(r.body)), 'sales: can open the moderation queue');
  check(/<a[^>]*href="\/admin\/moderation"[^>]*>Moderation<\/a>/.test(r.body), 'the admin nav links to Moderation');
  r = await get('/admin', 'tok-sales');
  check(/Waiting for review\s+4/.test(text(r.body)), 'the dashboard shows how many submissions are waiting');

  // ---- import access ----
  r = await get('/admin/import');
  check(r.status === 307 && r.loc === '/admin/login?next=%2Fadmin%2Fimport', 'signed out: import redirects to login');
  r = await get('/admin/import', 'tok-editor');
  check(r.status === 307 && r.loc === '/admin', 'editor cannot open the import page');
  r = await get('/admin/import', 'tok-sales');
  check(r.status === 200 && /Import businesses/.test(text(r.body)) && /<label[^>]*for="csv-file"/.test(r.body), 'sales: the import page renders with a labelled file input');
  check(/<a[^>]*href="\/admin\/import"[^>]*>Import<\/a>/.test(r.body), 'the admin nav links to Import');

  // ---- placements access ----
  state.overview = freshOverview();
  r = await get('/admin/placements');
  check(r.status === 307 && r.loc === '/admin/login?next=%2Fadmin%2Fplacements', 'signed out: placements redirects to login');
  r = await get('/admin/placements', 'tok-editor');
  check(r.status === 307 && r.loc === '/admin', 'editor cannot open the placements manager');
  r = await get('/admin/placements', 'tok-sales');
  check(r.status === 200 && /Only admins can change placements/.test(text(r.body)) && !/>End now</.test(r.body), 'sales: can read placements but sees no action buttons');
  r = await get('/admin/placements', 'tok-admin');
  check(r.status === 200 && /Plumber One/.test(text(r.body)) && />End now</.test(r.body) && />Promote</.test(r.body), 'admin: sees holders, waitlist and the action buttons');
  check(/<a[^>]*href="\/admin\/placements"[^>]*>Placements<\/a>/.test(r.body), 'the admin nav links to Placements');
  state.detail = freshDetail(); state.detail.business.status = 'unclaimed';
  r = await get(`/admin/businesses/${BIZ}`, 'tok-admin');
  check(r.status === 200 && /Plan and placements/.test(text(r.body)) && /<label[^>]*for="l-amount"/.test(r.body) && /<label[^>]*for="p-slot"/.test(r.body), 'admin: the business page has labelled plan and placement forms');

  r = await get('/businesses');
  check(r.status === 200 && !/x-robots-tag/i.test([...r.headers.keys()].join()), 'public pages are not affected by the admin proxy');
  if (process.argv.includes('--layout')) {
    state.overview = freshOverview(); state.modRows = freshModRows(); state.detail = freshDetail(); state.detail.business.name = 'Alpha Plumbing & Heating of Star Valley Ranch with an Unreasonably Long Name'; state.detail.communications[0].body = 'x'.repeat(200); state.detail.business.description = 'y'.repeat(300); state.detail.business.website = 'https://example.com/' + 'z'.repeat(150);   // real-browser layout of the admin pages, signed in against the mock
    state.listRows = [{ id: 'b1', slug: 'a', name: 'Alpha Plumbing & Heating of Star Valley Ranch', status: 'unclaimed', phone: '(307) 555-0101', verification_level: 'gold', community: 'Star Valley Ranch', category: 'Home & Property Services', lead_stage: 'interested', tier: 'enhanced', featured: true }];
    try { console.log((await run('node', ['scripts/check-layout.mjs', port, host], { env: { ...process.env, ADMIN_COOKIE: cookieFor('tok-admin') }, timeout: 240000 })).stdout); }
    catch (e) { console.log(e.stdout ?? ''); failed++; }
  }
} finally { mock.close(); }

if (failed) { console.error(`\n${failed} admin smoke check(s) failed`); process.exit(1); }
console.log('\nall admin smoke checks passed');
