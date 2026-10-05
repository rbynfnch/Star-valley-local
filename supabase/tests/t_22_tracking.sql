-- Event tracking ingest: validation, exclusions, de-duplication, caps, quote-request trigger, staff activity view, access.
create function test.tk_svc() returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', '', false); execute 'set role service_role'; end $$;
create function test.tk_n(q text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute q into n; return n; end $$;
create function test.tk_rec(ev jsonb, sess text default 'aaaaaaaaaaaaaaaa', ref text default null, u uuid default null, t uuid default null) returns int language sql as $$
  select public.record_tracking(coalesce(t, test.id('tenantA')), ev, sess, ref, u) $$;
create function test.tk_tb(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000ab0' || n)::uuid $$;
create temp table tk_pk (k text primary key, j jsonb); grant all on tk_pk to public;
create function test.tk_keep(k text, j jsonb) returns void language sql as $$ insert into tk_pk values (k, j) on conflict (k) do update set j = excluded.j $$;
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id) values
 ('00000000-0000-0000-0000-00000000ab01', test.id('tenantA'), 'tk-one',   'Tk One',   'unclaimed', test.id('afton'), test.id('catPlumb')),
 ('00000000-0000-0000-0000-00000000ab02', test.id('tenantA'), 'tk-two',   'Tk Two',   'claimed',   test.id('afton'), test.id('catPlumb')),
 ('00000000-0000-0000-0000-00000000ab03', test.id('tenantA'), 'tk-hid',   'Tk Hidden','prospect',  null, null),
 ('00000000-0000-0000-0000-00000000ab04', test.id('tenantA'), 'tk-arch',  'Tk Archived','archived', test.id('afton'), test.id('catPlumb')),
 ('00000000-0000-0000-0000-00000000ab05', test.id('tenantB'), 'tk-other', 'Tk Other', 'unclaimed', test.id('tcommB'), test.id('catB'));
insert into public.business_owners (business_id, tenant_id, user_id) values (test.tk_tb(1), test.id('tenantA'), test.id('owner1'));
insert into public.deals (id, tenant_id, business_id, title) values ('00000000-0000-0000-0000-00000000de01', test.id('tenantA'), test.tk_tb(1), 'Tk deal'), ('00000000-0000-0000-0000-00000000de02', test.id('tenantA'), test.tk_tb(2), 'Other deal');
create function test.tk_ev(t text, b uuid default null, extra jsonb default '{}') returns jsonb language sql as $$ select jsonb_build_array(jsonb_build_object('type', t, 'business_id', b) || extra) $$;
create function test.tk_cnt(where_ text) returns bigint language sql as $$ select test.tk_n('select count(*) from public.tracking_events where ' || where_) $$;

select test.tk_svc();
-- ===== the happy path
select test.tk_keep('r1', to_jsonb(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(1), '{"surface":"profile"}'))));
select test.as_root();
select test.ok((select j from tk_pk where k = 'r1') = '1'::jsonb and test.tk_cnt('event_type = ''profile_view'' and business_id = ''' || test.tk_tb(1) || ''' and surface = ''profile'' and session_hash = ''aaaaaaaaaaaaaaaa''') = 1, 'R1: a profile view is stored with its surface and the session hash');
select test.tk_svc();
select test.tk_rec('[{"type":"website_click","business_id":"00000000-0000-0000-0000-00000000ab01"},{"type":"phone_click","business_id":"00000000-0000-0000-0000-00000000ab01"},{"type":"directions_click","business_id":"00000000-0000-0000-0000-00000000ab01"}]'::jsonb);
select test.as_root();
select test.ok(test.tk_cnt('business_id = ''' || test.tk_tb(1) || ''' and event_type in (''website_click'',''phone_click'',''directions_click'')') = 3, 'R2: the three click types are stored');
select test.tk_svc();
select test.tk_rec(test.tk_ev('search_appearance', test.tk_tb(2), '{"query":"  plumber   in\n thayne ","surface":"search"}'), 'bbbbbbbbbbbbbbbb');
select test.as_root();
select test.ok(test.tk_cnt('event_type = ''search_appearance'' and search_query = ''plumber in thayne'' and surface = ''search''') = 1, 'R3: a search appearance keeps the query, whitespace collapsed');
select test.tk_svc();
select test.tk_rec(test.tk_ev('search_appearance', test.tk_tb(2), jsonb_build_object('query', repeat('q', 500))), 'cccccccccccccccc');
select test.as_root();
select test.ok(test.tk_cnt('search_query is not null and length(search_query) = 200') = 1, 'R4: a long query is cut to 200 characters');
select test.tk_svc();
select test.tk_rec(test.tk_ev('deal_view', test.tk_tb(1), '{"deal_id":"00000000-0000-0000-0000-00000000de01"}'), 'dddddddddddddddd');
select test.tk_rec(test.tk_ev('deal_view', test.tk_tb(1), '{"deal_id":"00000000-0000-0000-0000-00000000de02"}'), 'dddddddddddddddd');
select test.as_root();
select test.ok(test.tk_cnt('event_type = ''deal_view''') = 1, 'R5: a deal view counts only for a deal that belongs to that business');
select test.tk_svc();
select test.tk_rec(test.tk_ev('profile_view', test.tk_tb(1), jsonb_build_object('community_id', test.id('afton'), 'category_id', test.id('catPlumb'))), 'eeeeeeeeeeeeeeee', 'Www.Google.com');
select test.tk_rec(test.tk_ev('profile_view', test.tk_tb(2), jsonb_build_object('community_id', test.id('tcommB'))), 'eeeeeeeeeeeeeeee', 'bad host/with path');
select test.as_root();
select test.ok(test.tk_cnt('session_hash = ''eeeeeeeeeeeeeeee'' and referrer_host = ''www.google.com'' and community_id is not null and category_id is not null') = 1, 'R6: referrer host is lower-cased; valid community and category are kept');
select test.ok(test.tk_cnt('session_hash = ''eeeeeeeeeeeeeeee'' and referrer_host is null and community_id is null') = 1, 'R7: a junk referrer and another tenant''s community are dropped to null');

-- ===== what is refused
select test.as_root();
insert into public.platform_admins (user_id) values (test.id('owner2')) on conflict do nothing;
select test.tk_svc();
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(3)), 'f1f1f1f1f1f1f1f1') = 0, 'X1: a hidden prospect is not tracked');
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(4)), 'f1f1f1f1f1f1f1f1') = 0, 'X2: an archived business is not tracked');
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(5)), 'f1f1f1f1f1f1f1f1') = 0, 'X3: another tenant''s business is not tracked here');
select test.ok(test.tk_rec(test.tk_ev('profile_view', gen_random_uuid()), 'f1f1f1f1f1f1f1f1') = 0, 'X4: an unknown business is not tracked');
select test.ok(test.tk_rec(test.tk_ev('quote_request', test.tk_tb(1)), 'f1f1f1f1f1f1f1f1') = 0, 'X5: the browser cannot report a quote request');
select test.ok(test.tk_rec('[{"type":"nonsense","business_id":null},{"business_id":null},5,"x",null]'::jsonb, 'f1f1f1f1f1f1f1f1') = 0, 'X6: unknown types and junk entries are ignored without error');
select test.ok(test.tk_rec('[{"type":"profile_view","business_id":"not-a-uuid"}]'::jsonb, 'f1f1f1f1f1f1f1f1') = 0, 'X7: a malformed id is ignored without error');
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(1)), 'f1f1f1f1f1f1f1f1', null, test.id('salesA')) = 0, 'X8: staff browsing the site are never counted');
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(1)), 'f1f1f1f1f1f1f1f1', null, test.id('owner1')) = 0, 'X9: an owner viewing their own page is not counted');
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(1)), 'f1f1f1f1f1f1f1f1', null, test.id('owner2')) = 0, 'X8b: a platform super-admin is never counted either');
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(2)), 'f1f1f1f1f1f1f1f1', null, test.id('owner1')) = 1, 'X10: but the same owner browsing someone else''s page is');
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(1)), 'f2f2f2f2f2f2f2f2', null, test.id('consumer')) = 1, 'X11: a signed-in resident is counted like anyone');
select test.ok(test.tk_rec(test.tk_ev('article_view', null, '{"article_id":"00000000-0000-0000-0000-00000000ffff"}'), 'f1f1f1f1f1f1f1f1') = 0, 'X12: an unknown article is ignored');
select test.as_root();
select test.ok(test.tk_cnt('session_hash = ''f1f1f1f1f1f1f1f1''') = 1, 'X13: of all the refused events, only the one valid view was stored');
select test.ok(test.tk_cnt('event_type = ''profile_view'' and business_id is null') = 0, 'X14: no view without a business was stored');

-- ===== malformed requests do raise
select test.tk_svc();
select test.throws($$select test.tk_rec('{"a":1}'::jsonb)$$, 'M1: events must be a list', '22023');
select test.throws($$select test.tk_rec((select jsonb_agg(jsonb_build_object('type', 'profile_view', 'business_id', test.tk_tb(1))) from generate_series(1, 51)))$$, 'M2: more than 50 events in one request is refused', '22023');
select test.throws($$select test.tk_rec(test.tk_ev('profile_view', test.tk_tb(1)), 'NOT HEX')$$, 'M3: a malformed session is refused', '22023');
select test.throws($$select test.tk_rec(test.tk_ev('profile_view', test.tk_tb(1)), null)$$, 'M4: a missing session is refused', '22023');
select test.throws($$select test.tk_rec(test.tk_ev('profile_view', test.tk_tb(1)), 'aaaaaaaaaaaaaaaa', null, null, gen_random_uuid())$$, 'M5: an unknown tenant is refused', '22023');
select test.ok(test.tk_rec('[]'::jsonb, 'aaaaaaaaaaaaaaaa') = 0, 'M6: an empty list is fine');

-- ===== de-duplication
select test.tk_svc();
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(2)), '1111111111111111') = 1 and test.tk_rec(test.tk_ev('profile_view', test.tk_tb(2)), '1111111111111111') = 0, 'D1: a refresh within 30 minutes is not a second view');
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(2)), '2222222222222222') = 1, 'D2: another visitor''s view counts');
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(1)), '1111111111111111') = 1, 'D3: the same visitor viewing another business counts');
select test.ok(test.tk_rec(test.tk_ev('search_appearance', test.tk_tb(2), '{"query":"a"}'), '1111111111111111') = 1 and test.tk_rec(test.tk_ev('search_appearance', test.tk_tb(2), '{"query":"a"}'), '1111111111111111') = 0 and test.tk_rec(test.tk_ev('search_appearance', test.tk_tb(2), '{"query":"b"}'), '1111111111111111') = 1, 'D4: the same search repeats once; a different search counts');
select test.ok(test.tk_rec(test.tk_ev('phone_click', test.tk_tb(2)), '1111111111111111') = 1 and test.tk_rec(test.tk_ev('phone_click', test.tk_tb(2)), '1111111111111111') = 0, 'D5: a double click is one click');
select test.as_root();
create function test.tk_age(sess text, ty text, b uuid, secs int) returns void language plpgsql security definer as $$
begin
  alter table public.tracking_events disable trigger tracking_no_update;
  update public.tracking_events set occurred_at = now() - make_interval(secs => secs) where session_hash = sess and event_type = ty::public.tracking_type and business_id = b;
  alter table public.tracking_events enable trigger tracking_no_update;
end $$;
select test.tk_age('1111111111111111', 'profile_view', test.tk_tb(2), 31 * 60);
select test.tk_age('1111111111111111', 'phone_click', test.tk_tb(2), 6);
select test.tk_svc();
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(2)), '1111111111111111') = 1, 'D6: after 30 minutes the same visitor counts again');
select test.ok(test.tk_rec(test.tk_ev('phone_click', test.tk_tb(2)), '1111111111111111') = 1, 'D7: and a click after 5 seconds counts');

-- ===== per-session cap
select test.as_root();
insert into public.tracking_events (tenant_id, event_type, business_id, session_hash, occurred_at)
  select test.id('tenantA'), 'website_click', test.tk_tb(1), 'cafecafecafecafe', now() - (g || ' seconds')::interval from generate_series(1, 300) g;
select test.tk_svc();
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(1)), 'cafecafecafecafe') = 0, 'C1: a session that has sent 300 events in an hour is ignored');
select test.ok(test.tk_rec(test.tk_ev('profile_view', test.tk_tb(1)), 'cafecafecafecaff') = 1, 'C2: other sessions are unaffected');

-- ===== append-only
select test.as_root();
select test.throws($$update public.tracking_events set event_type = 'phone_click' where id = (select min(id) from public.tracking_events)$$, 'A1: events cannot be edited', '42501');
select test.throws($$delete from public.tracking_events where id = (select min(id) from public.tracking_events)$$, 'A2: or deleted', '42501');

-- ===== quote requests are recorded by the database
select test.as_user(test.id('adminA'));
select public.activate_listing(test.id('tenantA'), test.tk_tb(2), 1, null, 'founding_member', null, null, false);
select test.as_root();
insert into public.leads (tenant_id, business_id, name, email, message) values (test.id('tenantA'), test.tk_tb(2), 'Pat', 'pat@example.test', 'Hello');
select test.ok(test.tk_cnt('event_type = ''quote_request'' and business_id = ''' || test.tk_tb(2) || ''' and session_hash is null') = 1, 'Q1: creating a lead records a quote request');
select test.throws($$insert into public.leads (tenant_id, business_id, name) values (test.id('tenantA'), test.tk_tb(1), 'Free biz')$$, 'Q2: a business without quotes cannot get a lead', '23514');
select test.ok(test.tk_cnt('event_type = ''quote_request'' and business_id = ''' || test.tk_tb(1) || '''') = 0, 'Q3: and no quote request is recorded for it');

-- ===== staff activity view
select test.as_user(test.id('salesA'));
select test.tk_keep('act', public.admin_business_activity(test.id('tenantA'), test.tk_tb(2), 30));
select test.as_root();
select test.ok((select j -> 'current' ->> 'profile_view' from tk_pk where k = 'act')::int >= 2 and (select j -> 'current' ->> 'quote_request' from tk_pk where k = 'act') = '1', 'V1: totals by type for the period, including the quote request');
select test.ok((select j ->> 'visitors' from tk_pk where k = 'act')::int >= 2, 'V2: visitors are distinct sessions that viewed the profile');
select test.ok((select j -> 'top_searches' -> 0 ->> 'query' from tk_pk where k = 'act') in ('plumber in thayne', 'a', 'b') and jsonb_array_length((select j -> 'top_searches' from tk_pk where k = 'act')) <= 5, 'V3: top searches list the queries that surfaced it');
select test.tk_age('2222222222222222', 'profile_view', test.tk_tb(2), 40 * 86400);
select test.as_user(test.id('salesA'));
select test.tk_keep('act2', public.admin_business_activity(test.id('tenantA'), test.tk_tb(2), 30));
select test.as_root();
select test.ok((select (j -> 'previous' ->> 'profile_view')::int from tk_pk where k = 'act2') = 1, 'V4: older events fall into the previous period for comparison');
select test.as_user(test.id('salesA'));
select test.throws($$select public.admin_business_activity(test.id('tenantA'), test.tk_tb(2), 0)$$, 'V5: days must be 1 to 365', '22023');
select test.throws($$select public.admin_business_activity(test.id('tenantA'), test.tk_tb(5), 30)$$, 'V6: another tenant''s business is not found', 'P0002');
select test.as_user(test.id('editorA'));
select test.throws($$select public.admin_business_activity(test.id('tenantA'), test.tk_tb(2), 30)$$, 'V7: an editor cannot see activity', '42501');
select test.as_user(test.id('owner1'));
select test.throws($$select public.admin_business_activity(test.id('tenantA'), test.tk_tb(1), 30)$$, 'V8: this staff view is not for owners', '42501');
select test.as_user(test.id('adminB'));
select test.throws($$select public.admin_business_activity(test.id('tenantA'), test.tk_tb(2), 30)$$, 'V9: another tenant''s admin is refused', '42501');

-- ===== access
select test.as_user(test.id('adminA'));
select test.throws($$select public.record_tracking(test.id('tenantA'), '[]', 'aaaaaaaaaaaaaaaa')$$, 'P1: no browser role, not even admin, can write events', '42501');
select test.as_root(); set role anon;
select test.throws($$select public.record_tracking(test.id('tenantA'), '[]', 'aaaaaaaaaaaaaaaa')$$, 'P2: anon cannot', '42501');
select test.throws($$insert into public.tracking_events (tenant_id, event_type, surface) values (test.id('tenantA'), 'article_view', 'x')$$, 'P3: anon cannot insert rows directly either', '42501');
select test.as_root();

-- ===== daily rollup (run by the maintenance job)
select app.rollup_tracking(current_date);
select test.ok((select n from public.business_stats_daily where business_id = test.tk_tb(2) and day = current_date and event_type = 'profile_view') >= 1, 'U1: the daily rollup counts the day''s events');

-- ===== the daily job rolls up yesterday and the day before
select test.tk_age('cafecafecafecaff', 'profile_view', test.tk_tb(1), 30 * 3600);       -- 30 hours ago: yesterday (UTC), unless it is just past midnight
select test.as_root();
select app.run_daily_maintenance();
select test.ok(exists (select 1 from public.business_stats_daily where business_id = test.tk_tb(1) and event_type = 'profile_view' and day >= (now() at time zone 'UTC')::date - 2 and day < (now() at time zone 'UTC')::date), 'U2: the maintenance job writes the daily stats for the last two days');
