-- Staff field edits (provenance, validation, whitelist) and publish/archive/restore.
insert into public.businesses (id, tenant_id, slug, name, status, phone, description)
 values ('00000000-0000-0000-0000-0000000000f2', test.id('tenantA'), 'edit-one', 'Edit One', 'prospect', '307-555-0901', 'Imported text');
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id)
 values ('00000000-0000-0000-0000-0000000000f3', test.id('tenantA'), 'edit-live', 'Edit Live', 'unclaimed', test.id('afton'), test.id('catPlumb'));
create function test.upd(f jsonb, b uuid default '00000000-0000-0000-0000-0000000000f2') returns void language sql as $$ select public.update_business_fields(test.id('tenantA'), b, f) $$;
create function test.st(s public.business_status, b uuid default '00000000-0000-0000-0000-0000000000f2') returns public.business_status language sql as $$ select public.set_business_status(test.id('tenantA'), b, s) $$;
create function test.biz(col text, b uuid default '00000000-0000-0000-0000-0000000000f2') returns text language plpgsql as $$
declare r text; begin execute format('select %I::text from public.businesses where id = $1', col) into r using b; return r; end $$;
create function test.srcof(f text, b uuid default '00000000-0000-0000-0000-0000000000f2') returns text language sql as $$ select source::text from public.business_field_sources where business_id = b and field_name = f $$;

select test.as_user(test.id('salesA'));
-- edits and provenance
select test.upd('{"phone":"  (307) 555-0902 ","website":"https://edit.example","short_description":"Hello"}');
select test.ok(test.biz('phone') = '(307) 555-0902' and test.biz('website') = 'https://edit.example', 'E1: values are trimmed and saved');
select test.as_root();
select test.ok(test.srcof('phone') = 'admin' and test.srcof('website') = 'admin' and test.srcof('short_description') = 'admin', 'E2: staff edits are recorded as admin');
select test.ok(test.srcof('description') = 'import', 'E3: fields not touched keep their import provenance');
select test.as_user(test.id('salesA'));
select test.ok(test.biz('description') = 'Imported text' and test.biz('name') = 'Edit One', 'E4: keys not in the payload are untouched');
select test.upd('{"website":"","email":"  Pat@Edit.Example "}');
select test.ok(test.biz('website') is null and test.biz('email') = 'pat@edit.example', 'E5: empty string clears an optional field; email is lower-cased');
select test.upd('{"phone":""}');
select test.ok(test.biz('phone') is null, 'E5b: clearing the phone with an empty string really clears it');
select test.upd('{"phone":"(307) 555-0902"}');
select test.as_root();
-- a later import cannot overwrite the staff edit
update public.businesses set phone = '307-555-0000' where id = '00000000-0000-0000-0000-0000000000f2';
select test.ok(test.biz('phone') = '(307) 555-0902', 'E6: a later import does not overwrite the staff-edited phone');
select test.as_user(test.id('salesA'));
-- validation
select test.throws($$select test.upd('{"name":"   "}')$$, 'E7: name cannot be empty', '22023');
select test.throws($$select test.upd('{"website":"javascript:alert(1)"}')$$, 'E8: website must be http(s)', '22023');
select test.throws($$select test.upd('{"website":"https://a b.example"}')$$, 'E9: website cannot contain spaces', '22023');
select test.throws($$select test.upd('{"email":"nope"}')$$, 'E10: email must look like an email', '22023');
select test.throws($$select test.upd(jsonb_build_object('short_description', repeat('a', 121)))$$, 'E11: short description over 120 is refused', '22001');
select test.throws($$select test.upd(jsonb_build_object('description', repeat('a', 1501)))$$, 'E12: description over 1500 is refused', '22001');
select test.throws($$select test.upd('{"status":"claimed"}')$$, 'E13: status is not an editable field (whitelist)', '22023');
select test.throws($$select test.upd('{"verification_level":"gold"}')$$, 'E14: verification is not an editable field', '22023');
select test.throws($$select test.upd('{"slug":"hijack"}')$$, 'E15: slug is not an editable field', '22023');
select test.throws($$select test.upd('{"name":5}')$$, 'E16: non-text values are refused', '22023');
select test.throws($$select test.upd('[]')$$, 'E17: payload must be an object', '22023');
select test.throws($$select test.upd('{"phone":"1"}', test.id('bizB'))$$, 'E18: another tenant''s business is not found', 'P0002');
select test.throws($$select test.upd('{"home_community_id":null}', '00000000-0000-0000-0000-0000000000f3')$$, 'E19: a published business cannot lose its community', '22023');
select test.throws($$select test.upd(jsonb_build_object('home_community_id', test.id('tcommB')))$$, 'E20: a community from another tenant is refused (composite FK)', '23503');
select test.upd(jsonb_build_object('home_community_id', test.id('thayne'), 'primary_category_id', test.id('catEat')));
select test.ok(test.biz('home_community_id') = test.id('thayne')::text, 'E21: community and category can be set');

-- lifecycle
select test.ok(test.st('unclaimed') = 'unclaimed' and test.biz('status') = 'unclaimed', 'S1: a prospect with community+category publishes as unclaimed');
select test.ok((select subject from public.communications where business_id = '00000000-0000-0000-0000-0000000000f2' order by occurred_at desc, id limit 1) = 'Status: prospect → unclaimed', 'S2: the change is logged');
select test.ok(test.st('unclaimed') = 'unclaimed', 'S3: publishing an already-published business is a no-op');
select test.throws($$select test.st('prospect')$$, 'S4: a published business cannot go back to prospect directly', '22023');
select test.ok(test.st('archived') = 'archived', 'S5: a published business without paid items archives');
select test.throws($$select test.st('claimed')$$, 'S6: an archived business cannot be published without restoring', '22023');
select test.ok(test.st('prospect') = 'prospect', 'S7: restore returns it to prospect (hidden)');
select test.as_root();
insert into public.business_owners (business_id, tenant_id, user_id) values ('00000000-0000-0000-0000-0000000000f2', test.id('tenantA'), test.id('owner2'));
select test.as_user(test.id('salesA'));
select test.ok(test.st('unclaimed') = 'claimed', 'S8: publishing a business that already has an owner makes it claimed');
select test.ok(test.st('archived') = 'archived' and test.st('prospect') = 'prospect', 'S9: archive and restore a claimed business');
-- a prospect without community/category
select test.as_root();
update public.businesses set home_community_id = null, primary_category_id = null where id = '00000000-0000-0000-0000-0000000000f2';
select test.as_user(test.id('salesA'));
select test.throws($$select test.st('unclaimed')$$, 'S10: cannot publish without community and category', '22023');
-- archive guard: live Enhanced listing / placement
select test.as_root();
select test.make_featurable('00000000-0000-0000-0000-0000000000f3', true, true);
select test.as_user(test.id('salesA'));
select test.throws($$select test.st('archived', '00000000-0000-0000-0000-0000000000f3')$$, 'S11: cannot archive while a paid listing is live', '22023');
select test.as_root();
update public.listings set status = 'cancelled' where business_id = '00000000-0000-0000-0000-0000000000f3';
select test.as_user(test.id('salesA'));
select test.ok(test.st('archived', '00000000-0000-0000-0000-0000000000f3') = 'archived', 'S12: after the listing ends it can be archived');
select test.throws($$select test.st('archived', test.id('bizB'))$$, 'S13: another tenant''s business is not found', 'P0002');
select test.as_root();

-- archive guard: a live comped placement (no paid listing at all)
select test.as_root();
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id)
 values ('00000000-0000-0000-0000-0000000000f4', test.id('tenantA'), 'edit-comped', 'Edit Comped', 'unclaimed', test.id('afton'), test.id('catEat'));
select test.make_featurable('00000000-0000-0000-0000-0000000000f4', true, false);
insert into public.placements (tenant_id, business_id, slot_type, start_at, end_at, source, status)
 values (test.id('tenantA'), '00000000-0000-0000-0000-0000000000f4', 'things_to_do', now(), now() + interval '30 days', 'founding_member', 'active');
select test.as_user(test.id('salesA'));
select test.throws($$select test.st('archived', '00000000-0000-0000-0000-0000000000f4')$$, 'S14: cannot archive while a placement is live (even a comped one)', '22023');
select test.as_root();
update public.placements set status = 'cancelled' where business_id = '00000000-0000-0000-0000-0000000000f4';
select test.as_user(test.id('salesA'));
select test.ok(test.st('archived', '00000000-0000-0000-0000-0000000000f4') = 'archived', 'S15: once the placement ends it can be archived');
select test.as_root();

-- access
select test.as_user(test.id('editorA'));
select test.throws($$select test.upd('{"phone":"1"}')$$, 'A1: editor cannot edit', '42501');
select test.throws($$select test.st('archived')$$, 'A2: editor cannot change status', '42501');
select test.as_user(test.id('owner2'));
select test.throws($$select test.upd('{"phone":"1"}')$$, 'A3: owner cannot use the staff edit function', '42501');
select test.throws($$select test.st('archived')$$, 'A4: owner cannot change status', '42501');
select test.as_user(test.id('adminB'));
select test.throws($$select test.upd('{"phone":"1"}')$$, 'A5: other tenant''s admin cannot edit', '42501');
select test.as_anon();
select test.throws($$select test.upd('{"phone":"1"}')$$, 'A6: anon cannot edit', '42501');
select test.throws($$select test.st('archived')$$, 'A7: anon cannot change status', '42501');
select test.as_root();
