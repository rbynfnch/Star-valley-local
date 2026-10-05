// A tiny MOCK of the Supabase calls the admin makes (auth user + a few RPCs/tables). For local smoke/e2e scripts only.
// It proves our wiring, NOT real Supabase behaviour. State is exported so scripts can set up data and inspect calls.
import http from 'node:http';
import crypto from 'node:crypto';

export const MOCK_PORT = 54399;
export const BIZ = '3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b';
export const USERS = {
  'tok-sales': { id: 'u-sales', email: 'sales@example.test', role: 'sales' },
  'tok-editor': { id: 'u-editor', email: 'editor@example.test', role: 'editor' },
  'tok-rando': { id: 'u-rando', email: 'rando@example.test', role: null },
  'tok-owner': { id: 'u-owner', email: 'owner@example.test', role: null },
  'tok-admin': { id: 'u-admin', email: 'admin@example.test', role: 'admin' },
};
export const PASSWORDS = { 'owner@example.test': 'correct-horse-battery' };
export const SERVICE_KEY = 'service-secret';
export const state = {
  rpc: [],            // [{ name, body }] every RPC call received
  lastList: null,
  listRows: [],
  failNext: null,     // an rpc name (next call returns 500) or { rpc, status, body } for a specific error response
  detail: null,       // set by scripts; null = business not found
  sms: [],            // Twilio messages received: { auth, from, to, body }
  claims: {},         // claim id -> { user, secret, attempts, status }
  claimCancels: [],   // claim ids set to 'cancelled' through the REST API
  nextSecret: '482913',
  claimStartError: null,   // { status, body } to make claim_start fail
  smsFail: false,
  signups: [],
  submissions: [],    // submission_create arguments
  modRows: [],        // moderation queue rows (see freshModRows)
  existingBusinesses: [],   // rows returned for the planner's duplicate lookup
  overview: null,           // admin_placements_overview result (see freshOverview)
  owned: new Set(),         // business ids the signed-in owner owns (business_owners lookup)
  placementResult: null,    // override for activate_placement, e.g. { result: 'full' }
  joinError: null,          // { status, body } for join_waitlist
  imported: [],             // import_businesses row arrays received
  duplicateFor: [],   // submission ids whose business approval reports a duplicate until forced
  autoConfirm: false,
  content: null,      // business_content payload (see freshContent)
  storage: {},        // uploaded object path -> { type, size, auth }
  storageRemoved: [], // object paths removed through the storage API
  tracking: [],       // record_tracking arguments received
  activity: null,     // admin_business_activity result (see freshActivity)
  email: { batches: [], completes: [], fails: [], suppressions: [], maintenance: 0, maintenanceFails: false, queueView: null, retries: [], retryError: null, postmark: [], postmarkReplies: [] },
};
export const freshDetail = () => ({
  business: { id: BIZ, slug: 'alpha-plumbing', name: 'Alpha Plumbing', status: 'unclaimed', community: 'Thayne', category: 'Plumbing', home_community_id: '3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b', primary_category_id: '4f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b', address_line1: '1 Main St', address_line2: null, city: 'Thayne', state: 'WY', postal_code: '83127',
    phone: '(307) 555-0101', website: 'https://alpha.example', email: null, short_description: 'Pipes', description: null, hours_note: null, google_place_id: null, legal_name: null,
    verification_level: 'gold', verified_at: '2026-03-01T12:00:00Z', reverify_due_at: '2027-03-01T12:00:00Z', claimed_at: '2026-03-01T12:00:00Z', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
  provenance: [{ field: 'phone', source: 'owner', updated_at: '2026-03-02T12:00:00Z' }, { field: 'name', source: 'import', updated_at: '2026-01-01T12:00:00Z' }, { field: 'short_description', source: 'admin', updated_at: '2026-02-01T12:00:00Z' }],
  crm: { lead_stage: 'interested', services_interest: ['website', 'seo_aeo'], next_action: 'Bring postcard', next_action_at: '2026-10-12T15:00:00Z', lost_reason: null },
  listing: { tier: 'enhanced', status: 'active', source: 'paid', starts_at: '2026-03-01T00:00:00Z', ends_at: null },
  placements: [{ id: 'p1', slot_type: 'category', scope: 'Plumbing', status: 'active', source: 'paid', start_at: '2026-04-01T15:00:00Z', end_at: '2026-10-30T15:00:00Z' }],
  proofs: [{ kind: 'sms_code', verified_at: '2026-03-01T12:00:00Z', revoked_at: null }, { kind: 'postcard', verified_at: '2026-03-05T12:00:00Z', revoked_at: null }],
  owners: 1,
  contacts: [{ id: 'c1', name: 'Pat Owner', role: 'Owner', email: 'pat@alpha.example', phone: '(307) 555-0102', is_primary: true }],
  opportunities: [{ id: 'o1', service: 'website', stage: 'proposal', value_cents: 250000, expected_close: '2026-11-01' }],
  communications: [{ id: 'm1', kind: 'visit', outcome: 'pitched', subject: 'Dropped by', body: 'Liked the badge <b>idea</b>', follow_up_at: null, occurred_at: '2026-10-01T16:00:00Z', by_me: true }],
  indicators: { has_website: true, has_social: false, has_google_profile: false },
});

export const freshContent = () => ({
  enhanced: true, home_community_id: BIZ, primary_category_id: '4f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b', highlights: ['Family owned'], price_range: 2,
  hours: [{ day: 1, opens: '08:00', closes: '17:00' }], services: ['Drain cleaning', 'Water heaters'], links: [{ kind: 'facebook', url: 'https://facebook.com/alpha' }],
  faqs: [{ question: 'Free quotes?', answer: 'Yes.' }], community_ids: [], category_ids: [],
  deals: [{ id: 'd0000000-0000-4000-8000-000000000001', title: '10% off first visit', description: null, terms: null, discount_type: 'percent', discount_value: 10, status: 'published', starts_at: '2026-07-01T06:00:00Z', ends_at: '2026-12-01T07:00:00Z' }],
  photos: [{ id: 'f0000000-0000-4000-8000-000000000001', role: 'cover', caption: 'The shop', alt: 'Front of the shop', bucket: 'media', path: `a0000000-0000-4000-8000-000000000001/${BIZ}/cover.png`, width: 800, height: 600 }],
});

export const freshEmailQueue = () => ({
  counts: { queued: 2, failed: 1, sent_7d: 14, cancelled_7d: 3 },
  rows: [
    { id: 'e0000000-0000-4000-8000-000000000001', kind: 'placement_renewal_reminder', status: 'failed', recipient_email: 'pat@alpha.example', business_id: BIZ, business_name: 'Alpha Plumbing', attempts: 5, last_error: 'postmark 422 #406: Inactive recipient <b>x</b>', created_at: '2026-10-01T15:00:00Z', send_after: '2026-10-01T15:00:00Z', sent_at: null },
    { id: 'e0000000-0000-4000-8000-000000000002', kind: 'verification_reminder', status: 'queued', recipient_email: 'long.address.that.keeps.going.and.going@a-very-long-domain-name-for-layout-testing.example', business_id: BIZ, business_name: 'Alpha Plumbing', attempts: 0, last_error: null, created_at: '2026-10-03T15:00:00Z', send_after: '2026-10-06T15:00:00Z', sent_at: null },
    { id: 'e0000000-0000-4000-8000-000000000003', kind: 'listing_renewal_reminder', status: 'sent', recipient_email: 'sam@bravo.example', business_id: BIZ, business_name: 'Bravo Cafe', attempts: 1, last_error: null, created_at: '2026-09-20T15:00:00Z', send_after: '2026-09-20T15:00:00Z', sent_at: '2026-09-20T15:01:00Z' },
  ],
});

export const freshActivity = () => ({
  days: 30, visitors: 143, first_event_at: '2026-09-01T00:00:00Z',
  current: { profile_view: 212, phone_click: 14, website_click: 31, directions_click: 9, search_appearance: 640, quote_request: 2 },
  previous: { profile_view: 180, phone_click: 14, website_click: 12 },
  top_searches: [{ query: 'plumber in thayne', n: 40 }, { query: '<b>water heater</b>', n: 12 }],
});

export const SUB_IDS = { update: '11111111-1111-4111-8111-111111111111', business: '22222222-2222-4222-8222-222222222222', event: '33333333-3333-4333-8333-333333333333', xss: '44444444-4444-4444-8444-444444444444' };
export const freshModRows = () => [
  { id: SUB_IDS.update, kind: 'update', status: 'pending', payload: { fields: { phone: '307-555-0188', website: 'https://new.example', hours: 'Mon-Fri 8-5' }, note: 'We moved', closed: true }, submitter_name: 'Pat', submitter_email: 'pat@example.com', submitter_phone: null, created_at: '2026-10-01T15:00:00Z', reviewed_at: null, resolution_notes: null, business_id: BIZ, business_name: 'Alpha Plumbing', business_slug: 'alpha-plumbing' },
  { id: SUB_IDS.business, kind: 'business', status: 'pending', payload: { name: 'Sourdough Corner', category_text: 'Bakery', phone: '307-555-0801', website: 'https://sourdough.example', description: 'Fresh bread' }, submitter_name: 'Robin', submitter_email: 'robin@example.com', submitter_phone: '307-555-0802', created_at: '2026-10-02T15:00:00Z', reviewed_at: null, resolution_notes: null, business_id: null, business_name: null, business_slug: null },
  { id: SUB_IDS.event, kind: 'event', status: 'pending', payload: { title: 'Autumn Fair', description: 'Pies', starts_at: '2026-10-18T00:30:00Z', ends_at: '2026-10-18T03:00:00Z', venue_name: 'Town Park', organizer: 'Fair Committee' }, submitter_name: null, submitter_email: 'sam@example.com', submitter_phone: null, created_at: '2026-10-03T15:00:00Z', reviewed_at: null, resolution_notes: null, business_id: null, business_name: null, business_slug: null },
  { id: SUB_IDS.xss, kind: 'business', status: 'pending', payload: { name: '<img src=x onerror=alert(1)>', note: '<script>alert(2)</script>' }, submitter_name: '<b>Eve</b>', submitter_email: 'eve@example.com', submitter_phone: null, created_at: '2026-10-04T15:00:00Z', reviewed_at: null, resolution_notes: null, business_id: null, business_name: null, business_slug: null },
];

export const IDS = { home: 'a0000000-0000-4000-8000-000000000001', w1: 'b0000000-0000-4000-8000-000000000001', w2: 'b0000000-0000-4000-8000-000000000002', live: 'a0000000-0000-4000-8000-000000000099' };
export const freshOverview = () => ({
  slots: [
    { slot_type: 'homepage', scope_id: null, scope_name: null, max_slots: 6, used: 1, holders: [{ id: IDS.home, business_id: BIZ, business_name: 'Alpha Plumbing', source: 'paid', start_at: '2026-09-01T15:00:00Z', end_at: '2026-10-12T15:00:00Z', auto_renews: false, upcoming: false }], waitlist: [] },
    { slot_type: 'things_to_do', scope_id: null, scope_name: null, max_slots: 6, used: 0, holders: [], waitlist: [] },
    { slot_type: 'category', scope_id: '4f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b', scope_name: 'Plumbing', max_slots: 3, used: 3,
      holders: ['One', 'Two', 'Three'].map((n, i) => ({ id: `a0000000-0000-4000-8000-00000000001${i}`, business_id: BIZ, business_name: `Plumber ${n}`, source: i === 1 ? 'founding_member' : 'paid', start_at: '2026-08-01T15:00:00Z', end_at: '2027-02-01T15:00:00Z', auto_renews: i === 0, upcoming: false })),
      waitlist: [{ id: IDS.w1, business_id: BIZ, business_name: 'Waiting Plumber', since: '2026-09-20T15:00:00Z', eligible: true }, { id: IDS.w2, business_id: BIZ, business_name: 'Not Ready Plumber', since: '2026-09-25T15:00:00Z', eligible: false }] },
  ],
  listings: [{ id: 'l-1', business_id: BIZ, business_name: 'Alpha Plumbing', source: 'paid', ends_at: '2026-10-20T15:00:00Z', auto_renews: false }, { id: 'l-2', business_id: BIZ, business_name: 'Founding Cafe', source: 'founding_member', ends_at: null, auto_renews: false }],
});
export const PRODUCTS = [
  { code: 'enhanced_monthly', name: 'Enhanced (monthly)', kind: 'listing', interval: 'month', amount_cents: 1900 },
  { code: 'enhanced_yearly', name: 'Enhanced (yearly)', kind: 'listing', interval: 'year', amount_cents: 19900 },
  { code: 'featured_monthly', name: 'Featured placement (monthly)', kind: 'placement', interval: 'month', amount_cents: 4900 },
];

export function startMock() {
  const server = http.createServer((req, res) => {
    const tok = (req.headers.authorization ?? '').replace('Bearer ', '');
    const u = USERS[tok];
    let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
      const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)/.exec(req.url)?.[1];
      let args = {}; try { args = JSON.parse(body || '{}'); } catch { /* not json */ }
      if (rpc) { state.rpc.push({ name: rpc, body: args, key: tok }); const f = state.failNext;
        if (f && (f === rpc || f.rpc === rpc)) { state.failNext = null; return typeof f === 'string' ? json(500, { message: 'boom' }) : json(f.status ?? 400, f.body ?? { message: 'boom' }); } }
      if (req.url.startsWith('/auth/v1/token')) {
        const a = JSON.parse(body || '{}'); const ok = PASSWORDS[a.email] && PASSWORDS[a.email] === a.password;
        if (!ok) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        const tok = a.email === 'owner@example.test' ? 'tok-owner' : 'tok-sales';
        return json(200, { access_token: tok, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: USERS[tok].id, email: a.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } });
      }
      if (req.url.startsWith('/auth/v1/signup')) {
        const a = JSON.parse(body || '{}'); state.signups.push(a);
        const user = { id: 'u-new', email: a.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
        return json(200, state.autoConfirm ? { access_token: 'tok-owner', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user } : user);
      }
      if (req.method === 'POST' && /^\/2010-04-01\/Accounts\/[^/]+\/Messages\.json/.test(req.url)) {
        const f = new URLSearchParams(body); state.sms.push({ auth: req.headers.authorization, from: f.get('From'), to: f.get('To'), body: f.get('Body') });
        return state.smsFail ? json(400, { message: 'Invalid To number +13075550111 token secret' }) : json(201, { sid: 'SM1' });
      }
      if (req.method === 'PATCH' && req.url.startsWith('/rest/v1/claims')) { const id = /id=eq\.([0-9a-f-]+)/.exec(req.url)?.[1]; if (id) state.claimCancels.push(id); return json(204, null); }
      if (rpc === 'submission_create') { state.rpc.at(-1).key = tok; state.submissions.push(args); return json(200, 'sub-' + state.submissions.length); }
      if (rpc === 'admin_list_submissions') {
        if (!u?.role) return json(403, { code: '42501', message: 'moderators only' });
        const rows = state.modRows.filter((r) => r.status === (args.p_status ?? 'pending') && (!args.p_kind || r.kind === args.p_kind));
        const by = {}; for (const r of state.modRows) if (r.status === 'pending') by[r.kind] = (by[r.kind] ?? 0) + 1;
        return json(200, { total: rows.length, pending_by_kind: by, rows });
      }
      if (rpc === 'review_submission') {
        if (!u?.role) return json(403, { code: '42501', message: 'moderators only' });
        const row = state.modRows.find((r) => r.id === args.p_id);
        if (!row || row.status !== 'pending') return json(400, { code: '22023', message: 'this submission was already reviewed' });
        if (args.p_action === 'approve' && row.kind === 'business' && state.duplicateFor.includes(row.id) && !args.p_force) return json(200, { result: 'duplicate', business_id: BIZ, business_name: 'Alpha Plumbing', reason: 'phone' });
        row.status = args.p_action === 'approve' ? 'approved' : args.p_action === 'reject' ? 'rejected' : 'spam'; row.reviewed_at = new Date().toISOString(); row.resolution_notes = args.p_notes;
        if (args.p_action !== 'approve') return json(200, { result: row.status });
        if (row.kind === 'business') return json(200, { result: 'approved', business_id: BIZ });
        if (row.kind === 'event') return json(200, { result: 'approved', event_id: 'ev1', slug: 'autumn-fair' });
        return json(200, args.p_apply ? { result: 'approved', applied: Object.keys(row.payload.fields ?? {}).filter((k) => k !== 'hours').sort() } : { result: 'approved' });
      }
      const adminOnly = ['activate_listing', 'end_listing', 'activate_placement', 'end_placement', 'add_to_waitlist'];
      if (adminOnly.includes(rpc)) {
        if (u?.role !== 'admin') return json(403, { code: '42501', message: 'only admins can change a placement' });
        if (rpc === 'activate_placement') return json(200, state.placementResult ?? { result: 'active', placement_id: 'pl-1' });
        if (rpc === 'activate_listing') return json(200, { listing_id: 'li-1', extended: !!args.p_notes?.includes('extend') });
        if (rpc === 'end_listing') return json(200, { ended_paid_placements: Number(state.endedPaid ?? 1) });
        if (rpc === 'end_placement') return json(200, { result: 'ended now' });
        return json(200, { id: 'wl-new', already: false });
      }
      if (rpc === 'admin_placements_overview') { if (!u?.role || u.role === 'editor') return json(403, { code: '42501', message: 'sales staff only' }); return json(200, state.overview); }
      if (rpc === 'join_waitlist') { if (state.joinError) return json(state.joinError.status, state.joinError.body); return json(200, { id: 'wl-owner', position: 2 }); }
      if (req.method === 'GET' && req.url.startsWith('/rest/v1/tenant_products')) return json(200, PRODUCTS);
      if (req.method === 'GET' && req.url.startsWith('/rest/v1/business_owners')) { const id = /business_id=eq\.([0-9a-f-]+)/.exec(req.url)?.[1]; return json(200, id && state.owned.has(id) && u ? [{ business_id: id }] : []); }
      if (rpc === 'claim_start') {
        state.rpc.at(-1).key = tok;
        if (state.claimStartError) return json(state.claimStartError.status, state.claimStartError.body);
        const id = crypto.randomUUID(), email = args.p_method === 'email_link';
        const secret = email ? (state.nextToken ?? crypto.randomBytes(32).toString('hex')) : state.nextSecret;
        state.claims[id] = { user: args.p_user, secret, attempts: 0, status: 'pending', method: args.p_method ?? 'sms_code', expired: false };
        return json(200, { claim_id: id, secret, destination: email ? (state.emailDestination ?? 'owner@alpha.example') : '+1' + (state.destinationDigits ?? '3075550111'), method: args.p_method ?? 'sms_code', expires_at: new Date(Date.now() + (email ? 3600000 : 600000)).toISOString() });
      }
      if (rpc === 'claim_options') {
        if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return json(403, { code: '42501', message: 'permission denied' });
        if (state.optionsNull) return json(200, null);
        return json(200, { phone_last4: state.noPhone ? null : (state.destinationDigits ?? '3075550111').slice(-4), email_hint: state.emailHint ?? null });
      }
      if (rpc === 'claim_preview') {
        if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return json(403, { code: '42501', message: 'permission denied' });
        const c = state.claims[args.p_claim];
        if (!c || c.user !== args.p_user) return json(200, null);
        return json(200, { business_name: state.claimBiz?.name ?? 'Sample Smile Dental', slug: state.claimBiz?.slug ?? 'sample-smile-dental', status: c.status, method: c.method, expires_at: new Date().toISOString(), expired: c.expired });
      }
      if (rpc === 'email_is_blocked') {
        if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return json(403, { code: '42501', message: 'permission denied' });
        return json(200, state.blockedEmail === args.p_email);
      }
      if (rpc === 'claim_verify') {
        state.rpc.at(-1).key = tok;
        const c = state.claims[args.p_claim];
        if (!c || c.user !== args.p_user) return json(404, { code: 'P0002', message: 'claim not found' });
        if (c.expired) return json(200, { result: 'expired' });
        if (c.status === 'verified') return json(200, { result: 'verified', already: true });
        if (args.p_secret === c.secret) { c.status = 'verified'; return json(200, { result: 'verified', level: 'green' }); }
        c.attempts++; return json(200, c.attempts >= 5 ? { result: 'rejected' } : { result: 'wrong', attempts_left: 5 - c.attempts });
      }
      if (req.url.startsWith('/auth/v1/user')) return u ? json(200, { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }) : json(401, { msg: 'invalid' });
      if (rpc === 'my_staff_role') return json(200, u?.role ?? null);
      if (rpc === 'admin_dashboard_counts') return !u?.role ? json(403, { code: '42501', message: 'staff only' }) : json(200, { total: 27, prospects: 4, verified: 9, enhanced: 6, featured: 3, needing_verification: 11, pending_submissions: 4 });
      const salesOnly = !u?.role || u.role === 'editor';
      if (rpc === 'admin_list_businesses') { if (salesOnly) return json(403, { code: '42501', message: 'sales staff only' }); state.lastList = args; return json(200, { total: state.listRows.length === 0 ? 0 : 60, rows: state.listRows }); }
      if (rpc === 'admin_business_detail') { if (salesOnly) return json(403, { code: '42501', message: 'sales staff only' }); return json(200, state.detail); }
      if (rpc === 'set_lead_stage') {
        if (salesOnly) return json(403, { code: '42501', message: 'sales staff only' });
        if (state.detail) { state.detail.crm = { ...(state.detail.crm ?? { services_interest: [], next_action: null, next_action_at: null }), lead_stage: args.p_stage, lost_reason: args.p_lost_reason ?? null }; }
        return json(200, null);
      }
      if (rpc === 'add_communication') {
        if (salesOnly) return json(403, { code: '42501', message: 'sales staff only' });
        state.detail?.communications.unshift({ id: 'm' + state.rpc.length, kind: args.p_kind, outcome: args.p_outcome, subject: args.p_subject, body: args.p_body, follow_up_at: args.p_follow_up_at, occurred_at: new Date().toISOString(), by_me: true });
        return json(200, 'new-id');
      }


      // ---- event tracking
      if (rpc === 'record_tracking') {
        if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return json(403, { code: '42501', message: 'permission denied' });
        state.tracking.push(args); return json(200, args.p_events?.length ?? 0);
      }
      if (rpc === 'admin_business_activity') {
        if (!u?.role || u.role === 'editor') return json(403, { code: '42501', message: 'sales staff only' });
        return state.activity ? json(200, state.activity) : json(500, { message: 'boom' });
      }
      // ---- email worker (service role) and the staff queue view
      if (rpc && /^(email_claim_batch|email_complete|email_fail|email_run_maintenance|record_email_suppression)$/.test(rpc)) {
        if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return json(403, { code: '42501', message: 'permission denied' });
        const e = state.email;
        if (rpc === 'email_claim_batch') return json(200, e.batches.shift() ?? []);
        if (rpc === 'email_complete') { e.completes.push(args); return json(200, null); }
        if (rpc === 'email_fail') { e.fails.push(args); return json(200, null); }
        if (rpc === 'email_run_maintenance') { e.maintenance++; return e.maintenanceFails ? json(500, { message: 'boom' }) : json(200, { notifications_queued: 0 }); }
        if (rpc === 'record_email_suppression') { e.suppressions.push(args); return state.failNextSuppression ? json(500, { message: 'boom' }) : json(200, 1); }
      }
      if (rpc === 'admin_email_queue') { if (!u?.role || u.role === 'editor') return json(403, { code: '42501', message: 'sales staff only' }); return json(200, state.email.queueView); }
      if (rpc === 'retry_notification') {
        if (!u?.role || u.role === 'editor') return json(403, { code: '42501', message: 'sales staff only' });
        if (state.email.retryError) return json(400, { code: '22023', message: state.email.retryError });
        state.email.retries.push(args.p_id); const r = state.email.queueView.rows.find((x) => x.id === args.p_id); if (r) { r.status = 'queued'; r.attempts = 0; r.last_error = null; state.email.queueView.counts.failed--; } return json(200, null);
      }
      // ---- Postmark's send endpoint
      if (req.method === 'POST' && req.url === '/email') {
        let b = {}; try { b = JSON.parse(body); } catch { /* ignore */ }
        state.email.postmark.push({ token: req.headers['x-postmark-server-token'], body: b });
        const rep = state.email.postmarkReplies.shift();
        if (rep) return json(rep.status, rep.body);
        return json(200, { ErrorCode: 0, Message: 'OK', MessageID: 'pm-' + state.email.postmark.length, To: b.To });
      }
      // ---- content editor (staff only; the real rules are tested in SQL, the mock only stores what it is sent)
      if (rpc && /^(business_content|set_business_(hours|services|links|faqs|areas)|save_deal|delete_deal|add_business_photo|update_business_photo|delete_business_photo|reorder_business_photos)$/.test(rpc)) {
        if (!u?.role || u.role === 'editor') return json(403, { code: '42501', message: 'sales staff only' });
        const c = state.content;
        if (rpc === 'business_content') return json(200, c);
        if (rpc === 'set_business_hours') { c.hours = args.p_rows; return json(200, null); }
        if (rpc === 'set_business_services') { c.services = args.p_names; return json(200, c.services.length); }
        if (rpc === 'set_business_links') { c.links = args.p_items; return json(200, c.links.length); }
        if (rpc === 'set_business_faqs') { c.faqs = args.p_items; return json(200, c.faqs.length); }
        if (rpc === 'set_business_areas') { c.community_ids = args.p_community_ids; c.category_ids = args.p_category_ids; return json(200, null); }
        if (rpc === 'save_deal') {
          const row = { title: args.p_title, description: args.p_description, terms: args.p_terms, discount_type: args.p_discount_type, discount_value: args.p_discount_value, status: args.p_status, starts_at: args.p_starts_at ?? new Date().toISOString(), ends_at: args.p_ends_at };
          if (args.p_id) { const d = c.deals.find((x) => x.id === args.p_id); if (!d) return json(404, { code: 'P0002', message: 'deal not found' }); Object.assign(d, row); return json(200, d.id); }
          const id = 'd0000000-0000-4000-8000-' + String(c.deals.length + 10).padStart(12, '0'); c.deals.unshift({ id, ...row }); return json(200, id);
        }
        if (rpc === 'delete_deal') { const n = c.deals.length; c.deals = c.deals.filter((x) => x.id !== args.p_id); return c.deals.length === n ? json(404, { code: 'P0002', message: 'deal not found' }) : json(200, null); }
        if (rpc === 'add_business_photo') {
          let replaced = null;
          if (args.p_role !== 'gallery') { const old = c.photos.find((x) => x.role === args.p_role); if (old) { replaced = { bucket: old.bucket, path: old.path }; c.photos = c.photos.filter((x) => x !== old); } }
          const id = 'f0000000-0000-4000-8000-' + String(c.photos.length + 10).padStart(12, '0');
          c.photos.push({ id, role: args.p_role, caption: args.p_caption, alt: args.p_alt || (args.p_role === 'logo' ? 'Alpha Plumbing logo' : null), bucket: args.p_bucket, path: args.p_path, width: args.p_width, height: args.p_height });
          return json(200, { id, replaced });
        }
        if (rpc === 'update_business_photo') {
          const p = c.photos.find((x) => x.id === args.p_photo); if (!p) return json(404, { code: 'P0002', message: 'photo not found' });
          if (args.p_role !== p.role && args.p_role !== 'gallery') for (const o of c.photos) if (o.role === args.p_role) o.role = 'gallery';
          Object.assign(p, { alt: args.p_alt, caption: args.p_caption, role: args.p_role }); return json(200, null);
        }
        if (rpc === 'delete_business_photo') { const p = c.photos.find((x) => x.id === args.p_photo); if (!p) return json(404, { code: 'P0002', message: 'photo not found' }); c.photos = c.photos.filter((x) => x !== p); return json(200, { bucket: p.bucket, path: p.path }); }
        if (rpc === 'reorder_business_photos') { const g = args.p_ids.map((id) => c.photos.find((x) => x.id === id)); const rest = c.photos.filter((x) => !g.includes(x)); c.photos = [...rest.filter((x) => x.role !== 'gallery'), ...g]; return json(200, null); }
      }
      // ---- storage: upload (service key), remove, public read
      if (req.url.startsWith('/storage/v1/')) {
        if (req.method === 'POST' && req.url.startsWith('/storage/v1/object/media/')) {
          const path = decodeURIComponent(req.url.slice('/storage/v1/object/media/'.length).split('?')[0]);
          if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return json(403, { message: 'not allowed' });
          if (state.storage[path]) return json(409, { message: 'exists' });
          state.storage[path] = { type: req.headers['content-type'], size: Number(req.headers['content-length'] ?? 0) }; return json(200, { Key: 'media/' + path });
        }
        if (req.method === 'DELETE' && req.url.startsWith('/storage/v1/object/media')) {
          const a = JSON.parse(body || '{}'); for (const x of a.prefixes ?? []) { delete state.storage[x]; state.storageRemoved.push(x); } return json(200, []);
        }
        if (req.method === 'GET' && req.url.startsWith('/storage/v1/object/public/')) {
          res.writeHead(200, { 'content-type': 'image/png' }); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
        }
        return json(404, {});
      }
      if (rpc === 'update_business_fields') {
        if (salesOnly) return json(403, { code: '42501', message: 'sales staff only' });
        for (const [k, v] of Object.entries(args.p_fields ?? {})) { if (k === 'highlights' || k === 'price_range') { if (state.content) state.content[k] = v; } else state.detail.business[k] = v === '' ? null : v; }
        return json(200, null);
      }
      if (rpc === 'set_business_status') {
        if (salesOnly) return json(403, { code: '42501', message: 'sales staff only' });
        state.detail.business.status = args.p_status; return json(200, args.p_status);
      }
      if (req.method === 'GET' && req.url.startsWith('/rest/v1/businesses')) { const q = new URL(req.url, 'http://x').searchParams; const off = Number(q.get('offset') ?? 0), lim = Number(q.get('limit') ?? 1000); return json(200, state.existingBusinesses.slice(off, off + lim)); }
      if (rpc === 'import_businesses') {
        if (!u?.role || u.role === 'editor') return json(403, { code: '42501', message: 'sales staff only' });
        state.imported.push(args.p_rows);
        return json(200, args.p_rows.map((r, i) => r.name === 'Explode' ? { index: i + 1, result: 'error', message: 'new row for relation "businesses" violates check constraint' } : r.existing_id ? { index: i + 1, result: 'updated', id: r.existing_id } : { index: i + 1, result: 'created', id: crypto.randomUUID(), slug: r.slug }));
      }
      if (req.url.startsWith('/rest/v1/communities')) return json(200, [{ id: BIZ, slug: 'thayne', name: 'Thayne' }, { id: 'c0000000-0000-4000-8000-000000000001', slug: 'alpine', name: 'Alpine' }, { id: 'c0000000-0000-4000-8000-000000000002', slug: 'afton', name: 'Afton' }]);
      if (req.url.startsWith('/rest/v1/categories')) return json(200, [{ id: '4f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b', slug: 'plumbing', name: 'Plumbing', plural_name: 'Plumbers' }, { id: 'd0000000-0000-4000-8000-0000000000c1', slug: 'hvac', name: 'Heating and cooling', plural_name: 'HVAC' }]);
      json(404, {});
    });
  });
  return new Promise((resolve) => server.listen(MOCK_PORT, () => resolve(server)));
}

export const cookieFor = (tok) => {
  const session = { access_token: tok, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: USERS[tok]?.id ?? 'forged', email: USERS[tok]?.email ?? 'forged@example.test' } };
  return `sb-localhost-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
};
