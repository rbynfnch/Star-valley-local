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

-- event wall-clock times are stored as the TENANT's local time (Denver), not UTC
select test.ok((select bool_and(extract(hour from starts_at at time zone 'America/Denver') between 7 and 20) from public.community_events), 'seeded events start between 7:00 and 20:59 local time');
select test.ok((select extract(hour from starts_at at time zone 'America/Denver') = 8 from public.community_events where slug = 'sample-farmers-market'), 'the farmers market starts at 8:00 local');

-- =====================================================================================================
-- Directory search (public.search_businesses), always called AS ANON, the way the public site calls it.
-- =====================================================================================================
create function test.srch(q text default null, comms text[] default null, cats text[] default null,
  verified boolean default false, featured boolean default false, deals boolean default false, quotes boolean default false,
  price smallint[] default null, sort text default 'relevance', lim int default 50, off int default 0)
returns table (slug text, name text, total_count bigint, live_placement boolean, accepts_quotes boolean, has_live_deal boolean, verification_level public.verification_level)
language sql stable as $$
  select b.slug, b.name, b.total_count, b.live_placement, b.accepts_quotes, b.has_live_deal, b.verification_level
  from public.search_businesses(
    (select id from public.tenants where slug = 'star-valley'), q,
    (select array_agg(id) from public.communities where slug = any (comms)),
    (select array_agg(c.id) from public.categories c where c.slug = any (cats) or c.parent_id in (select id from public.categories where slug = any (cats))),
    verified, featured, deals, quotes, price, sort, lim, off) b
$$;
grant execute on function test.srch(text, text[], text[], boolean, boolean, boolean, boolean, smallint[], text, int, int) to public;
create function test.names(rows_ text) returns text[] language plpgsql as $$ declare r text[]; begin execute format('select coalesce(array_agg(name order by ord), ''{}'') from (select name, row_number() over () ord from (%s) q) z', rows_) into r; return r; end $$;
grant execute on function test.names(text) to public;

select test.as_anon();
-- text search
select test.ok(test.count($$select * from test.srch()$$) = 26, 'S1: no query returns all 26 public businesses (never the 4 prospects)');
select test.ok((test.names($$select * from test.srch('plumbing')$$))[1] = 'Sample Valley Plumbing', 'S2: "plumbing" ranks the plumber first');
select test.ok('Sample Valley Plumbing' = any (test.names($$select * from test.srch('plumber')$$)), 'S3: "plumber" still finds Plumbing (fuzzy name)');
select test.ok('Sample Valley Plumbing' = any (test.names($$select * from test.srch('plumbng')$$)), 'S4: a typo ("plumbng") still finds it');
select test.ok('Sample Valley Plumbing' = any (test.names($$select * from test.srch('water heaters')$$)), 'S5: matches an Enhanced business''s services');
select test.ok('Sample Valley Plumbing' = any (test.names($$select * from test.srch('PLUMBING')$$)), 'S6: case-insensitive');
select test.ok(test.count($$select * from test.srch('zzzzqqqq')$$) = 0, 'S7: nonsense returns nothing');
select test.ok((test.names($$select * from test.srch('roofing')$$))[1] = 'Sample High Country Roofing', 'S8: "roofing" ranks the roofer first');
select test.ok('Sample Smile Dental' = any (test.names($$select * from test.srch('dentists')$$)), 'S9: matches on category name');
-- hostile and odd input never errors
select test.ok(test.count($$select * from test.srch('''; drop table public.businesses;--')$$) >= 0, 'S10: SQL-injection text is just text');
select test.ok(test.count($$select * from test.srch('a & | ! ( <-> :* \ "unclosed')$$) >= 0, 'S11: tsquery operators in user text never error');
select test.ok(test.count($$select * from test.srch('the')$$) >= 0, 'S12: a stop-word-only query does not error');
select test.ok(test.count($$select * from test.srch(repeat('plumbing ', 500))$$) >= 0, 'S13: a 4,500-character query is truncated, not an error');
select test.ok(test.count($$select * from test.srch('   ')$$) = 26, 'S14: blank text is the same as no text');
select test.ok(test.count($$select * from test.srch('%')$$) = 0 and test.count($$select * from test.srch('_')$$) = 0, 'S15: LIKE wildcards are matched literally');
-- filters
select test.ok(test.count($$select * from test.srch(comms => array['afton'])$$) > 0
               and 'Sample Valley Plumbing' = any (test.names($$select * from test.srch(comms => array['afton'])$$)),
               'F1: community filter includes a Thayne business that SERVES Afton');
select test.ok(not ('Sample Smile Dental' = any (test.names($$select * from test.srch(comms => array['thayne'])$$))), 'F2: and excludes an Afton-only business from Thayne');
select test.ok(test.count($$select * from test.srch(comms => array['thayne','alpine'])$$) > test.count($$select * from test.srch(comms => array['alpine'])$$), 'F3: several communities widen the result');
select test.ok('Sample Valley Plumbing' = any (test.names($$select * from test.srch(cats => array['home-property'])$$))
               and 'Sample Smile Dental' <> all (test.names($$select * from test.srch(cats => array['home-property'])$$)), 'F4: a top-level category includes its subcategories');
select test.ok(test.names($$select * from test.srch(cats => array['plumbing'])$$) = array['Sample Valley Plumbing'], 'F5: a subcategory is exact');
select test.ok(test.count($$select * from test.srch(verified => true)$$) = 4 and test.count($$select * from test.srch(verified => true) where verification_level = 'none'$$) = 0, 'F6: verified-only returns exactly the 4 verified businesses');
select test.ok(test.count($$select * from test.srch(featured => true)$$) = 3 and test.count($$select * from test.srch(featured => true) where not live_placement$$) = 0, 'F7: featured-only returns the 3 with a live placement');
select test.ok(test.count($$select * from test.srch(deals => true)$$) = 3 and test.count($$select * from test.srch(deals => true) where not has_live_deal$$) = 0, 'F8: deals-only returns the 3 with a live deal');
select test.ok(test.count($$select * from test.srch(quotes => true)$$) = 4 and test.count($$select * from test.srch(quotes => true) where not accepts_quotes$$) = 0, 'F9: accepts-quotes returns exactly the 4 Enhanced businesses');
select test.ok(test.count($$select * from test.srch(price => array[1]::smallint[])$$) = (select count(*) from public.businesses where price_range = 1), 'F10: price filter');
select test.ok(test.count($$select * from test.srch(price => array[1,2]::smallint[])$$) > test.count($$select * from test.srch(price => array[1]::smallint[])$$), 'F11: several price levels widen the result');
select test.ok(test.count($$select * from test.srch('plumbing', comms => array['thayne'], verified => true, deals => true, quotes => true)$$) = 1, 'F12: filters combine (AND)');
select test.ok(test.count($$select * from test.srch('plumbing', comms => array['alpine'], cats => array['dentists'])$$) = 0, 'F13: contradictory filters return nothing, not everything');
-- paging and sorting
select test.ok(test.count($$select * from test.srch(lim => 5)$$) = 5 and (select max(total_count) from test.srch(lim => 5)) = 26, 'P1: a page has `limit` rows and total_count is the full count');
select test.ok((select count(distinct slug) from (select slug from test.srch(lim => 10, off => 0, sort => 'name') union all select slug from test.srch(lim => 10, off => 10, sort => 'name') union all select slug from test.srch(lim => 10, off => 20, sort => 'name')) x) = 26, 'P2: three pages cover all 26 with no overlap');
select test.ok(test.count($$select * from test.srch(lim => 5, off => 100)$$) = 0, 'P3: an offset past the end is empty');
select test.ok(test.count($$select * from test.srch(lim => 999)$$) = 26 and test.count($$select * from test.srch(lim => 0)$$) = 1, 'P4: limit is clamped to 1..50');
select test.ok(test.count($$select * from test.srch(off => -5)$$) = 26, 'P5: a negative offset is treated as 0');
select test.ok(test.names($$select * from test.srch(sort => 'name')$$) = (select array_agg(name order by name) from public.businesses where status in ('unclaimed','claimed')), 'P6: name sort is alphabetical');
select test.ok(test.names($$select * from test.srch(sort => 'bogus')$$) = test.names($$select * from test.srch(sort => 'relevance')$$), 'P7: an unknown sort falls back to relevance');
select test.ok(not exists (select 1 from unnest(array['sample', 'valley', 'plumbing', 'roof', 'cafe', 'lodge', 'sample shop']) q
                           where test.names(format('select * from test.srch(%L, sort => ''bogus'')', q)) is distinct from test.names(format('select * from test.srch(%L, sort => ''relevance'')', q))),
               'P7b: an unknown sort gives exactly the relevance order for 7 queries');
select test.ok(exists (select 1 from unnest(array['sample', 'valley', 'plumbing', 'roof', 'cafe', 'lodge', 'sample shop']) q
                       where test.names(format('select * from test.srch(%L, sort => ''name'')', q)) is distinct from test.names(format('select * from test.srch(%L, sort => ''relevance'')', q))),
               'P7c: relevance order really differs from name order for at least one of those queries (so P7b can fail)');
select test.ok(test.names($$select * from test.srch(lim => 7)$$) = test.names($$select * from test.srch(lim => 7)$$), 'P8: results are deterministic');
-- the rules
select test.ok(not exists (select 1 from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
                           where r.routine_name = 'search_businesses' and p.parameter_mode = 'OUT' and p.parameter_name in ('source', 'created_by', 'status', 'rating', 'distance', 'is_open', 'is_featured')),
               'R1: the result exposes no commercial, rating, distance or open-now fields');
select test.ok((select string_agg(name, ',' order by name) from test.srch('sample', lim => 50)) = (select string_agg(name, ',' order by name) from test.srch('sample', lim => 50, sort => 'name')), 'R2: a paid placement does not change WHICH businesses match');
-- R2b: the ORDER of results is identical with and without live Featured placements (paid never buys rank)
create temp table order_before as select q, (select string_agg(slug, ',' order by ord) from (select slug, row_number() over () ord from test.srch(q)) z) as ord
  from unnest(array['sample', 'plumbing', 'valley', 'roof', 'cafe', 'sample lodge', 'law']) q;
grant select on order_before to public;
select test.as_root();
update public.placements set status = 'cancelled' where status = 'active';
select test.as_anon();
select test.ok((select count(*) from test.srch(featured => true)) = 0, 'R2b setup: with every placement cancelled, nothing is Featured');
select test.ok(not exists (select 1 from order_before b where b.ord is distinct from (select string_agg(slug, ',' order by ord) from (select slug, row_number() over () ord from test.srch(b.q)) z)),
               'R2b: result order is IDENTICAL with and without live placements, for 7 different queries');
select test.as_root();
update public.placements set status = 'active' where status = 'cancelled';
select test.as_anon();
select test.ok((select live_placement from test.srch('Sample Valley Plumbing') limit 1) and not (select live_placement from test.srch('Sample Smile Dental') limit 1),
               'R3: live_placement is a per-business flag (true for the Featured plumber, false for others)');
select test.as_root();
-- tenant isolation and RLS-gated content (the destructive part runs in a transaction that is rolled back, so the
-- seed database is left exactly as it was found: other checks, like the smoke tests, rely on that)
begin;
select test.as_anon();
select test.ok(test.count($$select * from public.search_businesses(gen_random_uuid(), null)$$) = 0, 'R4: another tenant id returns nothing');
select test.as_root();
insert into public.business_services (tenant_id, business_id, name) select tenant_id, id, 'Zebra grooming' from public.businesses where slug = 'sample-creekside-cafe';
select test.as_anon();
select test.ok(test.count($$select * from test.srch('zebra grooming')$$) = 0, 'R5: a service on a FREE listing is invisible to search (Enhanced-only content)');
select test.as_root();
insert into public.listings (tenant_id, business_id, tier, status, starts_at) select tenant_id, id, 'enhanced', 'active', now() - interval '1 day' from public.businesses where slug = 'sample-creekside-cafe';
select test.as_anon();
select test.ok(test.count($$select * from test.srch('zebra grooming')$$) = 1, 'R6: it becomes searchable the moment the business is Enhanced');
select test.as_root();
update public.businesses set status = 'archived' where slug = 'sample-creekside-cafe';
select test.as_anon();
select test.ok(test.count($$select * from test.srch('zebra grooming')$$) = 0 and test.count($$select * from test.srch()$$) = 25, 'R7: an archived business disappears from search');
select test.as_root();
rollback;
