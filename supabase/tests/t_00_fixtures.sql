-- Shared fixtures + assertion helpers. Runs as superuser; later test files switch roles with test.as_*().
create schema test;
grant usage on schema test to public;

create function test.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, false); execute 'set role authenticated'; end $$;
create function test.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', false); execute 'set role anon'; end $$;
create function test.as_root() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', false); execute 'reset role'; end $$;

create function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok   - %', msg;
end $$;

-- Passes only if `stmt` raises. Optional sqlstate must match.
create function test.throws(stmt text, msg text, state text default null) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if state is not null and sqlstate <> state then
      raise exception 'FAIL: % (expected %, got % %)', msg, state, sqlstate, sqlerrm;
    end if;
    raise notice 'ok   - % [%]', msg, sqlstate; return;
  end;
  raise exception 'FAIL: % (statement did not raise)', msg;
end $$;

create function test.count(stmt text) returns bigint language plpgsql as $$
declare n bigint; begin execute format('select count(*) from (%s) q', stmt) into n; return n; end $$;

-- ids are fixed so tests can refer to them
create table test.ids (k text primary key, id uuid not null);
grant select on test.ids to public;
insert into test.ids select k, gen_random_uuid() from unnest(array[
  'tenantA','tenantB','regionA','regionB','afton','thayne','alpine','tcommB','catPlumb','catEat','catB',
  'adminA','salesA','editorA','owner1','owner2','adminB','consumer',
  'biz1','biz2','bizP','bizB','biz3','biz4','biz5','biz6','biz7','biz8']) k;
create function test.id(k text) returns uuid language sql stable as $$ select id from test.ids where k = $1 $$;

insert into auth.users (id, email) select test.id(k), k || '@example.test' from unnest(array[
  'adminA','salesA','editorA','owner1','owner2','adminB','consumer']) k;

insert into public.tenants (id, slug, name) values
  (test.id('tenantA'), 'star-valley', 'Star Valley Local'),
  (test.id('tenantB'), 'teton-valley', 'Teton Valley Local');
insert into public.regions (id, tenant_id, slug, name) values
  (test.id('regionA'), test.id('tenantA'), 'star-valley', 'Star Valley'),
  (test.id('regionB'), test.id('tenantB'), 'teton-valley', 'Teton Valley');
insert into public.communities (id, tenant_id, region_id, slug, name) values
  (test.id('afton'),  test.id('tenantA'), test.id('regionA'), 'afton', 'Afton'),
  (test.id('thayne'), test.id('tenantA'), test.id('regionA'), 'thayne', 'Thayne'),
  (test.id('alpine'), test.id('tenantA'), test.id('regionA'), 'alpine', 'Alpine'),
  (test.id('tcommB'), test.id('tenantB'), test.id('regionB'), 'driggs', 'Driggs');
insert into public.categories (id, tenant_id, slug, name) values
  (test.id('catPlumb'), test.id('tenantA'), 'plumbing', 'Plumbing'),
  (test.id('catEat'),   test.id('tenantA'), 'eat-drink', 'Eat & Drink'),
  (test.id('catB'),     test.id('tenantB'), 'plumbing', 'Plumbing');

insert into public.tenant_staff (tenant_id, user_id, role) values
  (test.id('tenantA'), test.id('adminA'),  'admin'),
  (test.id('tenantA'), test.id('salesA'),  'sales'),
  (test.id('tenantA'), test.id('editorA'), 'editor'),
  (test.id('tenantB'), test.id('adminB'),  'admin');

insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone, short_description) values
  (test.id('biz1'), test.id('tenantA'), 'mountain-valley-plumbing', 'Mountain Valley Plumbing', 'unclaimed', test.id('thayne'), test.id('catPlumb'), '307-885-1234', 'Reliable plumbing'),
  (test.id('biz2'), test.id('tenantA'), 'afton-eats', 'Afton Eats', 'unclaimed', test.id('afton'), test.id('catEat'), '307-885-9999', 'Good food'),
  (test.id('bizP'), test.id('tenantA'), 'prospect-co', 'Prospect Co', 'prospect', null, null, null, null),
  (test.id('bizB'), test.id('tenantB'), 'teton-plumbing', 'Teton Plumbing', 'unclaimed', test.id('tcommB'), test.id('catB'), null, null);
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id)
select test.id(k), test.id('tenantA'), k, 'Plumber ' || k, 'unclaimed', test.id('thayne'), test.id('catPlumb')
from unnest(array['biz3','biz4','biz5','biz6','biz7','biz8']) k;
insert into public.tenant_settings (tenant_id, settings) values (test.id('tenantA'), '{"consumer_sending_domain":"mail.example.test"}');
