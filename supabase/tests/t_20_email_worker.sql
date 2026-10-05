-- Email worker contract: claim batch (enriched, leased), complete/fail/permanent fail, suppression intake, staff queue view, access.
create function test.ew_svc() returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', '', false); execute 'set role service_role'; end $$;
create temp table ew_pk (k text primary key, j jsonb); grant all on ew_pk to public;
create function test.keepj_ew(k text, j jsonb) returns void language sql as $$ insert into ew_pk values (k, j) on conflict (k) do update set j = excluded.j $$;
create function test.kj_ew(k text) returns jsonb language sql as $$ select j from ew_pk where ew_pk.k = $1 $$;
create function test.ew_id(k text) returns uuid language sql security definer as $$ select id from public.notifications where dedupe_key like k limit 1 $$;
create function test.ew_n(q text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute q into n; return n; end $$;
create function test.ew_msg(stmt text, pat text) returns boolean language plpgsql as $$ begin execute stmt; return false; exception when others then return sqlerrm like pat; end $$;
insert into public.tenant_domains (domain, tenant_id, is_primary) values ('ew.star-valley.test', test.id('tenantA'), true) on conflict do nothing;
insert into public.tenant_domains (domain, tenant_id, is_primary) values ('zzz.star-valley.test', test.id('tenantA'), false) on conflict do nothing;
update public.tenants set mailing_address = '1 Main St, Afton, WY 83110' where id = test.id('tenantA');
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id) values
 ('00000000-0000-0000-0000-00000000ee01', test.id('tenantA'), 'ew-one', 'Ew One', 'unclaimed', test.id('afton'), test.id('catPlumb')),
 ('00000000-0000-0000-0000-00000000ee02', test.id('tenantA'), 'ew-two', 'Ew Two', 'unclaimed', test.id('afton'), test.id('catPlumb')),
 ('00000000-0000-0000-0000-00000000ee03', test.id('tenantA'), 'ew-gone', 'Ew Gone', 'unclaimed', test.id('afton'), test.id('catPlumb'));
insert into public.business_owners (business_id, tenant_id, user_id) values
 ('00000000-0000-0000-0000-00000000ee01', test.id('tenantA'), test.id('owner1')),
 ('00000000-0000-0000-0000-00000000ee02', test.id('tenantA'), test.id('owner2')),
 ('00000000-0000-0000-0000-00000000ee03', test.id('tenantA'), test.id('owner1'));
update public.notifications set status = 'cancelled' where status in ('queued', 'sending', 'failed');          -- a clean queue
select app.enqueue_business_notification('00000000-0000-0000-0000-00000000ee01', 'listing_renewal_reminder', '{"ends_at":"2027-01-01T00:00:00Z"}', 'ew:1');
select app.enqueue_business_notification('00000000-0000-0000-0000-00000000ee02', 'placement_renewal_reminder', '{"ends_at":"2027-01-02T00:00:00Z"}', 'ew:2');
select app.enqueue_business_notification('00000000-0000-0000-0000-00000000ee03', 'listing_renewal_reminder', '{}', 'ew:3');
select app.enqueue_business_notification('00000000-0000-0000-0000-00000000ee01', 'verification_reminder', '{}', 'ew:later', now() + interval '1 day');
update public.businesses set status = 'archived' where id = '00000000-0000-0000-0000-00000000ee03';

-- ===== access
select test.as_user(test.id('adminA'));
select test.throws($$select public.email_claim_batch(5)$$, 'W1: even an admin cannot call the worker functions as a user', '42501');
select test.as_user(test.id('owner1'));
select test.throws($$select public.email_run_maintenance()$$, 'W2: an owner cannot run maintenance', '42501');
select test.throws($$select public.record_email_suppression(null, 'a@b.test', 'bounce')$$, 'W3: an owner cannot suppress addresses', '42501');
select test.as_root(); set role anon;
select test.throws($$select public.email_complete(gen_random_uuid())$$, 'W4: anon cannot complete', '42501');
select test.as_root();

-- ===== claim
select test.ew_svc();
select test.keepj_ew('b', public.email_claim_batch(10));
select test.as_root();
select test.ok(jsonb_array_length(test.kj_ew('b')) = 2, 'C1: two due emails claimed (the later-dated one waits; the archived business is skipped)');
select test.ok((test.kj_ew('b') -> 0 -> 'tenant' ->> 'domain') = 'ew.star-valley.test' and (test.kj_ew('b') -> 0 -> 'tenant' ->> 'mailing_address') like '1 Main St%' and (test.kj_ew('b') -> 0 -> 'business' ->> 'slug') is not null, 'C2: each carries the tenant (domain, address) and business it needs');
select test.ok((select status from public.notifications where dedupe_key like 'ew:3:%') = 'cancelled' and (select last_error from public.notifications where dedupe_key like 'ew:3:%') = 'business archived', 'C3: mail about an archived business is cancelled, not sent');
select test.ok((select count(*) from public.notifications where dedupe_key like 'ew:%' and status = 'sending' and attempts = 1 and locked_until > now()) = 2, 'C4: claimed rows are leased and counted as an attempt');
select test.ew_svc();
select test.ok(jsonb_array_length(public.email_claim_batch(10)) = 0, 'C5: a second worker gets nothing while the lease holds');
select test.throws($$select public.email_claim_batch(0)$$, 'C6: a zero limit is refused', '22023');
select test.throws($$select public.email_claim_batch(101)$$, 'C7: an oversized limit is refused', '22023');
select test.as_root();
update public.notifications set locked_until = now() - interval '1 minute' where dedupe_key like 'ew:1:%';
select test.ew_svc();
select test.ok(jsonb_array_length(public.email_claim_batch(10)) = 1, 'C8: a crashed worker''s expired lease is picked up again');
select test.as_root();
select test.ok((select attempts from public.notifications where dedupe_key like 'ew:1:%') = 2, 'C9: and counted as a second attempt');

-- ===== complete / fail
select test.ew_svc();
select public.email_complete(test.ew_id('ew:1:%'), 'pm-123');
select test.as_root();
select test.ok((select status || '|' || provider_message_id || '|' || (sent_at is not null)::text from public.notifications where dedupe_key like 'ew:1:%') = 'sent|pm-123|true', 'D1: complete marks it sent with the provider id');
select test.ew_svc();
select public.email_fail(test.ew_id('ew:2:%'), 'timeout');
select test.as_root();
select test.ok((select status || '|' || last_error from public.notifications where dedupe_key like 'ew:2:%') = 'queued|timeout' and (select next_attempt_at > now() from public.notifications where dedupe_key like 'ew:2:%'), 'D2: a transient failure requeues with backoff');
update public.notifications set next_attempt_at = now() where dedupe_key like 'ew:2:%';
select test.ew_svc();
select test.ok(jsonb_array_length(public.email_claim_batch(10)) = 1, 'D3: it is claimed again once the backoff passes');
select public.email_fail(test.ew_id('ew:2:%'), 'inactive recipient', true);
select test.as_root();
select test.ok((select status from public.notifications where dedupe_key like 'ew:2:%') = 'failed', 'D4: a permanent failure goes straight to failed');
update public.notifications set next_attempt_at = now() where dedupe_key like 'ew:2:%';
select test.ew_svc();
select test.ok(jsonb_array_length(public.email_claim_batch(10)) = 0, 'D5: and is never retried automatically');
select public.email_fail(test.ew_id('ew:2:%'), 'late', true);
select test.as_root();
select test.ok((select last_error from public.notifications where dedupe_key like 'ew:2:%') = 'inactive recipient', 'D6: a stale permanent-failure report does not overwrite a settled row');

-- ===== suppression intake
select test.ew_svc();
select public.record_email_suppression(test.id('tenantA'), '  Owner2@Example.test ', 'bounce');
select public.record_email_suppression(test.id('tenantA'), 'owner2@example.test', 'bounce');
select test.as_root();
select test.ok(test.ew_n('select count(*) from public.suppressions where lower(email) = ''owner2@example.test'' and audience is null and reason = ''bounce''') = 1, 'S1: a bounce is stored once, lower-cased, for all audiences (idempotent)');
select test.ok(app.transactional_blocked(test.id('tenantA'), 'OWNER2@example.test'), 'S2: and now blocks transactional mail too');
select test.ok(not app.transactional_blocked(test.id('tenantB'), 'owner2@example.test'), 'S3: other tenants are untouched when a tenant is named');
select app.enqueue_business_notification('00000000-0000-0000-0000-00000000ee02', 'verification_reminder', '{}', 'ew:s4');
select test.ew_svc();
select test.ok(jsonb_array_length(public.email_claim_batch(10)) = 0, 'S4: mail to a suppressed address is not claimed');
select test.as_root();
select test.ok((select status || '|' || last_error from public.notifications where dedupe_key like 'ew:s4:%') = 'cancelled|suppressed: bounce or complaint', 'S5: it is cancelled with the reason');
select app.enqueue_business_notification('00000000-0000-0000-0000-00000000ee01', 'verification_reminder', '{}', 'ew:s6');
select test.ew_svc();
select public.record_email_suppression(null, 'owner1@example.test', 'complaint');
select test.as_root();
select test.ok(test.ew_n('select count(*) from public.suppressions where lower(email) = ''owner1@example.test'' and reason = ''complaint''') = (select count(*) from public.tenants), 'S6: with no tenant named, every tenant suppresses the address');
select test.ok((select status from public.notifications where dedupe_key like 'ew:s6:%') = 'cancelled', 'S7: and anything queued for it is cancelled at once');
select test.ew_svc();
select public.record_email_suppression(test.id('tenantA'), 'unsub@example.test', 'unsubscribe', 'consumer');
select public.record_email_suppression(test.id('tenantA'), 'unsub@example.test', 'unsubscribe', 'consumer');
select test.as_root();
select test.ok(test.ew_n('select count(*) from public.suppressions where email = ''unsub@example.test'' and audience = ''consumer''') = 1 and not app.transactional_blocked(test.id('tenantA'), 'unsub@example.test'), 'S8: an audience unsubscribe is stored once and does not block service mail');
select test.ew_svc();
select public.record_email_suppression(test.id('tenantA'), 'owner2@example.test', 'unsubscribe');
select test.as_root();
select test.ok((select reason from public.suppressions where tenant_id = test.id('tenantA') and lower(email) = 'owner2@example.test' and audience is null) = 'bounce', 'S9: an unsubscribe never downgrades a bounce');
select test.ew_svc();
select test.throws($$select public.record_email_suppression(test.id('tenantA'), 'not-an-email', 'bounce')$$, 'S10: junk addresses are refused', '22023');
select test.throws($$select public.record_email_suppression(test.id('tenantA'), 'a@b.test', 'manual')$$, 'S11: only bounce, complaint and unsubscribe come from the provider', '22023');
select test.as_root();

-- ===== maintenance wrapper
select test.ew_svc();
select test.ok(public.email_run_maintenance() ? 'notifications_queued', 'M1: the maintenance wrapper runs the daily job and reports what it queued');
select test.as_root();

-- ===== staff queue view and retry
select test.as_user(test.id('editorA'));
select test.throws($$select public.admin_email_queue(test.id('tenantA'))$$, 'Q1: an editor cannot see the queue', '42501');
select test.as_user(test.id('adminB'));
select test.throws($$select public.admin_email_queue(test.id('tenantA'))$$, 'Q2: another tenant''s admin cannot see it', '42501');
select test.as_user(test.id('salesA'));
select test.keepj_ew('q', public.admin_email_queue(test.id('tenantA')));
select test.ok((test.kj_ew('q') -> 'counts' ->> 'failed')::int >= 1 and (test.kj_ew('q') -> 'rows' -> 0 ->> 'status') = 'failed', 'Q3: sales sees counts, with failed emails listed first');
select test.ok(not exists (select 1 from jsonb_array_elements(test.kj_ew('q') -> 'rows') r where r ->> 'id' is null), 'Q4: rows carry ids');
select public.retry_notification(test.id('tenantA'), test.ew_id('ew:2:%'));
select test.as_root();
select test.ok((select status || '|' || attempts from public.notifications where dedupe_key like 'ew:2:%') = 'queued|0', 'Q5: retry requeues a failed email with a fresh attempt count');
select test.as_user(test.id('salesA'));
select test.throws($$select public.retry_notification(test.id('tenantA'), test.ew_id('ew:2:%'))$$, 'Q6: only a failed email can be retried', '22023');
select test.throws($$select public.retry_notification(test.id('tenantB'), test.ew_id('ew:1:%'))$$, 'Q7: another tenant''s id cannot be used', '42501');
select test.as_root();
update public.notifications set status = 'failed' where dedupe_key like 'ew:2:%';
insert into public.tenant_staff (tenant_id, user_id, role) values (test.id('tenantB'), test.id('salesA'), 'sales');
select test.as_user(test.id('salesA'));
select test.ok(test.ew_msg($$select public.retry_notification(test.id('tenantB'), test.ew_id('ew:2:%'))$$, 'only a failed email%'), 'Q7a: it is refused as not retryable');
select test.as_root();
select test.ok((select status from public.notifications where dedupe_key like 'ew:2:%') = 'failed', 'Q7b: staff of two tenants cannot retry one tenant''s email through the other');
delete from public.tenant_staff where tenant_id = test.id('tenantB') and user_id = test.id('salesA');
select test.as_user(test.id('editorA'));
select test.throws($$select public.retry_notification(test.id('tenantA'), gen_random_uuid())$$, 'Q8: an editor cannot retry', '42501');
select test.as_root();
