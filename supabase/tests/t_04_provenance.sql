-- Field-level provenance: imports never overwrite owner/admin edits. Uses a fresh business.
-- 1. import creates the record: every populated tracked field is 'import'
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone, description)
values ('00000000-0000-0000-0000-0000000000a1', test.id('tenantA'), 'prov-co', 'Prov Co', 'unclaimed', test.id('afton'), test.id('catEat'), '307-555-0001', 'Imported description');
select test.ok((select source from public.business_field_sources where business_id = '00000000-0000-0000-0000-0000000000a1' and field_name = 'phone') = 'import', 'created by import: phone source = import');
select test.ok(not exists (select 1 from public.business_field_sources where business_id = '00000000-0000-0000-0000-0000000000a1' and field_name = 'website'), 'unset fields have no provenance row');

-- 2. owner edits phone
insert into public.business_owners (business_id, tenant_id, user_id) values ('00000000-0000-0000-0000-0000000000a1', test.id('tenantA'), test.id('owner2'));
select test.as_user(test.id('owner2'));
update public.businesses set phone = '307-555-0002' where id = '00000000-0000-0000-0000-0000000000a1';
select test.as_root();
select test.ok((select source from public.business_field_sources where business_id = '00000000-0000-0000-0000-0000000000a1' and field_name = 'phone') = 'owner', 'owner edit recorded as owner');
select test.ok((select updated_by from public.business_field_sources where business_id = '00000000-0000-0000-0000-0000000000a1' and field_name = 'phone') = test.id('owner2'), 'updated_by recorded');

-- 3. admin edits description
select test.as_user(test.id('adminA'));
update public.businesses set description = 'Admin-written description' where id = '00000000-0000-0000-0000-0000000000a1';
select test.as_root();
select test.ok((select source from public.business_field_sources where business_id = '00000000-0000-0000-0000-0000000000a1' and field_name = 'description') = 'admin', 'staff edit recorded as admin');

-- 4. re-import (service/root, no uid => import): owner & admin fields are protected, untouched fields update
update public.businesses set phone = '307-555-9999', description = 'Re-imported description', website = 'https://imported.example', name = 'Prov Company LLC'
 where id = '00000000-0000-0000-0000-0000000000a1';
select test.ok((select phone from public.businesses where id = '00000000-0000-0000-0000-0000000000a1') = '307-555-0002', 're-import did NOT overwrite owner phone');
select test.ok((select description from public.businesses where id = '00000000-0000-0000-0000-0000000000a1') = 'Admin-written description', 're-import did NOT overwrite admin description');
select test.ok((select website from public.businesses where id = '00000000-0000-0000-0000-0000000000a1') = 'https://imported.example', 're-import filled a previously empty field');
select test.ok((select name from public.businesses where id = '00000000-0000-0000-0000-0000000000a1') = 'Prov Company LLC', 're-import updated an import-sourced field');
select test.ok((select source from public.business_field_sources where business_id = '00000000-0000-0000-0000-0000000000a1' and field_name = 'phone') = 'owner', 'provenance still owner after re-import');

-- 5. explicit import flag from trusted server code behaves the same even for a staff session
select test.as_user(test.id('adminA'));
select set_config('app.write_source', 'import', false);  -- session scope: psql autocommits each statement
update public.businesses set phone = '307-555-7777' where id = '00000000-0000-0000-0000-0000000000a1';
select set_config('app.write_source', '', false);
select test.as_root();
select test.ok((select phone from public.businesses where id = '00000000-0000-0000-0000-0000000000a1') = '307-555-0002', 'import flag protects owner data even in a staff session');

-- 6. an owner/admin edit can still override an earlier owner edit
select test.as_user(test.id('adminA'));
update public.businesses set phone = '307-555-0003' where id = '00000000-0000-0000-0000-0000000000a1';
select test.as_root();
select test.ok((select source from public.business_field_sources where business_id = '00000000-0000-0000-0000-0000000000a1' and field_name = 'phone') = 'admin', 'admin can overwrite owner edit; provenance follows');

-- 7. unchanged saves do not touch provenance
select test.ok((select count(*) from public.business_field_sources where business_id = '00000000-0000-0000-0000-0000000000a1') > 0, 'provenance rows exist');

-- 8. dedupe helper for CSV import
select test.ok((select count(*) from app.find_duplicate_businesses(test.id('tenantA'), 'Prov Company', '(307) 555-0003')) = 1, 'dedupe: fuzzy name + same phone matches');
select test.ok((select count(*) from app.find_duplicate_businesses(test.id('tenantA'), 'Completely Different Name', '(307) 555-0003')) = 0, 'dedupe: same phone but different name does not match');
select test.ok((select count(*) from app.find_duplicate_businesses(test.id('tenantB'), 'Prov Company', '(307) 555-0003')) = 0, 'dedupe is tenant-scoped');

-- provenance is visible to staff and owners, not to the public
select test.as_anon();
select test.throws('select * from public.business_field_sources', 'anon cannot read provenance', '42501');
select test.as_root();
delete from public.businesses where id = '00000000-0000-0000-0000-0000000000a1';
