-- Local Hotlist: quality rules, editor-only writes, approval workflow, slots, claims (quantity, idempotence, limits), public reads, isolation.
create function test.hl_t() returns uuid language sql as $$ select test.id('tenantA') $$;
create function test.hl_as(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', test.id(u)::text, false); execute 'set role authenticated'; end $$;
create function test.hl_svc() returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', '', false); execute 'set role service_role'; end $$;
create function test.hl_n(q text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute q into n; return n; end $$;
create temp table hl_pk (k text primary key, j jsonb); grant all on hl_pk to public;
create function test.hl_keep(k text, j jsonb) returns void language sql as $$ insert into hl_pk values (k, j) on conflict (k) do update set j = excluded.j $$;
create function test.hl_k(k text, f text default null) returns text language sql as $$ select case when f is null then trim(both '"' from j::text) else j->>f end from hl_pk where hl_pk.k = $1 $$;
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone) values
 ('00000000-0000-0000-0000-00000000e101', test.id('tenantA'), 'hl-cafe',   'Hl Cafe',   'unclaimed', test.id('afton'),  test.id('catEat'),   '307-555-0901'),
 ('00000000-0000-0000-0000-00000000e102', test.id('tenantA'), 'hl-hidden', 'Hl Hidden', 'prospect',  null, null, null);
insert into public.listings (tenant_id, business_id, tier, status, source) values (test.id('tenantA'), '00000000-0000-0000-0000-00000000e101', 'enhanced', 'active', 'paid');
insert into public.business_owners (business_id, tenant_id, user_id) values ('00000000-0000-0000-0000-00000000e101', test.id('tenantA'), test.id('owner1'));
create function test.hb(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000e10' || n)::uuid $$;
create function test.hl_deal(over jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('kind', 'deal', 'category', 'eat_drink', 'badge', 'hot_deal', 'title', 'Two lattes and a pastry', 'summary', 'Breakfast for two',
    'original_cents', 4000, 'price_cents', 2500, 'quantity', 3, 'code_prefix', 'svl25', 'redemption', 'Show the code at the counter.', 'terms', 'Dine in only.',
    'starts_at', now() - interval '1 hour', 'ends_at', now() + interval '10 days') || over $$;
create function test.hl_pick() returns jsonb language sql as $$
  select jsonb_build_object('kind', 'pick', 'category', 'places', 'badge', 'hotlist_pick', 'title', 'Sunset from the bridge', 'summary', 'Go at golden hour', 'starts_at', now() - interval '1 hour') $$;
create function test.hl_img(item uuid) returns void language plpgsql as $$
begin perform public.set_content_image(test.hl_t(), 'hotlist', item, 'media', test.hl_t()::text || '/hotlists/' || item || '/p.jpg', 'A photo', 800, 600, 1000); end $$;

-- ===== who may write
select test.hl_as('editorA');
select test.hl_keep('d1', to_jsonb(public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal(), 'draft')));
select test.as_root();
select test.ok(test.hl_n($$select count(*) from public.hotlist_items where slug = 'two-lattes-and-a-pastry'$$) = 1, 'W1: an editor creates a draft deal with a generated slug');
select test.ok((select code_prefix from public.hotlist_items where id = test.hl_k('d1')::uuid) = 'SVL25', 'W2: the code prefix is upper-cased');
select test.hl_as('salesA');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal(), 'draft')$$, 'W3: sales staff cannot write the Hotlist', '42501');
select test.hl_as('owner1');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal(), 'draft')$$, 'W4: a business owner cannot write it directly', '42501');
select test.throws($$insert into public.hotlist_items (tenant_id, business_id, kind, category, badge, slug, title, status) values (test.hl_t(), test.hb(1), 'pick', 'places', 'hotlist_pick', 'x', 'x', 'published')$$, 'W5: nor insert rows (no table write rights)', '42501');
select test.as_anon();
select test.throws($$select count(*) from public.hotlist_items$$, 'W6: anonymous visitors cannot read the table', '42501');
select test.hl_as('adminB');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal(), 'draft')$$, 'W7: another tenant''s admin cannot write here', '42501');
select test.as_root();

-- ===== quality rules ("no weak offers")
select test.hl_as('editorA');
select test.throws(format($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal('{"price_cents":3800}'), 'draft')$$), 'Q1: a $2 / 5%% saving is refused', '22023');
select test.ok((select count(*) from (select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal('{"original_cents":4000,"price_cents":3000}'), 'draft')) q) = 1, 'Q2: exactly $10 off is allowed');
select test.ok((select count(*) from (select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal('{"title":"Cheap eats","original_cents":1000,"price_cents":800}'), 'draft')) q) = 1, 'Q3: 20% off a small price is allowed');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal('{"price_cents":4000}'), 'draft')$$, 'Q4: price must be below the original', '22023');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal('{"ends_at":null}'), 'draft')$$, 'Q5: a deal needs an end date', '22023');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal(jsonb_build_object('ends_at', now() + interval '200 days')), 'draft')$$, 'Q6: at most 120 days', '22023');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal('{"code_prefix":"a b"}'), 'draft')$$, 'Q7: a bad code prefix is refused', '22023');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal('{"redemption":""}'), 'draft')$$, 'Q8: redemption steps are required', '22023');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal('{"quantity":0}'), 'draft')$$, 'Q9: quantity of zero is refused', '22023');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal('{"badge":"hotlist_pick"}'), 'draft')$$, 'Q10: a deal cannot wear the pick label', '22023');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal('{"title":"x"}'), 'draft')$$, 'Q11: a too-short title is refused', '22023');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_pick() || '{"price_cents":100}', 'draft')$$, 'Q12: a pick has no price', '22023');

-- ===== publish needs a photo and a public business
select test.hl_as('editorA');
select test.throws(format($$select public.save_hotlist_item(test.hl_t(), %L, test.hb(1), test.hl_deal(), 'published')$$, test.hl_k('d1')), 'P1: no photo, no publishing', '22023');
select test.throws($$select public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal(), 'published')$$, 'P2: a new item starts as a draft', '22023');
select test.hl_keep('h2', to_jsonb(public.save_hotlist_item(test.hl_t(), null, test.hb(2), test.hl_deal('{"title":"Hidden biz deal"}'), 'draft')));
select test.hl_img(test.hl_k('h2')::uuid);
select test.throws(format($$select public.save_hotlist_item(test.hl_t(), %L, test.hb(2), test.hl_deal('{"title":"Hidden biz deal"}'), 'published')$$, test.hl_k('h2')), 'P3: a hidden business cannot be on the Hotlist', '22023');
select test.hl_img(test.hl_k('d1')::uuid);
select public.save_hotlist_item(test.hl_t(), test.hl_k('d1')::uuid, test.hb(1), test.hl_deal(), 'published');
select test.as_root();
select test.ok((select status = 'published' and published_at is not null from public.hotlist_items where id = test.hl_k('d1')::uuid), 'P4: with a photo it publishes and stamps the date');
select test.ok(test.hl_n($$select count(*) from public.media_assets where storage_path like '%/hotlists/%'$$) >= 1, 'P5: the image kind "hotlist" is accepted');

-- ===== slots
select test.hl_as('editorA');
select test.hl_keep('p1', to_jsonb(public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_pick(), 'draft')));
select test.hl_img(test.hl_k('p1')::uuid);
select public.save_hotlist_item(test.hl_t(), test.hl_k('p1')::uuid, test.hb(1), test.hl_pick(), 'published');
select public.set_hotlist_features(test.hl_t(), 'hottest', array[test.hl_k('d1')::uuid, test.hl_k('p1')::uuid]);
select test.as_root();
select test.ok(test.hl_n($$select count(*) from public.hotlist_features where slot = 'hottest'$$) = 2, 'F1: two items in "hottest right now"');
select test.hl_as('editorA');
select test.throws(format($$select public.set_hotlist_features(test.hl_t(), 'business', array[%L::uuid, %L::uuid])$$, test.hl_k('d1'), test.hl_k('p1')), 'F2: the Hotlist business slot holds one', '22023');
select test.throws(format($$select public.set_hotlist_features(test.hl_t(), 'hottest', array[%L::uuid, %L::uuid])$$, test.hl_k('d1'), test.hl_k('d1')), 'F3: no duplicates in a slot', '22023');
select test.throws(format($$select public.set_hotlist_features(test.hl_t(), 'this_week', array[%L::uuid])$$, test.hl_k('h2')), 'F4: only published items can be featured', '22023');
select test.hl_as('salesA');
select test.throws(format($$select public.set_hotlist_features(test.hl_t(), 'hottest', array[%L::uuid])$$, test.hl_k('d1')), 'F5: sales staff cannot change slots', '42501');
select test.hl_as('editorA');
select public.save_hotlist_item(test.hl_t(), test.hl_k('p1')::uuid, test.hb(1), test.hl_pick(), 'archived');
select test.as_root();
select test.ok(test.hl_n($$select count(*) from public.hotlist_features where slot = 'hottest'$$) = 1, 'F6: archiving an item takes it out of its slots');

-- ===== claims
select test.hl_svc();
select test.hl_keep('c1', public.hotlist_claim(test.hl_t(), test.hl_k('d1')::uuid, test.id('consumer')));
select test.as_root();
select test.ok(test.hl_k('c1', 'code') ~ '^SVL25-[A-HJKMNP-Z2-9]{5}$' and test.hl_k('c1', 'already') = 'false', 'C1: a claim gets PREFIX-XXXXX from an unambiguous alphabet');
select test.hl_svc();
select test.ok(public.hotlist_claim(test.hl_t(), test.hl_k('d1')::uuid, test.id('consumer')) ->> 'code' = test.hl_k('c1', 'code') and public.hotlist_claim(test.hl_t(), test.hl_k('d1')::uuid, test.id('consumer')) ->> 'already' = 'true', 'C2: claiming again returns the same code, not a second claim');
select test.as_root();
select test.ok(test.hl_n($$select count(*) from public.hotlist_claims$$) = 1, 'C3: one claim per account per deal');
select test.hl_svc();
select test.hl_keep('c2', public.hotlist_claim(test.hl_t(), test.hl_k('d1')::uuid, test.id('owner1')));
select test.hl_keep('c3', public.hotlist_claim(test.hl_t(), test.hl_k('d1')::uuid, test.id('owner2')));
select test.throws(format($$select public.hotlist_claim(test.hl_t(), %L, test.id('adminA'))$$, test.hl_k('d1')), 'C4: a quantity of 3 means the 4th claim is refused as sold out', '22023');
select test.throws(format($$select public.hotlist_claim(test.hl_t(), %L, gen_random_uuid())$$, test.hl_k('d1')), 'C5: an unknown account cannot claim', '28000');
select test.throws(format($$select public.hotlist_claim(test.id('tenantB'), %L, test.id('consumer'))$$, test.hl_k('d1')), 'C6: another tenant cannot claim this tenant''s deal', 'P0002');
select test.throws(format($$select public.hotlist_claim(test.hl_t(), %L, test.id('consumer'))$$, test.hl_k('p1')), 'C7: a pick cannot be claimed', 'P0002');
select test.as_root();
select test.ok(test.hl_n($$select count(distinct code) from public.hotlist_claims$$) = 3, 'C8: codes are unique');
select test.hl_as('editorA');
select test.throws(format($$select public.save_hotlist_item(test.hl_t(), %L, test.hb(1), test.hl_deal('{"price_cents":2000}'), 'published')$$, test.hl_k('d1')), 'C9: once claimed, the price cannot change', '22023');
select test.throws(format($$select public.save_hotlist_item(test.hl_t(), %L, test.hb(1), test.hl_deal('{"quantity":2}'), 'published')$$, test.hl_k('d1')), 'C10: nor the quantity drop below the claimed count', '22023');
select test.ok((select count(*) from (select public.save_hotlist_item(test.hl_t(), test.hl_k('d1')::uuid, test.hb(1), test.hl_deal('{"quantity":50,"summary":"Now with more"}'), 'published')) q) = 1, 'C11: raising the quantity and editing words is fine');
select test.throws(format($$select public.delete_hotlist_item(test.hl_t(), %L)$$, test.hl_k('d1')), 'C12: a published deal cannot be deleted', '22023');
select test.hl_as('consumer');
select test.ok(test.count($$select 1 from public.hotlist_claims$$) = 1, 'C13: a person sees only their own claim');
select test.throws($$update public.hotlist_claims set redeemed_at = now()$$, 'C14: and cannot edit it', '42501');
select test.as_anon();
select test.throws($$select public.hotlist_claim(test.hl_t(), gen_random_uuid(), test.id('consumer'))$$, 'C15: the claim function is not callable from the browser', '42501');

-- ===== daily limit and expiry
select test.as_root();
create temp table hl_ids (n int, id uuid); grant all on hl_ids to public;
select test.hl_as('editorA');
do $$ declare i int; v uuid;
begin
  for i in 1..11 loop
    v := public.save_hotlist_item(test.hl_t(), null, test.hb(1), test.hl_deal(jsonb_build_object('title', 'Limit deal ' || i, 'quantity', null)), 'draft');
    perform test.hl_img(v);
    perform public.save_hotlist_item(test.hl_t(), v, test.hb(1), test.hl_deal(jsonb_build_object('title', 'Limit deal ' || i, 'quantity', null)), 'published');
    insert into hl_ids values (i, v);
  end loop;
end $$;
select test.hl_svc();
do $$ declare i int;
begin for i in 1..10 loop perform public.hotlist_claim(test.hl_t(), (select id from hl_ids where n = i), test.id('adminB')); end loop; end $$;
select test.throws($$select public.hotlist_claim(test.hl_t(), (select id from hl_ids where n = 11), test.id('adminB'))$$, 'L1: the eleventh claim in a day is refused', '53400');
select test.as_root();
update public.hotlist_items set ends_at = now() - interval '1 minute', starts_at = now() - interval '2 days' where id = (select id from hl_ids where n = 11);
select test.hl_svc();
select test.throws($$select public.hotlist_claim(test.hl_t(), (select id from hl_ids where n = 11), test.id('editorA'))$$, 'L2: an ended deal cannot be claimed', '22023');
select test.as_root();

-- ===== public reads
select test.as_anon();
select test.ok((select count(*) from public.hotlist_list(test.hl_t(), null, null, null, null, null, 'newest', 50, 0)) >= 10, 'R1: anonymous visitors list current published items');
select test.ok(not exists (select 1 from public.hotlist_list(test.hl_t(), null, null, null, null, null, 'newest', 50, 0) where slug = 'hidden-biz-deal'), 'R2: drafts and hidden businesses never appear');
select test.ok(not exists (select 1 from public.hotlist_list(test.hl_t(), null, null, null, null, null, 'newest', 50, 0) where slug = 'limit-deal-11'), 'R3: ended deals leave the list');
select test.ok(public.hotlist_detail(test.hl_t(), 'limit-deal-11') ->> 'title' = 'Limit deal 11', 'R4: but their page still opens (shared links keep working)');
select test.ok(public.hotlist_detail(test.hl_t(), 'hidden-biz-deal') is null, 'R5: a draft has no page');
select test.ok(public.hotlist_detail(test.id('tenantB'), 'two-lattes-and-a-pastry') is null, 'R6: another tenant''s host cannot open it');
select test.ok((select count(*) from public.hotlist_list(test.hl_t(), 'pick')) = 0, 'R7: kind filter (the pick was archived)');
select test.ok((select count(*) from public.hotlist_list(test.hl_t(), 'deal', 'eat_drink', 'lattes')) = 1, 'R8: category and full-text search narrow the list');
select test.ok((select count(*) from public.hotlist_list(test.hl_t(), 'deal', null, null, test.id('thayne'))) = 0 and (select count(*) from public.hotlist_list(test.hl_t(), 'deal', null, null, test.id('afton'))) >= 1, 'R9: the town filter uses the business''s home community');
select test.ok((select count(*) from public.hotlist_list(test.hl_t(), 'deal', null, null, null, 2600)) >= 1 and not exists (select 1 from public.hotlist_list(test.hl_t(), 'deal', null, null, null, 2000)), 'R10: the price filter');
select test.ok((select slug from public.hotlist_list(test.hl_t(), 'deal', null, null, null, null, 'popular', 1)) in ('two-lattes-and-a-pastry', 'limit-deal-1'), 'R11: most popular sorts by claims');
select test.ok((select claimed_count from public.hotlist_list(test.hl_t(), 'deal', null, 'lattes')) = 3, 'R12: the list carries the claimed count (for "limited" and "sold out" states)');
select test.ok(public.hotlist_detail(test.hl_t(), 'two-lattes-and-a-pastry')::text !~ 'reviewed|submitted|created_by|reject', 'R13: the public detail has no staff fields');
select test.ok((select count(*) from public.hotlist_features_public(test.hl_t())) = 1, 'R14: public slots show only live featured items');
select test.ok((select count(*) from public.hotlist_category_counts(test.hl_t())) >= 1, 'R15: category counts');

-- ===== approval workflow and submissions
select test.hl_as('owner1');
select test.hl_keep('s1', to_jsonb(public.submit_hotlist_offer(test.hl_t(), test.hb(1), test.hl_deal('{"title":"Owner submitted deal"}'))));
select test.throws($$select public.submit_hotlist_offer(test.hl_t(), test.hb(1), test.hl_deal('{"price_cents":3900,"title":"Weak"}'))$$, 'S1: submissions meet the same quality rules', '22023');
select test.throws($$select public.submit_hotlist_offer(test.hl_t(), test.hb(1), test.hl_pick())$$, 'S2: businesses cannot submit picks', '22023');
select test.hl_as('owner2');
select test.throws($$select public.submit_hotlist_offer(test.hl_t(), test.hb(1), test.hl_deal())$$, 'S3: only the business''s own owner can submit', '42501');
select test.as_anon();
select test.throws($$select public.submit_hotlist_offer(test.hl_t(), test.hb(1), test.hl_deal())$$, 'S4: signed-out visitors cannot', '42501');
select test.as_root();
select test.ok((select status = 'pending' and submitted_by = test.id('owner1') from public.hotlist_items where id = test.hl_k('s1')::uuid), 'S5: it waits as pending, attributed to the owner');
select test.ok(public.hotlist_detail(test.hl_t(), 'owner-submitted-deal') is null, 'S6: pending items are not public');
select test.hl_as('owner1');
select test.ok(test.count($$select 1 from public.hotlist_items where status = 'pending'$$) = 1, 'S7: the owner can see their own pending offer');
select test.throws(format($$update public.hotlist_items set status = 'published' where id = %L$$, test.hl_k('s1')), 'S8: but cannot publish it (no update right)', '42501');
select test.throws(format($$select public.review_hotlist_item(test.hl_t(), %L, 'approve')$$, test.hl_k('s1')), 'S9: nor approve it', '42501');
select test.as_root();
update public.listings set tier = 'free' where business_id = test.hb(1);
select test.hl_as('owner1');
select test.throws($$select public.submit_hotlist_offer(test.hl_t(), test.hb(1), test.hl_deal('{"title":"Free tier try"}'))$$, 'S10: a Free listing cannot submit offers', '22023');
select test.as_root();
update public.listings set tier = 'enhanced' where business_id = test.hb(1);
select test.hl_as('editorA');
select test.throws(format($$select public.review_hotlist_item(test.hl_t(), %L, 'approve')$$, test.hl_k('s1')), 'A1: approval needs a photo first', '22023');
select test.throws(format($$select public.review_hotlist_item(test.hl_t(), %L, 'reject')$$, test.hl_k('s1')), 'A2: a rejection needs a reason', '22023');
select test.hl_img(test.hl_k('s1')::uuid);
select public.review_hotlist_item(test.hl_t(), test.hl_k('s1')::uuid, 'approve');
select test.as_root();
select test.ok((select status = 'published' and reviewed_by = test.id('editorA') and reviewed_at is not null from public.hotlist_items where id = test.hl_k('s1')::uuid), 'A3: approval publishes and records who and when');
select test.hl_as('editorA');
select test.throws(format($$select public.review_hotlist_item(test.hl_t(), %L, 'approve')$$, test.hl_k('s1')), 'A4: only pending items are reviewed', '22023');
select test.hl_as('owner1');
select test.hl_keep('s2', to_jsonb(public.submit_hotlist_offer(test.hl_t(), test.hb(1), test.hl_deal('{"title":"Second submission"}'))));
select test.hl_as('editorA');
select public.review_hotlist_item(test.hl_t(), test.hl_k('s2')::uuid, 'reject', 'Needs a bigger saving');
select test.as_root();
select test.ok((select status = 'rejected' and reject_reason = 'Needs a bigger saving' from public.hotlist_items where id = test.hl_k('s2')::uuid), 'A5: rejection stores the reason');
select test.hl_as('editorA');
select test.throws(format($$select public.save_hotlist_item(test.hl_t(), %L, test.hb(1), test.hl_deal('{"title":"Second submission"}'), 'published')$$, test.hl_k('s2')), 'A6: a rejected submission cannot be revived by editing', '22023');
select test.hl_as('owner1');
select test.hl_keep('s3', to_jsonb(public.submit_hotlist_offer(test.hl_t(), test.hb(1), test.hl_deal('{"title":"Third"}'))));
select test.hl_keep('s4', to_jsonb(public.submit_hotlist_offer(test.hl_t(), test.hb(1), test.hl_deal('{"title":"Fourth"}'))));
select test.hl_keep('s5', to_jsonb(public.submit_hotlist_offer(test.hl_t(), test.hb(1), test.hl_deal('{"title":"Fifth"}'))));
select test.throws($$select public.submit_hotlist_offer(test.hl_t(), test.hb(1), test.hl_deal('{"title":"Sixth"}'))$$, 'A7: at most three offers waiting per business', '53400');
select test.as_root();

-- ===== redeeming a code
select test.hl_as('salesA');
select test.ok(public.redeem_hotlist_code(test.hl_t(), lower(test.hl_k('c1', 'code'))) ->> 'result' = 'redeemed', 'X1: staff redeem a code (case does not matter)');
select test.ok(public.redeem_hotlist_code(test.hl_t(), test.hl_k('c1', 'code')) ->> 'result' = 'already_redeemed', 'X2: a second redemption is reported, not repeated');
select test.throws($$select public.redeem_hotlist_code(test.hl_t(), 'NOPE')$$, 'X3: junk is refused', '22023');
select test.throws($$select public.redeem_hotlist_code(test.hl_t(), 'SVL25-AAAAA')$$, 'X4: an unknown code is refused', 'P0002');
select test.hl_as('consumer');
select test.throws($$select public.redeem_hotlist_code(test.hl_t(), 'SVL25-AAAAA')$$, 'X5: consumers cannot redeem', '42501');
select test.hl_as('adminB');
select test.throws(format($$select public.redeem_hotlist_code(test.hl_t(), %L)$$, test.hl_k('c2', 'code')), 'X6: another tenant''s admin cannot', '42501');
select test.as_root();

-- ===== delete
select test.hl_as('editorA');
select test.ok((select count(*) from (select public.delete_hotlist_item(test.hl_t(), test.hl_k('s2')::uuid)) q) = 1, 'D1: a rejected item can be deleted');
select test.throws(format($$select public.delete_hotlist_item(test.hl_t(), %L)$$, test.hl_k('s3')), 'D2: a pending item cannot (review it first)', '22023');
select test.as_root();
select test.ok(test.hl_n($$select count(*) from public.hotlist_items where status = 'published' and image_media_id is null$$) = 0, 'D3: no published item is ever without a photo');
