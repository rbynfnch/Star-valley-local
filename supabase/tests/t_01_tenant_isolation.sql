-- Tenant isolation + role boundaries (RLS).
insert into public.business_crm (business_id, tenant_id, lead_stage) values
  (test.id('biz1'), test.id('tenantA'), 'interested'), (test.id('bizB'), test.id('tenantB'), 'new');
insert into public.contacts (tenant_id, business_id, name) values
  (test.id('tenantA'), test.id('biz1'), 'Pat Owner'), (test.id('tenantB'), test.id('bizB'), 'Teton Contact');
insert into public.business_owners (business_id, tenant_id, user_id) values
  (test.id('biz1'), test.id('tenantA'), test.id('owner1')), (test.id('biz2'), test.id('tenantA'), test.id('owner2'));
insert into public.submissions (tenant_id, kind, payload) values (test.id('tenantA'), 'business', '{"name":"x"}'), (test.id('tenantB'), 'business', '{"name":"y"}');

-- anon ---------------------------------------------------------------------------------------
select test.as_anon();
select test.ok(test.count('select 1 from public.businesses') = 10 - 1, 'anon sees published businesses (both tenants) but not prospects');
select test.ok(test.count($$select 1 from public.businesses where status = 'prospect'$$) = 0, 'anon cannot see prospects');
select test.throws('select * from public.business_crm', 'anon has no privileges on CRM tables', '42501');
select test.throws('select * from public.contacts', 'anon has no privileges on contacts', '42501');
select test.throws('select * from public.payments', 'anon has no privileges on payments', '42501');
select test.throws('select * from public.stripe_events', 'anon has no privileges on stripe_events', '42501');
select test.throws('select * from public.tracking_events', 'anon cannot read tracking', '42501');
select test.throws('select * from public.tenant_settings', 'anon cannot read tenant settings', '42501');
select test.throws($$insert into public.tracking_events (tenant_id, event_type, business_id) values (test.id('tenantA'), 'profile_view', test.id('biz1'))$$,
                   'anon cannot forge tracking events', '42501');
select test.throws($$update public.businesses set name = 'hax' where id = test.id('biz1')$$, 'anon cannot update businesses', '42501');

-- anon submissions: may insert (pending only), never read back
insert into public.submissions (tenant_id, kind, payload) values (test.id('tenantA'), 'event', '{"title":"Fair"}');
select test.throws($$insert into public.submissions (tenant_id, kind, status, payload) values (test.id('tenantA'), 'event', 'approved', '{}')$$,
                   'anon cannot self-approve a submission', '42501');
select test.throws($$insert into public.submissions (tenant_id, kind, payload) values (test.id('tenantA'), 'update', '{}')$$,
                   'update submissions require a business', '23514');

-- staff of tenant A ---------------------------------------------------------------------------
select test.as_user(test.id('salesA'));
select test.ok(test.count('select 1 from public.business_crm') = 1, 'sales A sees only tenant A CRM rows');
select test.ok(test.count('select 1 from public.contacts') = 1, 'sales A sees only tenant A contacts');
select test.ok(test.count('select 1 from public.submissions') = 2, 'sales A sees only tenant A submissions');
select test.throws($$insert into public.contacts (tenant_id, business_id, name) values (test.id('tenantB'), test.id('bizB'), 'x')$$,
                   'sales A cannot write tenant B contacts', '42501');
select test.throws($$insert into public.contacts (tenant_id, business_id, name) values (test.id('tenantA'), test.id('bizB'), 'x')$$,
                   'composite FK blocks pointing a tenant A row at a tenant B business', '23503');
select test.ok(test.count($$select 1 from public.businesses where tenant_id = test.id('tenantA') and status = 'prospect'$$) = 1, 'sales A sees tenant A prospects');
select test.throws($$update public.businesses set tenant_id = test.id('tenantB') where id = test.id('biz1')$$, 'tenant_id is immutable', '42501');
select test.throws($$insert into public.placements (tenant_id, business_id, slot_type, start_at, end_at, source) values (test.id('tenantA'), test.id('biz1'), 'homepage', now(), now() + interval '30 days', 'manual')$$,
                   'sales cannot create placements (admin only)', '42501');

-- editor: content yes, CRM no
select test.as_user(test.id('editorA'));
select test.ok(test.count('select 1 from public.contacts') = 0, 'editor cannot read CRM contacts');
select test.ok(test.count('select 1 from public.business_crm') = 0, 'editor cannot read CRM state');
select test.ok(test.count('select 1 from public.submissions') = 2, 'editor sees moderation queue');
insert into public.articles (tenant_id, slug, title, status, publish_at) values (test.id('tenantA'), 'ed-article', 'Editor article', 'published', now() - interval '1 hour');
select test.throws($$insert into public.articles (tenant_id, slug, title) values (test.id('tenantB'), 'x', 'x')$$, 'editor cannot write articles in tenant B', '42501');

-- admin B is isolated from A
select test.as_user(test.id('adminB'));
select test.ok(test.count($$select 1 from public.contacts$$) = 1, 'admin B sees only their own contact');
select test.ok(test.count($$select 1 from public.tenant_staff where tenant_id = test.id('tenantA')$$) = 0, 'admin B cannot read tenant A staff');
select test.throws($$insert into public.tenant_staff (tenant_id, user_id, role) values (test.id('tenantA'), test.id('adminB'), 'admin')$$, 'admin B cannot grant themself staff in A', '42501');

-- business owner ------------------------------------------------------------------------------
select test.as_user(test.id('owner1'));
select test.ok(test.count('select 1 from public.contacts') = 0, 'owner cannot read CRM contacts');
select test.ok(test.count('select 1 from public.tenant_settings') = 0, 'owner reads zero tenant_settings rows');
update public.businesses set phone = '307-111-2222' where id = test.id('biz1');
select test.ok((select phone from public.businesses where id = test.id('biz1')) = '307-111-2222', 'owner can edit own business phone');
update public.businesses set phone = 'x' where id = test.id('biz2');
select test.as_root();
select test.ok((select phone from public.businesses where id = test.id('biz2')) = '307-885-9999', 'owner cannot edit another business (0 rows updated)');
select test.as_user(test.id('owner1'));
select test.throws($$update public.businesses set status = 'archived' where id = test.id('biz1')$$, 'owner cannot change business status', '42501');
select test.throws($$update public.businesses set verification_level = 'gold' where id = test.id('biz1')$$, 'owner cannot self-verify', '42501');
select test.throws($$insert into public.business_owners (business_id, tenant_id, user_id) values (test.id('biz2'), test.id('tenantA'), test.id('owner1'))$$,
                   'owner cannot add themself to another business', '42501');
select test.throws($$insert into public.verification_proofs (tenant_id, business_id, kind) values (test.id('tenantA'), test.id('biz1'), 'sms_code')$$,
                   'owner cannot mint proofs', '42501');

-- consumer ------------------------------------------------------------------------------------
select test.as_user(test.id('consumer'));
select test.ok(test.count('select 1 from public.leads') = 0, 'consumer cannot read leads');
select test.ok(test.count('select 1 from public.business_owners') = 0, 'consumer sees no ownership rows');
select test.throws($$insert into public.saved_items (tenant_id, user_id, business_id) values (test.id('tenantA'), test.id('owner1'), test.id('biz1'))$$,
                   'consumer cannot save as someone else', '42501');
insert into public.saved_items (tenant_id, user_id, business_id) values (test.id('tenantA'), test.id('consumer'), test.id('biz1'));
select test.ok(test.count('select 1 from public.saved_items') = 1, 'consumer can save and read own saves');
select test.as_root();
