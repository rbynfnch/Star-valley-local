create schema test; grant usage on schema test to public;
create function test.ok(c boolean, m text) returns void language plpgsql as $$ begin if c is not true then raise exception 'FAIL: %', m; end if; raise notice 'ok   - %', m; end $$;
create function test.count(s text) returns bigint language plpgsql as $$ declare n bigint; begin execute format('select count(*) from (%s) q', s) into n; return n; end $$;
create function test.as_anon() returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub','',false); execute 'set role anon'; end $$;
create function test.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub',u::text,false); execute 'set role authenticated'; end $$;
create function test.as_root() returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub','',false); execute 'reset role'; end $$;

select test.ok((select count(*) from public.tenants) = 1, 'one tenant: Star Valley');
select test.ok((select count(*) from public.communities) = 11, '11 communities');
select test.ok((select count(*) from public.categories where parent_id is null) = 7, '7 top-level categories from the mockup');
select test.ok((select count(*) from public.businesses) = 30, '30 sample businesses');
select test.ok((select bool_and(name like 'Sample %') from public.businesses), 'every business is clearly fictional');
select test.ok(not exists (select 1 from public.businesses where phone !~ '^307-555-01'), 'all phones are in the reserved 555-01xx range');
select test.ok(not exists (select 1 from public.businesses where website is not null and website !~ '\.example$'), 'all websites use the reserved .example TLD');
select test.ok((select count(*) from public.business_hours) > 0 and not exists (select 1 from public.business_hours h join public.businesses b on b.id = h.business_id where b.status = 'prospect'), 'hours exist for published businesses only');

-- verification derived correctly from owners + proofs
select test.ok((select verification_level from public.businesses where slug = 'sample-valley-plumbing') = 'gold', 'plumbing is Gold');
select test.ok((select string_agg(slug, ',' order by slug) from public.businesses where verification_level = 'green')
               = 'sample-creekside-cafe,sample-high-country-roofing,sample-willow-realty', 'exactly three Green');
select test.ok((select count(*) from public.businesses where status = 'claimed') = 4, 'four claimed businesses');
select test.ok((select reverify_due_at is not null from public.businesses where slug = 'sample-valley-plumbing'), 're-verification date present once verified');

-- placements honor every rule
select test.ok((select count(*) from public.placements where status = 'active') = 4, '4 active placements');
select test.ok((select count(*) from public.placements where status = 'waitlist') = 1, '1 waitlisted placement');
select test.ok(exists (select 1 from public.placements p join public.businesses b on b.id = p.business_id
                       where b.slug = 'sample-willow-realty' and p.source = 'founding_member' and p.status = 'active')
               and not exists (select 1 from public.listings l join public.businesses b on b.id = l.business_id where b.slug = 'sample-willow-realty'),
               'comped founding-member Featured exists with no Enhanced listing');
select test.ok((select used from app.placement_availability((select id from public.tenants), 'homepage')) = 2, 'homepage: 2 of 6 used');
select test.ok((select remaining from app.placement_availability((select id from public.tenants), 'homepage')) = 4, 'homepage: 4 remaining');
select test.ok((select remaining from app.placement_availability((select id from public.tenants), 'category',
               (select id from public.categories where slug = 'plumbing'))) = 2, 'plumbing category: 2 of 3 spots remaining');

-- what the public sees
select test.as_anon();
select test.ok(test.count('select 1 from public.businesses') = 26, 'anon sees 26 published businesses');
select test.ok(test.count($$select 1 from public.businesses where status = 'prospect'$$) = 0, 'anon sees no prospects');
select test.ok(test.count('select 1 from public.public_listings') = 4, 'public_listings: 4 Enhanced');
select test.ok(test.count('select 1 from public.public_placements') = 4, 'public_placements: 4 live');
select test.ok(test.count('select 1 from public.business_services') = 10, 'services visible only for the 4 Enhanced businesses');
select test.ok(test.count('select 1 from public.business_faqs') = 3, 'FAQs visible only for Enhanced businesses');
select test.ok(test.count('select 1 from public.deals') = 3, 'anon sees 3 live deals');
select test.ok(test.count('select 1 from public.articles') = 3, 'anon sees 3 articles (owner-only resource hidden)');
select test.ok(test.count('select 1 from public.community_events') = 5, 'anon sees 5 events (2 recurring)');
select test.ok(test.count($$select 1 from public.community_events where rrule is not null$$) = 2, 'recurring events present');
select test.ok(test.count('select 1 from public.article_items') = 4, 'numbered guide items visible');
select test.as_root();

-- staff see more; owner-only content reaches owners
select test.as_user('00000000-0000-4000-8000-000000000002');          -- sales
select test.ok(test.count('select 1 from public.businesses') = 30, 'sales sees prospects too');
select test.ok(test.count('select 1 from public.business_crm') = 5, 'sales sees CRM state');
select test.as_user('00000000-0000-4000-8000-000000000003');          -- editor
select test.ok(test.count('select 1 from public.business_crm') = 0, 'editor cannot see CRM');
select test.ok(test.count('select 1 from public.articles') = 4, 'editor sees the owner-audience article');
select test.as_user('00000000-0000-4000-8000-000000000011');          -- gold owner
select test.ok(test.count('select 1 from public.articles') = 4, 'business owner sees Marketing Resources');
select test.ok(test.count('select 1 from public.listings') = 1, 'owner sees only their own listing');
select test.as_root();

select test.ok(not exists (select 1 from public.business_field_sources where source <> 'import'), 'seeded fields are recorded as import');
select test.ok((select count(*) from public.tenant_products) = 3, 'three products: Enhanced monthly/yearly, Featured monthly');
select test.ok((select amount_cents from public.tenant_products where code = 'enhanced_yearly') = 19900, 'Enhanced yearly is $199');
