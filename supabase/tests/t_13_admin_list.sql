-- Admin business list: filters, paging, stage default, search escaping, access. Fresh businesses prefixed "Lst ".
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone) values
 ('00000000-0000-0000-0000-0000000000e1', test.id('tenantA'), 'lst-alpha',  'Lst Alpha',  'unclaimed', test.id('afton'),  test.id('catPlumb'), '307-555-0711'),
 ('00000000-0000-0000-0000-0000000000e2', test.id('tenantA'), 'lst-bravo',  'Lst Bravo',  'unclaimed', test.id('thayne'), test.id('catPlumb'), '307-555-0712'),
 ('00000000-0000-0000-0000-0000000000e3', test.id('tenantA'), 'lst-charlie','Lst Charlie','prospect',  null,             null,                  null),
 ('00000000-0000-0000-0000-0000000000e4', test.id('tenantA'), 'lst-delta',  'Lst Delta',  'archived',  test.id('afton'),  test.id('catEat'),  null),
 ('00000000-0000-0000-0000-0000000000e5', test.id('tenantA'), 'lst_100%',   'Lst 100% Under_score', 'unclaimed', test.id('afton'), test.id('catEat'), null);
insert into public.business_crm (business_id, tenant_id, lead_stage) values ('00000000-0000-0000-0000-0000000000e2', test.id('tenantA'), 'interested');
select test.make_featurable('00000000-0000-0000-0000-0000000000e1', true, true);   -- verified + Enhanced
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id)
 values ('00000000-0000-0000-0000-0000000000e6', test.id('tenantA'), 'lst-echo', 'Lst Echo', 'unclaimed', test.id('afton'), test.id('catEat'));
insert into public.listings (tenant_id, business_id, tier, status, source, starts_at, ends_at)
 values (test.id('tenantA'), '00000000-0000-0000-0000-0000000000e6', 'enhanced', 'active', 'paid', now() - interval '3 days', now() - interval '1 day');   -- "active" but past its end date

create function test.lst(q text default null, st public.business_status[] default null, com uuid default null, cat uuid default null,
                        tier public.listing_tier default null, stage public.lead_stage default null, ver boolean default null, lim int default 25, off int default 0)
returns jsonb language sql as $$ select public.admin_list_businesses(test.id('tenantA'), q, st, com, cat, tier, stage, ver, lim, off) $$;
create function test.names(j jsonb) returns text language sql as $$ select coalesce(string_agg(r->>'name', ',' order by ord), '') from jsonb_array_elements(j->'rows') with ordinality t(r, ord) $$;

select test.as_user(test.id('salesA'));
select test.ok(test.names(test.lst('Lst')) = 'Lst 100% Under_score,Lst Alpha,Lst Bravo,Lst Charlie,Lst Echo', 'L1: search by name; archived hidden by default; stable name order');
select test.ok((test.lst('Lst')->>'total')::int = 5, 'L2: total matches');
select test.ok(test.names(test.lst('Lst', '{archived}')) = 'Lst Delta', 'L3: status filter can show archived');
select test.ok(test.names(test.lst('Lst', '{prospect}')) = 'Lst Charlie', 'L4: status = prospect');
select test.ok(test.names(test.lst('Lst', null, test.id('thayne'))) = 'Lst Bravo', 'L5: community filter');
select test.ok(test.names(test.lst('Lst', null, null, test.id('catPlumb'))) = 'Lst Alpha,Lst Bravo', 'L6: category filter');
select test.ok(test.names(test.lst('Lst', null, null, null, 'enhanced')) = 'Lst Alpha', 'L7: tier = enhanced only for the live Enhanced listing');
select test.ok(test.names(test.lst('Lst', null, null, null, 'free')) = 'Lst 100% Under_score,Lst Bravo,Lst Charlie,Lst Echo', 'L8: tier = free is everyone else, including an expired-by-date "active" listing');
select test.ok(test.names(test.lst('Lst', null, null, null, null, 'interested')) = 'Lst Bravo', 'L9: lead stage filter');
select test.ok(test.names(test.lst('Lst', null, null, null, null, 'new')) = 'Lst 100% Under_score,Lst Alpha,Lst Charlie,Lst Echo', 'L10: no CRM row counts as stage "new"');
select test.ok(test.names(test.lst('Lst', null, null, null, null, null, true)) = 'Lst Alpha', 'L11: verified = true');
select test.ok(test.names(test.lst('Lst', null, null, null, null, null, false)) = 'Lst 100% Under_score,Lst Bravo,Lst Charlie,Lst Echo', 'L12: verified = false');
select test.ok(test.names(test.lst('555-0712')) = 'Lst Bravo', 'L13: search by phone digits');
select test.ok(test.names(test.lst('100%')) = 'Lst 100% Under_score', 'L14: % in the search is literal, not a wildcard');
select test.ok(test.names(test.lst('Lst%Alpha')) = '', 'L15: a wildcard cannot match across text');
select test.ok(test.names(test.lst('Under_score')) = 'Lst 100% Under_score' and test.names(test.lst('Under_scxre')) = '', 'L16: _ is literal too');
select test.ok(test.names(test.lst('Lst', null, null, null, null, null, null, 2, 0)) = 'Lst 100% Under_score,Lst Alpha' and test.names(test.lst('Lst', null, null, null, null, null, null, 2, 2)) = 'Lst Bravo,Lst Charlie', 'L17: paging is stable and complete');
select test.ok((test.lst('Lst', null, null, null, null, null, null, 2, 2)->>'total')::int = 5, 'L18: total ignores paging');
select test.ok(jsonb_array_length(test.lst('Lst', null, null, null, null, null, null, 100000, 0)->'rows') = 5 and jsonb_array_length(test.lst('Lst', null, null, null, null, null, null, -5, -9)->'rows') = 1, 'L19: limit is clamped to 1..100, negative offset to 0');
select test.ok(test.names(test.lst('''; drop table public.businesses; --')) = '', 'L20: hostile search text is just text');
select test.as_root();

select test.as_user(test.id('adminA'));  select test.ok((test.lst('Lst')->>'total')::int = 5, 'L21: admin may list');
select test.as_user(test.id('editorA')); select test.throws($$select test.lst('Lst')$$, 'L22: editor may NOT list (CRM data)', '42501');
select test.as_user(test.id('owner1'));  select test.throws($$select test.lst('Lst')$$, 'L23: owner cannot', '42501');
select test.as_user(test.id('adminB'));  select test.throws($$select test.lst('Lst')$$, 'L24: other tenant''s admin cannot', '42501');
select test.as_anon();                   select test.throws($$select test.lst('Lst')$$, 'L25: anon cannot', '42501');
select test.as_root();
-- tenant isolation of the data itself: tenant B's own admin, asking about tenant B, never sees tenant A's rows
select test.as_user(test.id('adminB'));
select test.ok(test.names(public.admin_list_businesses(test.id('tenantB'), 'Lst')) = '', 'L26: tenant B admin searching "Lst" in tenant B finds none of tenant A''s rows');
select test.ok((public.admin_list_businesses(test.id('tenantB'))->>'total')::int >= 1, 'L27: and does see tenant B''s own business');
select test.as_root();
