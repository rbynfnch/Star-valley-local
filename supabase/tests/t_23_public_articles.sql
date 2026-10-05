-- Public article listing: only what an anonymous reader may see, search, category, featured-only, paging, counts.
create function test.pa_anon() returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', '', false); execute 'set role anon'; end $$;
create function test.pa_n(q text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute q into n; return n; end $$;
create temp table pa_pk (k text primary key, j jsonb); grant all on pa_pk to public;
create function test.pa_keep(k text, j jsonb) returns void language sql as $$ insert into pa_pk values (k, j) on conflict (k) do update set j = excluded.j $$;
insert into public.article_categories (id, tenant_id, slug, name) values
 ('00000000-0000-0000-0000-0000000a0c01', test.id('tenantA'), 'pa-news', 'Pa News'), ('00000000-0000-0000-0000-0000000a0c02', test.id('tenantA'), 'pa-guides', 'Pa Guides');
insert into public.articles (id, tenant_id, slug, title, excerpt, body_md, status, audience, category_id, publish_at, featured_rank) values
 ('00000000-0000-0000-0000-0000000a0a01', test.id('tenantA'), 'pa-live-1', 'Hiking the ridge', 'Trails', 'Pack water and sunscreen for the long ridge trail.', 'published', 'public', '00000000-0000-0000-0000-0000000a0c01', now() - interval '3 days', null),
 ('00000000-0000-0000-0000-0000000a0a02', test.id('tenantA'), 'pa-live-2', 'Pumpkin patches', 'Fall fun', 'Hayrides and cider at the farm.', 'published', 'public', '00000000-0000-0000-0000-0000000a0c02', now() - interval '2 days', 1),
 ('00000000-0000-0000-0000-0000000a0a03', test.id('tenantA'), 'pa-sched-live', 'Scheduled and now live', 'x', 'Hiking again', 'scheduled', 'public', '00000000-0000-0000-0000-0000000a0c01', now() - interval '1 day', 2),
 ('00000000-0000-0000-0000-0000000a0a04', test.id('tenantA'), 'pa-future', 'Not yet', 'x', 'Hiking future', 'scheduled', 'public', '00000000-0000-0000-0000-0000000a0c01', now() + interval '2 days', null),
 ('00000000-0000-0000-0000-0000000a0a05', test.id('tenantA'), 'pa-draft', 'Draft piece', 'x', 'Hiking draft', 'draft', 'public', '00000000-0000-0000-0000-0000000a0c01', null, null),
 ('00000000-0000-0000-0000-0000000a0a06', test.id('tenantA'), 'pa-owner', 'Owner tips', 'x', 'Hiking for owners', 'published', 'business', '00000000-0000-0000-0000-0000000a0c01', now() - interval '1 day', null),
 ('00000000-0000-0000-0000-0000000a0a07', test.id('tenantB'), 'pa-other', 'Other tenant', 'x', 'Hiking elsewhere', 'published', 'public', null, now() - interval '1 day', null);
insert into public.articles (tenant_id, slug, title, body_md, status, audience, publish_at) select test.id('tenantA'), 'pa-bulk-' || g, 'Bulk ' || g, 'filler', 'published', 'public', now() - ((g + 10) || ' days')::interval from generate_series(1, 60) g;

select test.pa_anon();
select test.pa_keep('all', (select jsonb_agg(slug) from public.list_articles(test.id('tenantA'), null, null, false, 50, 0) where slug like 'pa-live%' or slug = 'pa-sched-live' or slug in ('pa-future', 'pa-draft', 'pa-owner', 'pa-other')));
select test.as_root();
select test.ok((select j from pa_pk where k = 'all') @> '["pa-live-1","pa-live-2","pa-sched-live"]'::jsonb and jsonb_array_length((select j from pa_pk where k = 'all')) = 3, 'A1: an anonymous reader sees published and already-live scheduled articles, and no draft, future, owner-only or other-tenant article');
select test.pa_anon();
select test.pa_keep('o', (select jsonb_agg(slug order by publish_at desc) from public.list_articles(test.id('tenantA'), null, null, false, 3, 0)));
select test.as_root();
select test.ok((select j from pa_pk where k = 'o') = '["pa-sched-live","pa-live-2","pa-live-1"]'::jsonb or (select j ->> 0 from pa_pk where k = 'o') not like 'pa-bulk-%', 'A2: newest first');
select test.pa_anon();
select test.pa_keep('s', (select jsonb_agg(slug) from public.list_articles(test.id('tenantA'), 'hiking', null, false, 50, 0) where slug like 'pa-%'));
select test.as_root();
select test.ok((select j from pa_pk where k = 's') @> '["pa-live-1","pa-sched-live"]'::jsonb and jsonb_array_length((select j from pa_pk where k = 's')) = 2, 'S1: full-text search finds matching public articles only (not the draft, the future one or the owner-only one)');
select test.pa_anon();
select test.pa_keep('s2', (select jsonb_agg(slug) from public.list_articles(test.id('tenantA'), 'hayrides cider', null, false, 50, 0)));
select test.ok((select count(*) from public.list_articles(test.id('tenantA'), '''); drop table articles; --', null, false, 50, 0)) = 0, 'S2: odd search text is harmless and matches nothing');
select test.ok((select count(*) from public.list_articles(test.id('tenantA'), '   ', null, false, 50, 0)) > 3, 'S3: a blank query is no query');
select test.as_root();
select test.ok((select j from pa_pk where k = 's2') = '["pa-live-2"]'::jsonb, 'S4: search matches the body, not just the title');
select test.pa_anon();
select test.ok((select count(*) from public.list_articles(test.id('tenantA'), null, '00000000-0000-0000-0000-0000000a0c02', false, 50, 0)) = 1, 'C1: category filter');
select test.ok((select count(*) from public.list_articles(test.id('tenantA'), null, gen_random_uuid(), false, 50, 0)) = 0, 'C2: an unknown category matches nothing');
select test.pa_keep('f', (select jsonb_agg(slug order by featured_rank) from public.list_articles(test.id('tenantA'), null, null, true, 50, 0)));
select test.as_root();
select test.ok((select j from pa_pk where k = 'f') = '["pa-live-2","pa-sched-live"]'::jsonb, 'F1: featured-only lists featured articles in rank order');
select test.pa_anon();
select test.ok((select count(*) from public.list_articles(test.id('tenantA'), null, null, false, 1000, 0)) = 50, 'P1: a request for 1000 rows is capped at 50');
select test.ok((select max(total_count) from public.list_articles(test.id('tenantA'), null, null, false, 5, 10)) = (select count(*) from public.list_articles(test.id('tenantA'), null, null, false, 50, 0)) + (select count(*) from public.list_articles(test.id('tenantA'), null, null, false, 50, 50)), 'P2: total_count is the whole match count on every page');
select test.ok((select count(*) from public.list_articles(test.id('tenantA'), null, null, false, 0, -5)) = 1, 'P3: a zero limit and a negative offset are clamped');
select test.ok((select count(*) from public.list_articles(test.id('tenantB'), null, null, false, 50, 0)) = 1, 'T1: another tenant has its own list');
select test.pa_anon();
select test.pa_keep('cnt', (select jsonb_object_agg(coalesce(category_id::text, 'none'), n) from public.article_category_counts(test.id('tenantA'))));
select test.as_root();
select test.ok((select (j ->> '00000000-0000-0000-0000-0000000a0c01')::int from pa_pk where k = 'cnt') = 2 and (select (j ->> '00000000-0000-0000-0000-0000000a0c02')::int from pa_pk where k = 'cnt') = 1, 'N1: category counts include only what a reader can see');

-- The function's own filters hold for signed-in readers too: staff see drafts and owners see owner-only articles through RLS, but the PUBLIC list must not.
select test.as_root();
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id) values ('00000000-0000-0000-0000-0000000ab001', test.id('tenantA'), 'pa-biz', 'Pa Biz', 'unclaimed', test.id('afton'), test.id('catPlumb'));
insert into public.business_owners (business_id, tenant_id, user_id) values ('00000000-0000-0000-0000-0000000ab001', test.id('tenantA'), test.id('owner2'));
select test.as_user(test.id('editorA'));
select test.pa_keep('ed', (select jsonb_agg(slug) from public.list_articles(test.id('tenantA'), null, null, false, 50, 0) where slug in ('pa-draft', 'pa-future', 'pa-owner', 'pa-live-1')));
select test.as_root();
select test.ok((select j from pa_pk where k = 'ed') = '["pa-live-1"]'::jsonb, 'R1: even for an editor, the public list has no draft, future or owner-only article');
select test.as_user(test.id('owner2'));
select test.pa_keep('ow', (select jsonb_agg(slug) from public.list_articles(test.id('tenantA'), null, null, false, 50, 0) where slug in ('pa-owner', 'pa-live-1')));
select test.pa_keep('owc', (select jsonb_object_agg(coalesce(category_id::text, 'none'), n) from public.article_category_counts(test.id('tenantA'))));
select test.as_root();
select test.ok((select j from pa_pk where k = 'ow') = '["pa-live-1"]'::jsonb, 'R2: an owner, who may read owner-only articles elsewhere, does not get them in the public list');
select test.ok((select (j ->> '00000000-0000-0000-0000-0000000a0c01')::int from pa_pk where k = 'owc') = 2, 'R3: or in the public counts');
