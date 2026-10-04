-- public_listings / public_placements: the only way the public sees tier + Featured, without commercial fields.
select test.ok(not exists (select 1 from information_schema.columns where table_schema = 'public'
                           and table_name in ('public_listings', 'public_placements')
                           and column_name in ('source', 'created_by', 'status', 'renewal_reminder_sent_at')),
               'public views expose no source / created_by / status / reminder columns');

select test.as_anon();
select test.ok(test.count($$select 1 from public.public_listings where business_id = test.id('biz1')$$) = 1, 'anon sees biz1''s active Enhanced listing via the view');
select test.throws('select * from public.listings', 'anon cannot read base listings', '42501');
select test.as_user(test.id('consumer'));
select test.ok(test.count('select 1 from public.listings') = 0, 'signed-in consumer sees zero rows of base listings');
select test.ok(test.count('select 1 from public.placements') = 0, 'signed-in consumer sees zero rows of base placements');
select test.ok(test.count('select 1 from public.public_listings') > 0, 'signed-in consumer can use the public view');
select test.as_user(test.id('owner1'));
select test.ok(test.count($$select 1 from public.listings where business_id = test.id('biz1')$$) = 1, 'owner sees own listing in the base table');
select test.as_user(test.id('owner2'));
select test.ok(test.count($$select 1 from public.listings where business_id = test.id('biz1')$$) = 0, 'other owner does not see it');
select test.as_user(test.id('salesA'));
select test.ok(test.count('select 1 from public.listings') > 0, 'staff see base listings');
select test.as_user(test.id('adminB'));
select test.ok(test.count($$select 1 from public.listings where tenant_id = test.id('tenantA')$$) = 0, 'staff of another tenant cannot see them');

-- the view only shows live rows of public businesses
select test.as_root();
create temp table v as select gen_random_uuid() as pb, gen_random_uuid() as ab;
insert into public.businesses (id, tenant_id, slug, name, status) select pb, test.id('tenantA'), 'view-prospect', 'View Prospect', 'prospect' from v;
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id)
  select ab, test.id('tenantA'), 'view-archived', 'View Archived', 'archived', null, null from v;
insert into public.listings (tenant_id, business_id, status) select test.id('tenantA'), pb, 'active' from v;
insert into public.listings (tenant_id, business_id, status, starts_at, ends_at)
  select test.id('tenantA'), ab, 'active', now() - interval '10 days', now() - interval '1 day' from v;
select test.ok((select count(*) from public.listings where business_id in (select pb from v union select ab from v)) = 2, 'precondition: both listings exist in the base table');
grant select on v to public;
select test.as_anon();
select test.ok(test.count($$select 1 from public.public_listings where business_id in (select pb from v union select ab from v)$$) = 0,
               'as anon: prospect and expired/archived listings never appear in the public view');
select test.as_root();
-- a future placement and a waitlisted one are not visible either
select test.ok((select count(*) from public.public_placements where start_at > now() or end_at <= now()) = 0, 'no future/expired placements in the view');
select test.ok((select count(*) from public.public_placements pp join public.placements p on p.id = pp.id where p.status <> 'active') = 0, 'no waitlisted/pending placements in the view');
