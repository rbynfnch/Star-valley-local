-- Dashboard counts: correct deltas, staff only, tenant-scoped. Uses fresh businesses and compares before/after.
create function test.dc() returns jsonb language sql as $$ select public.admin_dashboard_counts(test.id('tenantA')) $$;
create function test.dcn(k text) returns bigint language sql as $$ select (test.dc() ->> k)::bigint $$;

select test.as_user(test.id('salesA'));
create temp table b0 as select test.dc() as c;
select test.as_root();

-- a new prospect: +1 total, +1 prospects, nothing else
insert into public.businesses (id, tenant_id, slug, name, status) values ('00000000-0000-0000-0000-0000000000d1', test.id('tenantA'), 'dash-prospect', 'Dash Prospect', 'prospect');
select test.as_user(test.id('salesA'));
select test.ok(test.dcn('total') = (select (c->>'total')::bigint from b0) + 1, 'D1: a prospect counts toward total');
select test.ok(test.dcn('prospects') = (select (c->>'prospects')::bigint from b0) + 1, 'D2: and toward prospects');
select test.ok(test.dcn('needing_verification') = (select (c->>'needing_verification')::bigint from b0), 'D3: prospects are not "needing verification" (not published)');
select test.as_root();

-- publish a business: unverified -> needing verification
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id)
values ('00000000-0000-0000-0000-0000000000d2', test.id('tenantA'), 'dash-live', 'Dash Live', 'unclaimed', test.id('afton'), test.id('catPlumb'));
select test.as_user(test.id('salesA'));
select test.ok(test.dcn('needing_verification') = (select (c->>'needing_verification')::bigint from b0) + 1, 'D4: a published unverified business needs verification');
select test.ok(test.dcn('prospects') = (select (c->>'prospects')::bigint from b0) + 1, 'D5: prospects unchanged by publishing a different business');
select test.as_root();

-- verify + Enhanced: verified +1, needing verification back down, enhanced +1
select test.make_featurable('00000000-0000-0000-0000-0000000000d2', true, true);
select test.as_user(test.id('salesA'));
select test.ok(test.dcn('verified') = (select (c->>'verified')::bigint from b0) + 1, 'D6: Green verification counts');
select test.ok(test.dcn('needing_verification') = (select (c->>'needing_verification')::bigint from b0), 'D7: verified business no longer needs verification');
select test.ok(test.dcn('enhanced') = (select (c->>'enhanced')::bigint from b0) + 1, 'D8: live Enhanced listing counts');
select test.ok(test.dcn('featured') = (select (c->>'featured')::bigint from b0), 'D9: not Featured yet');
select test.as_root();

-- Featured placement
insert into public.placements (tenant_id, business_id, slot_type, start_at, end_at, source, status)
values (test.id('tenantA'), '00000000-0000-0000-0000-0000000000d2', 'things_to_do', now(), now() + interval '30 days', 'paid', 'active');
select test.as_user(test.id('salesA'));
select test.ok(test.dcn('featured') = (select (c->>'featured')::bigint from b0) + 1, 'D10: a live placement counts as Featured');
select test.as_root();
-- the placement window ends: no longer counted (end in the past)
update public.placements set status = 'cancelled' where business_id = '00000000-0000-0000-0000-0000000000d2';
select test.as_user(test.id('salesA'));
select test.ok(test.dcn('featured') = (select (c->>'featured')::bigint from b0), 'D11: a cancelled placement stops counting');
select test.as_root();
-- listing marked active but past its end date does not count as Enhanced
update public.listings set ends_at = now() - interval '1 hour', starts_at = now() - interval '2 days' where business_id = '00000000-0000-0000-0000-0000000000d2';
select test.as_user(test.id('salesA'));
select test.ok(test.dcn('enhanced') = (select (c->>'enhanced')::bigint from b0), 'D12: an expired-by-date listing is not Enhanced');
select test.as_root();

-- pending submissions
select test.as_root();
insert into public.submissions (tenant_id, kind, payload) values (test.id('tenantA'), 'business', '{"name":"Dash Sub"}');
select test.as_user(test.id('salesA'));
select test.ok(test.dcn('pending_submissions') = (select (c->>'pending_submissions')::bigint from b0) + 1, 'D11b: a pending submission is counted');
select test.as_root();
update public.submissions set status = 'rejected' where payload->>'name' = 'Dash Sub';
select test.as_user(test.id('salesA'));
select test.ok(test.dcn('pending_submissions') = (select (c->>'pending_submissions')::bigint from b0), 'D11c: a reviewed one no longer counts');
select test.as_root();

-- access: sales, editor and admin yes; owner, consumer, anon, other-tenant staff no
select test.as_user(test.id('editorA')); select test.ok(test.dcn('total') > 0, 'D13: editor may read the counts');
select test.as_user(test.id('adminA'));  select test.ok(test.dcn('total') > 0, 'D14: admin may read the counts');
select test.as_user(test.id('owner1'));  select test.throws($$select test.dc()$$, 'D15: a business owner cannot', '42501');
select test.as_user(test.id('consumer'));select test.throws($$select test.dc()$$, 'D16: a consumer cannot', '42501');
select test.as_user(test.id('adminB'));  select test.throws($$select test.dc()$$, 'D17: another tenant''s admin cannot', '42501');
select test.as_anon();                   select test.throws($$select test.dc()$$, 'D18: anon cannot call it', '42501');
select test.as_root();

-- my_staff_role: answers only about the caller
select test.as_user(test.id('salesA'));  select test.ok(public.my_staff_role(test.id('tenantA')) = 'sales', 'R1: sales sees "sales"');
select test.ok(public.my_staff_role(test.id('tenantB')) is null, 'R2: and nothing in another tenant');
select test.as_user(test.id('editorA'));  select test.ok(public.my_staff_role(test.id('tenantA')) = 'editor', 'R3: editor sees "editor"');
select test.as_user(test.id('owner1'));   select test.ok(public.my_staff_role(test.id('tenantA')) is null, 'R4: an owner has no staff role');
select test.as_user(test.id('consumer')); select test.ok(public.my_staff_role(test.id('tenantA')) is null, 'R5: a consumer has no staff role');
select test.as_anon(); select test.throws($$select public.my_staff_role(test.id('tenantA'))$$, 'R6: anon cannot call it', '42501');
select test.as_root();
insert into public.platform_admins (user_id) values (test.id('consumer'));
select test.as_user(test.id('consumer')); select test.ok(public.my_staff_role(test.id('tenantB')) = 'admin', 'R7: a platform admin is admin in every tenant');
select test.ok(test.dcn('total') >= 0, 'R8: and may read the dashboard counts');
select test.as_root();
delete from public.platform_admins where user_id = test.id('consumer');
