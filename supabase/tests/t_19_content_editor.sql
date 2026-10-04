-- Enhanced content editor: staff-only replace-all section writes, validation, deals, photos (record only), access.
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id)
 values ('00000000-0000-0000-0000-00000000ce01', test.id('tenantA'), 'ce-one', 'Ce One', 'unclaimed', test.id('afton'), test.id('catPlumb')),
        ('00000000-0000-0000-0000-00000000ce02', test.id('tenantA'), 'ce-two', 'Ce Two', 'unclaimed', test.id('afton'), test.id('catPlumb'));
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id)
 values ('00000000-0000-0000-0000-00000000ce03', test.id('tenantB'), 'ce-other', 'Ce Other', 'unclaimed', test.id('tcommB'), test.id('catB'));
create function test.ce_cb() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000ce01'::uuid $$;
create function test.ce_cb2() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000ce02'::uuid $$;
create function test.ce_ta() returns uuid language sql as $$ select test.id('tenantA') $$;
create function test.ce_cc() returns jsonb language sql as $$ select public.business_content(test.ce_ta(), test.ce_cb()) $$;
create function test.ce_hrs(r jsonb) returns void language sql as $$ select public.set_business_hours(test.ce_ta(), test.ce_cb(), r) $$;
create function test.ce_svc(r jsonb) returns int language sql as $$ select public.set_business_services(test.ce_ta(), test.ce_cb(), r) $$;
create function test.ce_lnk(r jsonb) returns int language sql as $$ select public.set_business_links(test.ce_ta(), test.ce_cb(), r) $$;
create function test.ce_faq(r jsonb) returns int language sql as $$ select public.set_business_faqs(test.ce_ta(), test.ce_cb(), r) $$;
create function test.ce_area(c jsonb, k jsonb) returns void language sql as $$ select public.set_business_areas(test.ce_ta(), test.ce_cb(), c, k) $$;
create function test.ce_deal(id uuid, title text, typ public.discount_type default 'other', val numeric default null, st public.content_status default 'published', s timestamptz default null, e timestamptz default null, d text default null, t text default null) returns uuid language sql as $$
  select public.save_deal(test.ce_ta(), test.ce_cb(), id, title, d, t, typ, val, st, s, e) $$;
create function test.ce_ph(path text, alt text default 'A photo', role public.photo_role default 'gallery', bytes bigint default 1000, w int default 800, h int default 600, caption text default null, b uuid default null) returns jsonb language sql as $$
  select public.add_business_photo(test.ce_ta(), coalesce(b, test.ce_cb()), 'media', path, alt, w, h, bytes, role, caption) $$;
create function test.ce_pp(n text, b uuid default null) returns text language sql as $$ select test.ce_ta()::text || '/' || coalesce(b, test.ce_cb())::text || '/' || n $$;
create function test.ce_msg(stmt text, pat text) returns boolean language plpgsql as $$
begin execute stmt; return false; exception when others then return sqlerrm like pat; end $$;
create function test.ce_n(q text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute q into n; return n; end $$;

create temp table ce_pk (k text primary key, j jsonb); grant all on ce_pk to public;
create function test.ce_keepj(k text, j jsonb) returns void language sql as $$ insert into ce_pk values (k, j) on conflict (k) do update set j = excluded.j $$;
create function test.ce_kj(k text, f text) returns text language sql as $$ select j->>f from ce_pk where ce_pk.k = $1 $$;

-- ===== access
select test.as_user(test.id('editorA'));
select test.throws($$select test.ce_cc()$$, 'X1: an editor cannot read the content editor payload', '42501');
select test.throws($$select test.ce_hrs('[]')$$, 'X2: an editor cannot write hours', '42501');
select test.throws($$select test.ce_ph(test.ce_pp('x.jpg'))$$, 'X3: an editor cannot add photos', '42501');
select test.as_user(test.id('owner1'));
select test.throws($$select test.ce_svc('["a"]')$$, 'X4: an owner cannot use the staff editor', '42501');
select test.as_user(test.id('consumer'));
select test.throws($$select test.ce_deal(null, 'x')$$, 'X5: a consumer cannot save deals', '42501');
select test.as_user(test.id('adminB'));
select test.throws($$select test.ce_cc()$$, 'X6: another tenant''s admin is refused', '42501');
select test.as_root();
set role anon;
select test.throws($$select test.ce_cc()$$, 'X7: anon has no execute on the editor functions', '42501');
select test.as_root();
select test.as_user(test.id('salesA'));
select test.throws($$select public.business_content(test.ce_ta(), '00000000-0000-0000-0000-00000000ce03')$$, 'X8: a business from another tenant is not found', 'P0002');
select test.throws($$select public.set_business_hours(test.id('tenantB'), '00000000-0000-0000-0000-00000000ce03', '[]')$$, 'X9: a sales user of tenant A cannot write into tenant B', '42501');
select test.throws($$select public.set_business_hours(test.ce_ta(), '00000000-0000-0000-0000-00000000ce03', '[]')$$, 'X10: passing tenant A with a tenant B business is not found', 'P0002');

-- ===== read shape
select test.ok(test.ce_cc() ? 'hours' and test.ce_cc() ? 'photos' and test.ce_cc() ->> 'enhanced' = 'false' and test.ce_cc() -> 'services' = '[]'::jsonb, 'R1: empty content reads as empty lists, not enhanced');

-- ===== highlights, price level
select public.update_business_fields(test.ce_ta(), test.ce_cb(), '{"highlights":["  Family owned ","","24-hour service"],"price_range":2}');
select test.ok(test.ce_cc() -> 'highlights' = '["Family owned","24-hour service"]'::jsonb and test.ce_cc() ->> 'price_range' = '2', 'H1: highlights are trimmed with blanks dropped; price level saved');
select test.throws($$select public.update_business_fields(test.ce_ta(), test.ce_cb(), jsonb_build_object('highlights', jsonb_build_array(repeat('a', 41))))$$, 'H2: a highlight over 40 characters is refused', '22023');
select test.throws($$select public.update_business_fields(test.ce_ta(), test.ce_cb(), '{"highlights":["1","2","3","4","5","6","7","8","9"]}')$$, 'H3: more than 8 highlights is refused', '22023');
select test.throws($$select public.update_business_fields(test.ce_ta(), test.ce_cb(), '{"price_range":4}')$$, 'H4: price level above 3 is refused', '22023');
select public.update_business_fields(test.ce_ta(), test.ce_cb(), '{"price_range":null}');
select test.ok(test.ce_cc() -> 'price_range' = 'null'::jsonb, 'H5: price level can be cleared');
select test.as_root();
select test.ok((select source::text from public.business_field_sources where business_id = test.ce_cb() and field_name = 'highlights') = 'admin', 'H6: highlights are recorded as an admin edit');
select test.as_user(test.id('salesA'));

-- ===== hours
select test.ce_hrs('[{"day":1,"opens":"08:00","closes":"12:00"},{"day":1,"opens":"13:00","closes":"17:30"},{"day":0,"opens":"10:00","closes":"14:00"}]');
select test.ok(test.ce_cc() -> 'hours' = '[{"day":0,"opens":"10:00","closes":"14:00"},{"day":1,"opens":"08:00","closes":"12:00"},{"day":1,"opens":"13:00","closes":"17:30"}]'::jsonb, 'S1: hours are saved and read back in day then time order');
select test.ce_hrs('[{"day":3,"opens":"09:00","closes":"10:00"}]');
select test.ok(jsonb_array_length(test.ce_cc() -> 'hours') = 1, 'S2: saving replaces the whole section');
select test.as_root();
select test.ok((select source::text || '|' || (updated_by = test.id('salesA'))::text from public.business_hours where business_id = test.ce_cb()) = 'admin|true', 'S3: hours rows record admin and who');
select test.as_user(test.id('salesA'));
select test.throws($$select test.ce_hrs('[{"day":7,"opens":"09:00","closes":"10:00"}]')$$, 'S4: day 7 is refused', '22023');
select test.throws($$select test.ce_hrs('[{"day":1,"opens":"9am","closes":"10:00"}]')$$, 'S5: a malformed time is refused', '22023');
select test.throws($$select test.ce_hrs('[{"day":1,"opens":"25:00","closes":"26:00"}]')$$, 'S5b: an impossible time is refused', '22023');
select test.throws($$select test.ce_hrs('[{"day":1,"opens":"10:00","closes":"10:00"}]')$$, 'S6: closing at the opening time is refused', '22023');
select test.throws($$select test.ce_hrs('[{"day":1,"opens":"10:00","closes":"09:00"}]')$$, 'S7: closing before opening is refused', '22023');
select test.ok(test.ce_msg($$select test.ce_hrs('[{"day":1,"opens":"08:00","closes":"12:00"},{"day":1,"opens":"11:00","closes":"15:00"}]')$$, '%overlap%'), 'S8: overlapping ranges on one day are refused as such');
select test.ok(test.ce_msg($$select test.ce_hrs('[{"day":1,"opens":"08:00","closes":"09:00"},{"day":1,"opens":"10:00","closes":"11:00"},{"day":1,"opens":"12:00","closes":"13:00"},{"day":1,"opens":"14:00","closes":"15:00"}]')$$, '%3 time ranges%'), 'S9: four ranges on one day are refused');
select test.throws($$select test.ce_hrs('{"day":1}')$$, 'S10: hours must be a list', '22023');
select test.ok(jsonb_array_length(test.ce_cc() -> 'hours') = 1, 'S11: every refused save left the previous hours in place');
select test.ce_hrs('[{"day":2,"opens":"08:00","closes":"12:00"},{"day":2,"opens":"12:00","closes":"13:00"}]');
select test.ok(jsonb_array_length(test.ce_cc() -> 'hours') = 2, 'S12: ranges that touch end to start are allowed');
select test.ce_hrs('[]');
select test.ok(test.ce_cc() -> 'hours' = '[]'::jsonb, 'S13: an empty list clears the hours');

-- ===== services
select test.ok(test.ce_svc('["  Drain cleaning ","Water heaters","","drain cleaning","Repipes"]') = 3, 'V1: services are trimmed, blanks and case-insensitive duplicates dropped');
select test.ok(test.ce_cc() -> 'services' = '["Drain cleaning","Water heaters","Repipes"]'::jsonb, 'V2: the first spelling and the order are kept');
select test.ce_svc('["Only one"]');
select test.ok(jsonb_array_length(test.ce_cc() -> 'services') = 1, 'V3: saving replaces the whole section');
select test.throws($$select test.ce_svc(jsonb_build_array(repeat('a', 101)))$$, 'V4: a service name over 100 characters is refused', '22023');
select test.throws($$select test.ce_svc((select jsonb_agg('s' || g) from generate_series(1, 41) g))$$, 'V5: more than 40 services is refused', '22023');
select test.throws($$select test.ce_svc('[1,2]')$$, 'V6: services must be text', '22023');
select test.throws($$select test.ce_svc('"x"')$$, 'V7: services must be a list', '22023');
select test.as_root();
select test.ok((select source::text from public.business_services where business_id = test.ce_cb()) = 'admin', 'V8: services record admin');
select test.as_user(test.id('salesA'));

-- ===== links
select test.ok(test.ce_lnk('[{"kind":"facebook","url":"https://www.facebook.com/ceone"},{"kind":"instagram","url":"https://instagram.com/ceone"},{"kind":"other","url":"https://a.example"},{"kind":"other","url":"https://b.example"}]') = 4, 'K1: social links and several "other" links are saved');
select test.ce_lnk('[{"kind":"facebook","url":"https://m.facebook.com/ceone"}]');
select test.ok(jsonb_array_length(test.ce_cc() -> 'links') = 1, 'K2: replace-all; the mobile host prefix is accepted');
select test.throws($$select test.ce_lnk('[{"kind":"facebook","url":"https://evil.example/facebook.com"}]')$$, 'K3: a facebook link must be on facebook', '22023');
select test.throws($$select test.ce_lnk('[{"kind":"facebook","url":"https://notfacebook.com/x"}]')$$, 'K3b: a look-alike host is refused', '22023');
select test.throws($$select test.ce_lnk('[{"kind":"instagram","url":"https://facebook.com/x"}]')$$, 'K4: an instagram link on another network is refused', '22023');
select test.throws($$select test.ce_lnk('[{"kind":"other","url":"javascript:alert(1)"}]')$$, 'K5: a javascript: link is refused', '22023');
select test.throws($$select test.ce_lnk('[{"kind":"other","url":"https://a b.example"}]')$$, 'K6: a link with a space is refused', '22023');
select test.throws($$select test.ce_lnk(jsonb_build_array(jsonb_build_object('kind', 'other', 'url', 'https://a.example/' || repeat('x', 300))))$$, 'K7: a link over 300 characters is refused', '22023');
select test.throws($$select test.ce_lnk('[{"kind":"facebook","url":"https://facebook.com/a"},{"kind":"facebook","url":"https://facebook.com/b"}]')$$, 'K8: two links of one network are refused', '22023');
select test.throws($$select test.ce_lnk('[{"kind":"myspace","url":"https://a.example"}]')$$, 'K9: an unknown link type is refused', '22023');
select test.throws($$select test.ce_lnk((select jsonb_agg(jsonb_build_object('kind', 'other', 'url', 'https://e.example/' || g)) from generate_series(1, 13) g))$$, 'K10: more than 12 links is refused', '22023');
select test.ok(jsonb_array_length(test.ce_cc() -> 'links') = 1, 'K11: refused saves left the links in place');

-- ===== faqs
select test.ok(test.ce_faq('[{"question":" Do you offer free quotes? ","answer":"Yes."},{"question":"","answer":""}]') = 1, 'F1: FAQs are saved, fully blank rows dropped');
select test.ok(test.ce_cc() -> 'faqs' = '[{"question":"Do you offer free quotes?","answer":"Yes."}]'::jsonb, 'F2: and read back trimmed');
select test.throws($$select test.ce_faq('[{"question":"Q","answer":""}]')$$, 'F3: a question without an answer is refused', '22023');
select test.throws($$select test.ce_faq('[{"question":"","answer":"A"}]')$$, 'F4: an answer without a question is refused', '22023');
select test.throws($$select test.ce_faq(jsonb_build_array(jsonb_build_object('question', repeat('q', 201), 'answer', 'a')))$$, 'F5: a question over 200 characters is refused', '22023');
select test.throws($$select test.ce_faq(jsonb_build_array(jsonb_build_object('question', 'q', 'answer', repeat('a', 1001))))$$, 'F6: an answer over 1000 characters is refused', '22023');
select test.throws($$select test.ce_faq((select jsonb_agg(jsonb_build_object('question', 'q' || g, 'answer', 'a')) from generate_series(1, 21) g))$$, 'F7: more than 20 FAQs is refused', '22023');
select test.throws($$select test.ce_faq('[{"question":"q"}]')$$, 'F8: a missing answer field is refused', '22023');
select test.ce_faq('[]');
select test.ok(test.ce_cc() -> 'faqs' = '[]'::jsonb, 'F9: an empty list clears them');

-- ===== service area and categories
select test.ce_area(jsonb_build_array(test.id('thayne'), test.id('alpine'), test.id('afton')), jsonb_build_array(test.id('catEat'), test.id('catPlumb')));
select test.ok((test.ce_cc() -> 'community_ids') @> jsonb_build_array(test.id('thayne'), test.id('alpine')) and jsonb_array_length(test.ce_cc() -> 'community_ids') = 2, 'A1: service communities saved; the home community is implicit and skipped');
select test.ok(test.ce_cc() -> 'category_ids' = jsonb_build_array(test.id('catEat')), 'A2: extra categories saved; the primary category is skipped');
select test.ce_area('[]', '[]');
select test.ok(test.ce_cc() -> 'community_ids' = '[]'::jsonb and test.ce_cc() -> 'category_ids' = '[]'::jsonb, 'A3: empty lists clear both');
select test.throws($$select test.ce_area(jsonb_build_array(test.id('tcommB')), '[]')$$, 'A4: a community of another tenant is refused', '22023');
select test.throws($$select test.ce_area('[]', jsonb_build_array(test.id('catB')))$$, 'A5: a category of another tenant is refused', '22023');
select test.throws($$select test.ce_area('["not-a-uuid"]', '[]')$$, 'A6: junk ids are refused', '22023');
select test.throws($$select test.ce_area('[]', '[]'::jsonb || to_jsonb(array(select gen_random_uuid() from generate_series(1, 6))))$$, 'A7: more than 5 extra categories is refused', '22023');
select test.throws($$select test.ce_area('{}', '[]')$$, 'A8: ids must be lists', '22023');

-- ===== deals
select test.ce_keepj('d1', jsonb_build_object('id', test.ce_deal(null, '  10% off ', 'percent', 10, 'published', null, null, 'Nice', 'In store')));
select test.ok(test.ce_cc() -> 'deals' -> 0 ->> 'title' = '10% off' and test.ce_cc() -> 'deals' -> 0 ->> 'terms' = 'In store' and (test.ce_cc() -> 'deals' -> 0 ->> 'discount_value')::numeric = 10, 'D1: a deal is created, trimmed');
select test.ce_deal(test.ce_kj('d1', 'id')::uuid, 'Ten off', 'amount', 10, 'draft');
select test.ok(test.ce_cc() -> 'deals' -> 0 ->> 'title' = 'Ten off' and test.ce_cc() -> 'deals' -> 0 ->> 'status' = 'draft' and jsonb_array_length(test.ce_cc() -> 'deals') = 1, 'D2: editing updates in place, no new deal');
select test.throws($$select test.ce_deal(null, '   ')$$, 'D3: a title is required', '22023');
select test.throws($$select test.ce_deal(null, repeat('t', 121))$$, 'D4: a title over 120 is refused', '22023');
select test.throws($$select test.ce_deal(null, 't', 'other', null, 'published', null, null, repeat('d', 501))$$, 'D5: a description over 500 is refused', '22023');
select test.throws($$select test.ce_deal(null, 't', 'other', null, 'published', null, null, null, repeat('d', 501))$$, 'D5b: terms over 500 are refused', '22023');
select test.throws($$select test.ce_deal(null, 't', 'percent', 0)$$, 'D6: 0 percent is refused', '22023');
select test.throws($$select test.ce_deal(null, 't', 'percent', 101)$$, 'D7: over 100 percent is refused', '22023');
select test.throws($$select test.ce_deal(null, 't', 'percent', null)$$, 'D8: a percent deal needs a value', '22023');
select test.throws($$select test.ce_deal(null, 't', 'amount', -5)$$, 'D9: a negative dollar amount is refused', '22023');
select test.throws($$select test.ce_deal(null, 't', 'amount', 100001)$$, 'D10: an absurd dollar amount is refused', '22023');
select test.throws($$select test.ce_deal(null, 't', 'bogo', 5)$$, 'D11: a buy-one-get-one deal takes no amount', '22023');
select test.throws($$select test.ce_deal(null, 't', 'other', 5)$$, 'D12: an "other" deal takes no amount', '22023');
select test.throws($$select test.ce_deal(null, 't', 'other', null, 'published', now(), now() - interval '1 day')$$, 'D13: ending before the start is refused', '22023');
select test.throws($$select test.ce_deal(null, 't', 'other', null, 'published', null, now() - interval '1 day')$$, 'D13b: ending in the past with the default start is refused', '22023');
select test.throws($$select test.ce_deal(null, 't', 'other', null, 'live')$$, 'D14: an unknown status is refused', '22P02');
select test.throws($$select test.ce_deal(gen_random_uuid(), 't')$$, 'D15: editing a deal that does not exist is not found', 'P0002');
select test.throws($$select public.save_deal(test.ce_ta(), test.ce_cb2(), test.ce_kj('d1', 'id')::uuid, 't', null, null, 'other', null, 'draft', null, null)$$, 'D16: a deal cannot be edited through a different business', 'P0002');
select test.throws($$select public.delete_deal(test.ce_ta(), test.ce_cb2(), test.ce_kj('d1', 'id')::uuid)$$, 'D17: a deal cannot be deleted through a different business', 'P0002');
select test.ce_deal(null, 'Bogo', 'bogo');
select test.ce_deal(null, 'Archived one', 'other', null, 'archived');
select public.delete_deal(test.ce_ta(), test.ce_cb(), test.ce_kj('d1', 'id')::uuid);
select test.ok(jsonb_array_length(test.ce_cc() -> 'deals') = 2, 'D18: a deal can be deleted');
select test.throws($$select public.delete_deal(test.ce_ta(), test.ce_cb(), test.ce_kj('d1', 'id')::uuid)$$, 'D19: deleting it twice is not found', 'P0002');
select test.as_root();
select test.ok((select count(*) from public.deals where business_id = test.ce_cb()) = 2, 'D20: the deals are real rows for this business only');
select test.as_user(test.id('salesA'));
select test.ce_deal(null, 'cap ' || g) from generate_series(1, 23) g;     -- 1 bogo + 23 = 24 active, plus the archived one
select test.ce_deal(null, 'cap 25');
select test.throws($$select test.ce_deal(null, 'one too many')$$, 'D21: a 26th live deal is refused', '22023');
select test.ce_deal(null, 'archived is fine', 'other', null, 'archived');

-- ===== photos
select test.ce_keepj('p1', test.ce_ph(test.ce_pp('a.jpg'), 'Front of shop', 'gallery', 1000, 800, 600, 'Our shop'));
select test.ok(test.ce_kj('p1', 'id') is not null and (test.ce_cc() -> 'photos' -> 0 ->> 'path') = test.ce_pp('a.jpg') and test.ce_cc() -> 'photos' -> 0 ->> 'alt' = 'Front of shop' and test.ce_cc() -> 'photos' -> 0 ->> 'caption' = 'Our shop', 'O1: a photo is recorded with its path, alt and caption');
select test.ok(test.ce_msg($$select test.ce_ph('other/' || test.ce_cb()::text || '/a.jpg')$$, '%not stored in this business%'), 'O2: a path outside the folder is refused');
select test.ok(test.ce_msg($$select test.ce_ph(test.ce_pp('b.jpg', test.ce_cb2()))$$, '%not stored in this business%'), 'O3: another business''s folder is refused');
select test.ok(test.ce_msg($$select test.ce_ph(test.ce_pp('../x.jpg'))$$, '%not stored in this business%'), 'O4: dot-dot segments are refused');
select test.ok(test.ce_msg($$select test.ce_ph(test.ce_pp('x/../../y.jpg'))$$, '%not stored in this business%'), 'O4b: nested dot-dot is refused');
select test.ok(test.ce_msg($$select test.ce_ph(test.ce_pp('a b.jpg'))$$, '%not stored in this business%'), 'O5: spaces in a path are refused');
select test.ok(test.ce_msg($$select test.ce_ph(test.ce_pp('a%2e.jpg'))$$, '%not stored in this business%'), 'O5b: percent escapes are refused');
select test.ok(test.ce_msg($$select test.ce_ph(test.ce_ta()::text || '/' || test.ce_cb()::text || 'x/a.jpg')$$, '%not stored in this business%'), 'O5c: a folder that merely starts with the business id is refused');
select test.throws($$select public.add_business_photo(test.ce_ta(), test.ce_cb(), 'avatars', test.ce_pp('c.jpg'), 'x', 1, 1, 1, 'gallery', null)$$, 'O6: only the media bucket is allowed', '22023');
select test.throws($$select test.ce_ph(test.ce_pp('c.jpg'), 'x', 'gallery', 1000, 0, 600)$$, 'O7: zero width is refused', '22023');
select test.throws($$select test.ce_ph(test.ce_pp('c.jpg'), 'x', 'gallery', 1000, 800, 10001)$$, 'O8: a huge height is refused', '22023');
select test.throws($$select test.ce_ph(test.ce_pp('c.jpg'), 'x', 'gallery', 5000001)$$, 'O9: over 5 MB is refused', '22023');
select test.throws($$select test.ce_ph(test.ce_pp('c.jpg'), 'x', 'gallery', 0)$$, 'O9b: zero bytes is refused', '22023');
select test.throws($$select test.ce_ph(test.ce_pp('c.jpg'), '   ')$$, 'O10: alt text is required for gallery photos', '22023');
select test.throws($$select test.ce_ph(test.ce_pp('c.jpg'), repeat('a', 201))$$, 'O11: alt over 200 is refused', '22023');
select test.throws($$select test.ce_ph(test.ce_pp('c.jpg'), 'x', 'gallery', 1000, 800, 600, repeat('c', 151))$$, 'O12: caption over 150 is refused', '22023');
select test.throws($$select test.ce_ph(test.ce_pp('a.jpg'), 'dup')$$, 'O13: the same file cannot be recorded twice', '23505');
-- logo / cover replacement
select test.ce_keepj('lg1', test.ce_ph(test.ce_pp('logo1.png'), '', 'logo'));
select test.ok((select m.alt_text from public.business_photos p join public.media_assets m on m.id = p.media_asset_id where p.id = test.ce_kj('lg1', 'id')::uuid) = 'Ce One logo', 'O14: a logo with no alt text gets "<name> logo"');
select test.ce_keepj('lg2', test.ce_ph(test.ce_pp('logo2.png'), 'New logo', 'logo'));
select test.ce_keepj('lg3', test.ce_ph(test.ce_pp('logo3.png'), 'x', 'logo'));
select test.ok(test.ce_kj('lg2', 'replaced') is not null, 'O15a: adding a second logo reports the first as replaced');
select test.ok((select j -> 'replaced' ->> 'path' from ce_pk where k = 'lg3') = test.ce_pp('logo2.png'), 'O15: the replaced logo is reported so the server can delete the file');
select test.ok((select count(*) from public.business_photos where business_id = test.ce_cb() and role = 'logo') = 1, 'O16: there is only ever one logo');
select test.ok((select count(*) from public.media_assets where business_id = test.ce_cb() and storage_path like '%logo%') = 1, 'O17: the replaced logo''s asset row is gone too');
select test.ce_ph(test.ce_pp('cover1.jpg'), 'Cover', 'cover');
select test.ce_keepj('cv2', test.ce_ph(test.ce_pp('cover2.jpg'), 'Cover 2', 'cover'));
select test.ok((select count(*) from public.business_photos where business_id = test.ce_cb() and role = 'cover') = 1 and test.ce_kj('cv2', 'replaced') is not null, 'O18: one cover; the old one is replaced and reported');
-- update / role swap
select public.update_business_photo(test.ce_ta(), test.ce_cb(), test.ce_kj('p1', 'id')::uuid, 'Shop front', 'New caption', 'cover');
select test.ok((select role::text from public.business_photos where id = test.ce_kj('p1', 'id')::uuid) = 'cover' and (select count(*) from public.business_photos where business_id = test.ce_cb() and role = 'cover') = 1, 'O19: promoting a photo to cover demotes the previous cover');
select test.ok((select role::text from public.business_photos p join public.media_assets m on m.id = p.media_asset_id where m.storage_path = test.ce_pp('cover2.jpg')) = 'gallery', 'O20: the previous cover is now a gallery photo');
select test.ok((select alt_text from public.media_assets where storage_path = test.ce_pp('a.jpg')) = 'Shop front', 'O21: update changes alt text');
select test.throws($$select public.update_business_photo(test.ce_ta(), test.ce_cb(), test.ce_kj('p1', 'id')::uuid, '', null, 'gallery')$$, 'O22: update still requires alt text', '22023');
select test.throws($$select public.update_business_photo(test.ce_ta(), test.ce_cb2(), test.ce_kj('p1', 'id')::uuid, 'x', null, 'gallery')$$, 'O23: a photo cannot be updated through another business', 'P0002');
select test.as_root();
select test.ok((select source::text from public.business_photos where id = test.ce_kj('p1', 'id')::uuid) = 'admin', 'O24: photo rows record admin');
select test.as_user(test.id('salesA'));
-- reorder (gallery only)
select test.ce_keepj('g1', test.ce_ph(test.ce_pp('g1.jpg'), 'g1')); select test.ce_keepj('g2', test.ce_ph(test.ce_pp('g2.jpg'), 'g2')); select test.ce_keepj('g3', test.ce_ph(test.ce_pp('g3.jpg'), 'g3'));
select public.reorder_business_photos(test.ce_ta(), test.ce_cb(), jsonb_build_array(test.ce_kj('g3', 'id'), test.ce_kj('g1', 'id'), test.ce_kj('g2', 'id')));
select test.ok((select string_agg(m.storage_path, ',' order by p.sort_order) from public.business_photos p join public.media_assets m on m.id = p.media_asset_id where p.business_id = test.ce_cb() and m.storage_path in (test.ce_pp('g1.jpg'), test.ce_pp('g2.jpg'), test.ce_pp('g3.jpg')))
  = test.ce_pp('g3.jpg') || ',' || test.ce_pp('g1.jpg') || ',' || test.ce_pp('g2.jpg'), 'O25: gallery photos are reordered');
select test.throws($$select public.reorder_business_photos(test.ce_ta(), test.ce_cb(), jsonb_build_array(test.ce_kj('p1', 'id')))$$, 'O26: reordering cannot touch the cover', 'P0002');
select test.throws($$select public.reorder_business_photos(test.ce_ta(), test.ce_cb(), '["junk"]')$$, 'O27: junk ids in a reorder are not found', 'P0002');
select test.throws($$select public.reorder_business_photos(test.ce_ta(), test.ce_cb2(), jsonb_build_array(test.ce_kj('g1', 'id')))$$, 'O28: reordering through another business is not found', 'P0002');
-- delete
select test.ce_keepj('del', public.delete_business_photo(test.ce_ta(), test.ce_cb(), test.ce_kj('g1', 'id')::uuid));
select test.ok(test.ce_kj('del', 'path') = test.ce_pp('g1.jpg') and test.ce_kj('del', 'bucket') = 'media', 'O29: delete returns the file to remove from storage');
select test.ok(test.ce_n('select count(*) from public.media_assets where storage_path = ''' || test.ce_pp('g1.jpg') || '''') = 0 and test.ce_n('select count(*) from public.business_photos where id = ''' || test.ce_kj('g1', 'id') || '''') = 0, 'O30: the photo and asset rows are gone');
select test.throws($$select public.delete_business_photo(test.ce_ta(), test.ce_cb(), test.ce_kj('g1', 'id')::uuid)$$, 'O31: deleting twice is not found', 'P0002');
select test.throws($$select public.delete_business_photo(test.ce_ta(), test.ce_cb2(), test.ce_kj('g2', 'id')::uuid)$$, 'O32: deleting through another business is not found', 'P0002');
-- cap: 30
do $$ begin
  while (select count(*) from public.business_photos where business_id = '00000000-0000-0000-0000-00000000ce01') < 30 loop
    perform test.ce_ph(test.ce_pp('cap' || (select count(*) from public.business_photos where business_id = test.ce_cb()) || '.jpg'), 'cap');
  end loop;
end $$;
select test.ok((select count(*) from public.business_photos where business_id = test.ce_cb()) = 30, 'O33: the business is at 30 photos');
select test.throws($$select test.ce_ph(test.ce_pp('over.jpg'))$$, 'O34: a 31st photo is refused', '22023');
select test.throws($$select test.ce_ph(test.ce_pp('over.png'), 'x', 'logo')$$, 'O35: even a replacing logo is refused at the cap (stays simple)', '22023');

-- ===== isolation: nothing leaked to the other business
select test.as_root();
select test.ok(test.ce_n('select count(*) from public.business_photos where business_id = ''' || test.ce_cb2() || '''') = 0 and test.ce_n('select count(*) from public.business_services where business_id = ''' || test.ce_cb2() || '''') = 0 and test.ce_n('select count(*) from public.deals where business_id = ''' || test.ce_cb2() || '''') = 0, 'Z1: writes for one business never touch another');
select test.as_user(test.id('adminA'));
select test.ok(jsonb_array_length(public.business_content(test.ce_ta(), test.ce_cb()) -> 'photos') = 30, 'Z2: an admin can use the editor too');
select test.as_root();
-- owners and editors cannot rewrite alt text directly (the staff-only update policy)
select test.as_user(test.id('editorA'));
update public.media_assets set alt_text = 'hacked' where business_id = test.ce_cb();
select test.as_root();
select test.ok(test.ce_n('select count(*) from public.media_assets where alt_text = ''hacked''') = 0, 'Z3: an editor cannot update media assets directly');
