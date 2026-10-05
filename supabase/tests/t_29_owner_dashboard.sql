-- Owner dashboard: owners use the same content functions on THEIR businesses only; Free vs Enhanced limits; provenance; leads; activity.
create function test.od_t() returns uuid language sql as $$ select test.id('tenantA') $$;
create function test.od_as(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', test.id(u)::text, false); execute 'set role authenticated'; end $$;
create function test.od_n(q text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute q into n; return n; end $$;
create function test.od_b(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000f30' || n)::uuid $$;
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone) values
 (test.od_b(1), test.od_t(), 'od-free',  'Od Free',  'unclaimed', test.id('afton'), test.id('catEat'), '307-555-0961'),
 (test.od_b(2), test.od_t(), 'od-enh',   'Od Enhanced', 'unclaimed', test.id('afton'), test.id('catEat'), '307-555-0962'),
 (test.od_b(3), test.od_t(), 'od-other', 'Od Other', 'unclaimed', test.id('afton'), test.id('catEat'), '307-555-0963');
insert into public.listings (tenant_id, business_id, tier, status, source) values (test.od_t(), test.od_b(2), 'enhanced', 'active', 'paid'), (test.od_t(), test.od_b(3), 'enhanced', 'active', 'paid');
insert into public.business_owners (business_id, tenant_id, user_id) values (test.od_b(1), test.od_t(), test.id('owner1')), (test.od_b(2), test.od_t(), test.id('owner1')), (test.od_b(3), test.od_t(), test.id('owner2'));
insert into public.leads (tenant_id, business_id, name, email, message) values (test.od_t(), test.od_b(2), 'OdPat', 'pat@x.test', 'Need a quote'), (test.od_t(), test.od_b(3), 'OdSam', 'sam@x.test', 'Other biz');
create function test.od_ph(b uuid, name text, role public.photo_role default 'gallery') returns jsonb language sql as $$
  select public.add_business_photo(test.od_t(), b, 'media', test.od_t()::text || '/' || b::text || '/' || name, 'A photo', 800, 600, 1000, role, null) $$;

-- ===== dashboard list
select test.od_as('owner1');
select test.ok((select count(*) from jsonb_array_elements(public.owner_dashboard(test.od_t())) x where x ->> 'slug' like 'od-%') = 2 and not exists (select 1 from jsonb_array_elements(public.owner_dashboard(test.od_t())) x where x ->> 'slug' = 'od-other'), 'D1: an owner sees their two businesses and not the other owner''s');
select test.ok((select string_agg(x ->> 'tier', ',' order by x ->> 'name') from jsonb_array_elements(public.owner_dashboard(test.od_t())) x where x ->> 'slug' like 'od-%') = 'enhanced,free', 'D2: with the plan of each');
select test.ok((select (x ->> 'new_leads')::int from jsonb_array_elements(public.owner_dashboard(test.od_t())) x where x ->> 'slug' = 'od-enh') = 1, 'D3: and new leads, only their own');
select test.od_as('owner2');
select test.ok((select count(*) from jsonb_array_elements(public.owner_dashboard(test.od_t())) x where x ->> 'slug' like 'od-%') = 1, 'D4: another owner sees only theirs');
select test.as_anon();
select test.throws($$select public.owner_dashboard(test.od_t())$$, 'D6: anonymous visitors cannot call it', '42501');
select test.od_as('adminB');
select test.ok(jsonb_array_length(public.owner_dashboard(test.od_t())) = 0, 'D7: another tenant''s admin sees nothing here');

-- ===== profile edits
select test.od_as('owner1');
select public.update_business_fields(test.od_t(), test.od_b(1), '{"phone":"307-555-0000","short_description":"Hello from the owner","website":"https://od.example"}');
select test.as_root();
select test.ok((select phone from public.businesses where id = test.od_b(1)) = '307-555-0000' and (select source::text from public.business_field_sources where business_id = test.od_b(1) and field_name = 'phone') = 'owner', 'P1: an owner edits their business and provenance says owner');
select test.od_as('owner1');
select test.throws($$select public.update_business_fields(test.od_t(), test.od_b(1), '{"description":"long text"}')$$, 'P2: a Free owner cannot set the Enhanced-only description', '22023');
select test.throws($$select public.update_business_fields(test.od_t(), test.od_b(1), '{"highlights":["a"]}')$$, 'P3: nor highlights', '22023');
select test.throws($$select public.update_business_fields(test.od_t(), test.od_b(1), '{"email":"a@b.co"}')$$, 'P4: nor the public email', '22023');
select public.update_business_fields(test.od_t(), test.od_b(2), '{"description":"Long text","highlights":["Locally owned"],"email":"hi@od.example"}');
select test.ok(true, 'P5: an Enhanced owner can');
select test.throws($$select public.update_business_fields(test.od_t(), test.od_b(2), '{"legal_name":"X Inc"}')$$, 'P6: nobody but staff changes the legal name', '22023');
select test.throws($$select public.update_business_fields(test.od_t(), test.od_b(2), '{"primary_category_id":null}')$$, 'P7: nor the category', '22023');
select test.throws($$select public.update_business_fields(test.od_t(), test.od_b(3), '{"phone":"1"}')$$, 'P8: nor someone else''s business', '42501');
select test.throws($$select public.update_business_fields(test.od_t(), test.od_b(2), '{"status":"archived"}')$$, 'P9: nor the status (not an editable field)', '22023');
select test.throws($$select public.set_business_status(test.od_t(), test.od_b(2), 'archived')$$, 'P10: an owner cannot archive their own listing', '42501');

-- ===== content sections
select public.set_business_hours(test.od_t(), test.od_b(1), '[{"day":1,"opens":"09:00","closes":"17:00"}]');
select test.ok(test.od_n($$select count(*) from public.business_hours where business_id = test.od_b(1)$$) = 1, 'C1: a Free owner sets hours');
select test.throws($$select public.set_business_services(test.od_t(), test.od_b(1), '["Drain cleaning"]')$$, 'C2: services are not writable on a Free listing', '42501');
select test.ok(public.set_business_services(test.od_t(), test.od_b(2), '["Drain cleaning","Repipes"]') = 2, 'C3: they are on Enhanced');
select test.ok(public.set_business_links(test.od_t(), test.od_b(2), '[{"kind":"facebook","url":"https://facebook.com/od"}]') = 1, 'C4: so are social links');
select test.throws($$select public.set_business_services(test.od_t(), test.od_b(3), '["x"]')$$, 'C5: another owner''s business is closed', '42501');
select test.ok(public.save_deal(test.od_t(), test.od_b(2), null, 'Spring tune-up', 'Ten off', null, 'amount', 10, 'published', null, null) is not null, 'C6: an Enhanced owner posts a deal');
select test.throws($$select public.save_deal(test.od_t(), test.od_b(1), null, 'Nope', null, null, 'other', null, 'published', null, null)$$, 'C7: a Free owner cannot', '42501');
select test.ok(jsonb_array_length(public.business_content(test.od_t(), test.od_b(2)) -> 'deals') = 1, 'C8: the owner reads their own content');
select test.throws($$select public.business_content(test.od_t(), test.od_b(3))$$, 'C9: but not another business''s', '42501');

-- ===== photos
select test.od_ph(test.od_b(1), 'logo.png', 'logo');
select test.od_ph(test.od_b(1), 'cover.png', 'cover');
select test.throws($$select test.od_ph(test.od_b(1), 'g1.png')$$, 'F1: a Free listing holds a logo and a cover: a third photo is refused', '22023');
select test.ok(test.od_ph(test.od_b(1), 'cover2.png', 'cover') is not null and test.od_n($$select count(*) from public.business_photos where business_id = test.od_b(1)$$) = 2, 'F2: replacing the cover is fine');
select test.ok((select string_agg(distinct source::text, ',') from public.business_photos where business_id = test.od_b(1)) = 'owner', 'F3: provenance on photos says owner');
select test.throws($$insert into public.business_photos (tenant_id, business_id, media_asset_id, role, sort_order) select test.od_t(), test.od_b(1), id, 'gallery', 9 from public.media_assets limit 1$$, 'F4: direct writes obey the same limit', '22023');
select test.ok(test.od_ph(test.od_b(2), 'g1.png') is not null, 'F5: an Enhanced listing can add gallery photos');
select test.throws($$select test.od_ph(test.od_b(3), 'x.png')$$, 'F6: not for someone else''s business', '42501');
select test.throws($$select public.add_business_photo(test.od_t(), test.od_b(2), 'media', 'other-tenant/x/y.png', 'a', 800, 600, 1000, 'gallery', null)$$, 'F7: files must sit in the business''s own folder', '22023');
select test.throws($$insert into public.media_assets (tenant_id, business_id, storage_bucket, storage_path) values (test.od_t(), test.od_b(2), 'media', 'elsewhere/secret.png')$$, 'F8: direct media rows must too (policy)', '42501');
select test.throws($$insert into public.media_assets (tenant_id, business_id, storage_bucket, storage_path) values (test.od_t(), test.od_b(2), 'private', test.od_t()::text || '/' || test.od_b(2)::text || '/x.png')$$, 'F9: and only in the media bucket', '42501');

-- ===== leads
select test.ok(test.count($$select 1 from public.leads where name like 'Od%'$$) = 1, 'L1: an owner sees only their own leads');
update public.leads set status = 'contacted' where business_id = test.od_b(2);
select test.ok((select status::text from public.leads where business_id = test.od_b(2)) = 'contacted', 'L2: and can triage them');
select test.throws($$update public.leads set message = 'edited' where business_id = test.od_b(2)$$, 'L3: but not edit what the customer wrote', '42501');
update public.leads set status = 'lost' where business_id = test.od_b(3);
select test.as_root();
select test.ok((select status::text from public.leads where business_id = test.od_b(3)) = 'new', 'L4: another business''s lead is untouched');

-- ===== activity
select test.od_as('owner1');
select test.ok(public.owner_business_activity(test.od_t(), test.od_b(2), 30) ? 'current', 'T1: an owner reads their 30-day numbers');
select test.throws($$select public.owner_business_activity(test.od_t(), test.od_b(3), 30)$$, 'T2: not another business''s', '42501');
select test.od_as('editorA');
select test.throws($$select public.owner_business_activity(test.od_t(), test.od_b(2), 30)$$, 'T3: an editor cannot', '42501');
select test.od_as('salesA');
select test.ok(public.owner_business_activity(test.od_t(), test.od_b(2), 30) ? 'current', 'T4: sales staff can');
select test.as_root();
