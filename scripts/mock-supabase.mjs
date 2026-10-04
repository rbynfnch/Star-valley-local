// A tiny MOCK of the Supabase calls the admin makes (auth user + a few RPCs/tables). For local smoke/e2e scripts only.
// It proves our wiring, NOT real Supabase behaviour. State is exported so scripts can set up data and inspect calls.
import http from 'node:http';

export const MOCK_PORT = 54399;
export const BIZ = '3f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b';
export const USERS = {
  'tok-sales': { id: 'u-sales', email: 'sales@example.test', role: 'sales' },
  'tok-editor': { id: 'u-editor', email: 'editor@example.test', role: 'editor' },
  'tok-rando': { id: 'u-rando', email: 'rando@example.test', role: null },
};
export const state = {
  rpc: [],            // [{ name, body }] every RPC call received
  lastList: null,
  listRows: [],
  failNext: null,     // an rpc name (next call returns 500) or { rpc, status, body } for a specific error response
  detail: null,       // set by scripts; null = business not found
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

export function startMock() {
  const server = http.createServer((req, res) => {
    const tok = (req.headers.authorization ?? '').replace('Bearer ', '');
    const u = USERS[tok];
    let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
      const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)/.exec(req.url)?.[1];
      let args = {}; try { args = JSON.parse(body || '{}'); } catch { /* not json */ }
      if (rpc) { state.rpc.push({ name: rpc, body: args }); const f = state.failNext;
        if (f && (f === rpc || f.rpc === rpc)) { state.failNext = null; return typeof f === 'string' ? json(500, { message: 'boom' }) : json(f.status ?? 400, f.body ?? { message: 'boom' }); } }
      if (req.url.startsWith('/auth/v1/user')) return u ? json(200, { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }) : json(401, { msg: 'invalid' });
      if (rpc === 'my_staff_role') return json(200, u?.role ?? null);
      if (rpc === 'admin_dashboard_counts') return !u?.role ? json(403, { code: '42501', message: 'staff only' }) : json(200, { total: 27, prospects: 4, verified: 9, enhanced: 6, featured: 3, needing_verification: 11 });
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
      if (rpc === 'update_business_fields') {
        if (salesOnly) return json(403, { code: '42501', message: 'sales staff only' });
        for (const [k, v] of Object.entries(args.p_fields ?? {})) state.detail.business[k] = v === '' ? null : v;
        return json(200, null);
      }
      if (rpc === 'set_business_status') {
        if (salesOnly) return json(403, { code: '42501', message: 'sales staff only' });
        state.detail.business.status = args.p_status; return json(200, args.p_status);
      }
      if (req.url.startsWith('/rest/v1/communities')) return json(200, [{ id: BIZ, name: 'Thayne' }]);
      if (req.url.startsWith('/rest/v1/categories')) return json(200, [{ id: '4f2a8c1e-9b7d-4e61-8a0f-1c2d3e4f5a6b', name: 'Plumbing' }]);
      json(404, {});
    });
  });
  return new Promise((resolve) => server.listen(MOCK_PORT, () => resolve(server)));
}

export const cookieFor = (tok) => {
  const session = { access_token: tok, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: USERS[tok]?.id ?? 'forged', email: USERS[tok]?.email ?? 'forged@example.test' } };
  return `sb-localhost-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
};
