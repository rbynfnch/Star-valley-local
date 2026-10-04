-- Enhanced gating, quote requests, content visibility, tracking, hours, marketing guards.
-- biz1 (owner1) is the Enhanced business in this file; biz2 (owner2) stays Free.
insert into public.listings (tenant_id, business_id, tier, status, source) values (test.id('tenantA'), test.id('biz1'), 'enhanced', 'active', 'paid');
insert into public.business_services (tenant_id, business_id, name) values (test.id('tenantA'), test.id('biz1'), 'Water heaters'), (test.id('tenantA'), test.id('biz2'), 'Catering');
insert into public.business_links (tenant_id, business_id, kind, url) values (test.id('tenantA'), test.id('biz1'), 'facebook', 'https://facebook.com/mvp');
insert into public.business_faqs (tenant_id, business_id, question, answer) values (test.id('tenantA'), test.id('biz1'), 'Do you do emergencies?', 'Yes');

-- Enhanced-only content is invisible for Free listings
select test.as_anon();
select test.ok((select count(*) from public.business_services where business_id = test.id('biz1')) = 1, 'anon sees Enhanced services');
select test.ok((select count(*) from public.business_services where business_id = test.id('biz2')) = 0, 'anon does not see services on a Free listing');
select test.ok((select count(*) from public.business_faqs) = 1, 'FAQs only visible for Enhanced');
select test.as_user(test.id('owner2'));
select test.throws($$insert into public.business_services (tenant_id, business_id, name) values (test.id('tenantA'), test.id('biz2'), 'More')$$,
                   'Free owner cannot add services', '42501');
select test.throws($$insert into public.deals (tenant_id, business_id, title, status) values (test.id('tenantA'), test.id('biz2'), 'Deal', 'published')$$,
                   'Free owner cannot create deals', '42501');
select test.as_user(test.id('owner1'));
insert into public.business_services (tenant_id, business_id, name) values (test.id('tenantA'), test.id('biz1'), 'Drain cleaning');
insert into public.deals (tenant_id, business_id, title, status, starts_at, ends_at, discount_type, discount_value)
  values (test.id('tenantA'), test.id('biz1'), '20% off tune-up', 'published', now() - interval '1 day', now() + interval '30 days', 'percent', 20);
insert into public.deals (tenant_id, business_id, title, status, starts_at, ends_at)
  values (test.id('tenantA'), test.id('biz1'), 'Expired deal', 'published', now() - interval '30 days', now() - interval '1 day'),
         (test.id('tenantA'), test.id('biz1'), 'Draft deal', 'draft', now(), null);
select test.ok(test.count('select 1 from public.deals') = 3, 'owner sees all own deals');
select test.as_anon();
select test.ok(test.count('select 1 from public.deals') = 1, 'anon sees only the live published deal');

-- Request a Quote: only for public Enhanced listings
select test.throws($$insert into public.leads (tenant_id, business_id, name, email) values (test.id('tenantA'), test.id('biz2'), 'Sam', 'sam@example.test')$$,
                   'quote request to a Free listing is rejected', '42501');
select test.throws($$insert into public.leads (tenant_id, business_id, name, email) values (test.id('tenantA'), test.id('bizP'), 'Sam', 'sam@example.test')$$,
                   'quote request to a prospect is rejected', '42501');
select test.throws($$insert into public.leads (tenant_id, business_id, name, email) values (test.id('tenantB'), test.id('biz1'), 'Sam', 'sam@example.test')$$,
                   'quote request with mismatched tenant is rejected', '42501');
select test.throws($$insert into public.leads (tenant_id, business_id, name) values (test.id('tenantA'), test.id('biz1'), 'No Contact')$$,
                   'quote request needs an email or phone', '23514');
insert into public.leads (tenant_id, business_id, name, email, message) values (test.id('tenantA'), test.id('biz1'), 'Sam', 'sam@example.test', 'Water heater leak');
select test.throws('select * from public.leads', 'anon cannot read leads back', '42501');
select test.as_user(test.id('owner1'));
select test.ok(test.count('select 1 from public.leads') = 1, 'Enhanced owner receives the lead');
update public.leads set status = 'contacted' where business_id = test.id('biz1');
select test.ok((select status from public.leads limit 1) = 'contacted', 'owner can triage lead status');
select test.throws($$update public.leads set message = 'edited' where business_id = test.id('biz1')$$, 'owner cannot edit lead content (column grant)', '42501');
select test.as_user(test.id('owner2'));
select test.ok(test.count('select 1 from public.leads') = 0, 'other business owner cannot see the lead');

-- Articles: published/scheduled-by-time visible; drafts, future, and business-audience restricted
select test.as_root();
insert into public.articles (tenant_id, slug, title, status, publish_at, audience) values
  (test.id('tenantA'), 'pub',    'Published',          'published', now() - interval '1 day',  'public'),
  (test.id('tenantA'), 'sched',  'Scheduled, due',     'scheduled', now() - interval '1 hour', 'public'),
  (test.id('tenantA'), 'future', 'Scheduled, future',  'scheduled', now() + interval '1 day',  'public'),
  (test.id('tenantA'), 'draft',  'Draft',              'draft',     null,                      'public'),
  (test.id('tenantA'), 'owners', 'Marketing tips',     'published', now() - interval '1 day',  'business');
select test.throws($$insert into public.articles (tenant_id, slug, title, status) values (test.id('tenantA'), 'bad', 'Bad', 'published')$$, 'published article requires publish_at', '23514');
select test.as_anon();
select test.ok(test.count($$select 1 from public.articles where slug in ('pub','sched')$$) = 2, 'anon sees published and due-scheduled articles');
select test.ok(test.count($$select 1 from public.articles where slug in ('future','draft','owners')$$) = 0, 'anon does not see future, draft, or business-audience articles');
select test.as_user(test.id('consumer'));
select test.ok(test.count($$select 1 from public.articles where slug = 'owners'$$) = 0, 'consumer cannot see Elevartemis owner resources');
select test.as_user(test.id('owner1'));
select test.ok(test.count($$select 1 from public.articles where slug = 'owners'$$) = 1, 'business owner can see Marketing Resources');
select test.as_user(test.id('editorA'));
select test.ok(test.count($$select 1 from public.articles where slug in ('future','draft')$$) = 2, 'editor sees drafts and future articles');

-- Tracking: append-only, service-role ingest only
select test.as_root();
insert into public.tracking_events (tenant_id, event_type, business_id, search_query, surface) values
  (test.id('tenantA'), 'profile_view', test.id('biz1'), null, 'profile'),
  (test.id('tenantA'), 'phone_click', test.id('biz1'), null, 'profile'),
  (test.id('tenantA'), 'search_appearance', test.id('biz1'), 'plumber star valley', 'search');
select test.throws($$update public.tracking_events set event_type = 'phone_click'$$, 'tracking events cannot be updated', '42501');
select test.throws($$delete from public.tracking_events$$, 'tracking events cannot be deleted', '42501');
select test.throws($$insert into public.tracking_events (tenant_id, event_type) values (test.id('tenantA'), 'profile_view')$$, 'business events require a business', '23514');
select test.throws($$insert into public.tracking_events (tenant_id, event_type, business_id) values (test.id('tenantA'), 'profile_view', test.id('bizB'))$$, 'tracking cannot cross tenants', '23503');
select app.rollup_tracking(current_date);
select test.ok((select n from public.business_stats_daily where business_id = test.id('biz1') and event_type = 'phone_click') = 1, 'daily rollup counts events');
select test.as_user(test.id('owner1'));
select test.ok(test.count('select 1 from public.tracking_events') = 3, 'owner sees own business events');
select test.as_user(test.id('owner2'));
select test.ok(test.count('select 1 from public.tracking_events') = 0, 'other owner sees none');
select test.throws($$insert into public.tracking_events (tenant_id, event_type, business_id) values (test.id('tenantA'), 'profile_view', test.id('biz2'))$$, 'owners cannot write tracking', '42501');
select test.as_root();

-- Structured hours: ranges per day, no overlaps
insert into public.business_hours (tenant_id, business_id, day_of_week, opens, closes) values
  (test.id('tenantA'), test.id('biz1'), 1, '07:00', '12:00'), (test.id('tenantA'), test.id('biz1'), 1, '13:00', '17:00');
select test.throws($$insert into public.business_hours (tenant_id, business_id, day_of_week, opens, closes) values (test.id('tenantA'), test.id('biz1'), 1, '11:00', '14:00')$$,
                   'overlapping hours ranges rejected', '23P01');
select test.throws($$insert into public.business_hours (tenant_id, business_id, day_of_week, opens, closes) values (test.id('tenantA'), test.id('biz1'), 2, '17:00', '09:00')$$,
                   'closes must be after opens', '23514');

-- Multi-community service area + composite-FK tenant safety
insert into public.business_service_areas (tenant_id, business_id, community_id) values
  (test.id('tenantA'), test.id('biz1'), test.id('afton')), (test.id('tenantA'), test.id('biz1'), test.id('alpine'));
select test.throws($$insert into public.business_service_areas (tenant_id, business_id, community_id) values (test.id('tenantA'), test.id('biz1'), test.id('tcommB'))$$,
                   'service area cannot point at another tenant''s community', '23503');
select test.throws($$update public.businesses set home_community_id = null where id = test.id('biz1')$$, 'published business must keep a home community', '23514');

-- Business rules that must hold at the schema level
select test.ok(not exists (select 1 from information_schema.columns where table_schema = 'public'
                           and column_name in ('is_featured', 'rating', 'review_count', 'avg_rating', 'distance', 'distance_miles', 'is_open_now')),
               'no is_featured / rating / review / distance / open-now columns exist');
select test.ok(not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'listing_tier' and e.enumlabel = 'premium'), 'no Premium tier');

-- Email compliance helper + campaign approval invariant
insert into public.suppressions (tenant_id, email, audience, reason) values (test.id('tenantA'), 'Gone@Example.test', 'consumer', 'unsubscribe');
select test.ok(app.email_is_suppressed(test.id('tenantA'), 'gone@example.test', 'consumer'), 'suppression is case-insensitive');
select test.ok(not app.email_is_suppressed(test.id('tenantA'), 'gone@example.test', 'business'), 'consumer suppression does not block the business audience');
insert into public.suppressions (tenant_id, email, audience, reason) values (test.id('tenantA'), 'all@example.test', null, 'complaint');
select test.ok(app.email_is_suppressed(test.id('tenantA'), 'all@example.test', 'business') and app.email_is_suppressed(test.id('tenantA'), 'all@example.test', 'consumer'), 'null-audience suppression blocks both');
insert into public.campaigns (id, tenant_id, name) values ('00000000-0000-0000-0000-0000000000c1', test.id('tenantA'), 'Fall Home Services');
select test.throws($$insert into public.campaign_recipients (tenant_id, campaign_id, business_id, status) values (test.id('tenantA'), '00000000-0000-0000-0000-0000000000c1', test.id('biz1'), 'sent')$$,
                   'nothing is sent without admin approval', '23514');
insert into public.campaign_recipients (tenant_id, campaign_id, business_id, priority_score) values (test.id('tenantA'), '00000000-0000-0000-0000-0000000000c1', test.id('biz1'), 82.5);
select test.throws($$insert into public.social_posts (tenant_id, platform, body, status) values (test.id('tenantA'), 'facebook', 'hi', 'scheduled')$$, 'social posts need approval before scheduling', '23514');
select test.as_user(test.id('editorA'));
select test.throws($$insert into public.campaigns (tenant_id, name) values (test.id('tenantA'), 'x')$$, 'editor cannot create campaigns', '42501');
select test.as_user(test.id('salesA'));
select test.ok(test.count('select 1 from public.campaigns') = 1, 'sales can read campaigns');
select test.as_root();
