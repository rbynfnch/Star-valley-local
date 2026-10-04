-- CSV import commit: prospects only, provenance, duplicate re-check, slugs, per-row errors, access.
create function test.imp(rows jsonb) returns jsonb language sql as $$ select public.import_businesses(test.id('tenantA'), rows) $$;

-- staff (admin) imports 5 rows
select test.as_user(test.id('adminA'));
create temp table imp1 as select test.imp($j$[
  {"name":"Import Test Roofing","slug":"import-test-roofing","phone":"(307) 555-0301","address_line1":"1 Pine St","home_community_id":null,"short_description":"Roofs"},
  {"name":"Import Test Roofing","slug":"import-test-roofing","phone":"(307) 555-0302","address_line1":"77 Cedar Avenue"},
  {"name":"  "},
  {"name":"Import Bad Site","website":"javascript:alert(1)"},
  {"name":"Import Test Roofing","phone":"(307) 555-0301","address_line1":"1 Pine St"}
]$j$::jsonb) as r;
select test.as_root();
select test.ok((select r->0->>'result' from imp1) = 'created', 'I1: first row created');
select test.ok((select r->1->>'result' from imp1) = 'created' and (select r->1->>'slug' from imp1) = 'import-test-roofing-2', 'I2: slug collision gets a suffix (a different phone/address is not a duplicate)');
select test.ok((select r->2->>'result' from imp1) = 'error', 'I3: a nameless row is an error, not a crash');
select test.ok((select r->3->>'result' from imp1) = 'error', 'I4: a javascript: website violates the table check and only fails that row');
select test.ok((select r->4->>'result' from imp1) = 'skipped_duplicate', 'I5: same name + phone as a row created moments ago is skipped at write time');
select test.ok((select status from public.businesses where slug = 'import-test-roofing' and tenant_id = test.id('tenantA')) = 'prospect', 'I6: imported businesses are prospects (hidden)');
select test.ok(not exists (select 1 from public.public_listings pl where pl.business_id in (select id from public.businesses where slug like 'import-test-roofing%')), 'I7: and invisible in the public listing view');
select test.ok((select source from public.business_field_sources fs join public.businesses b on b.id = fs.business_id where b.slug = 'import-test-roofing' and fs.field_name = 'phone') = 'import', 'I8: provenance is import even though staff ran it');
select test.ok(coalesce(current_setting('app.write_source', true), '') = '', 'I9: the write-source flag does not leak out of the call');

-- re-import: owner/admin edits survive, empty fields fill, blanks never erase
select test.as_user(test.id('adminA'));
update public.businesses set phone = '(307) 555-0999' where slug = 'import-test-roofing' and tenant_id = test.id('tenantA');
select test.as_root();
create temp table imp2 as select test.imp(jsonb_build_array(jsonb_build_object(
  'existing_id', (select id from public.businesses where slug = 'import-test-roofing' and tenant_id = test.id('tenantA')),
  'name', 'Import Test Roofing', 'phone', '(307) 555-0301', 'website', 'https://roofs.example', 'email', '', 'short_description', ''))) as r;
select test.ok((select r->0->>'result' from imp2) = 'updated', 'I10: re-import updates the existing row');
select test.ok((select phone from public.businesses where slug = 'import-test-roofing' and tenant_id = test.id('tenantA')) = '(307) 555-0999', 'I11: re-import did NOT overwrite the admin-edited phone');
select test.ok((select website from public.businesses where slug = 'import-test-roofing' and tenant_id = test.id('tenantA')) = 'https://roofs.example', 'I12: re-import filled the empty website');
select test.ok((select short_description from public.businesses where slug = 'import-test-roofing' and tenant_id = test.id('tenantA')) = 'Roofs', 'I13: a blank cell never erases existing data');

-- force flag lets an approved "review" row through
create temp table imp3 as select test.imp('[{"name":"Import Test Roofing","phone":"(307) 555-0301","address_line1":"1 Pine St","force":true}]') as r;
select test.ok((select r->0->>'result' from imp3) = 'created', 'I14: force overrides the duplicate re-check (admin approved it in review)');

-- tenant isolation: a tenant B id cannot be written by tenant A staff
select test.as_user(test.id('adminA'));
select test.throws($$select public.import_businesses(test.id('tenantB'), '[{"name":"Sneaky"}]')$$, 'I15: tenant A staff cannot import into tenant B', '42501');
select test.as_user(test.id('owner1'));
select test.throws($$select test.imp('[{"name":"Owner Import"}]')$$, 'I16: a business owner cannot import', '42501');
select test.as_anon();
select test.throws($$select test.imp('[{"name":"Anon Import"}]')$$, 'I17: anon cannot call import_businesses', '42501');
select test.as_root();
select test.throws($$select test.imp('{"name":"not an array"}')$$, 'I18: payload must be an array', '22023');
