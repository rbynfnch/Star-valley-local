-- Verification-lapse grace period + email outbox. Reuses test.mk() from t_07 (business, owner1, Green proof, Enhanced listing).
update public.placement_limits set max_slots = 50 where tenant_id = test.id('tenantA');     -- keep inventory out of the way
create table test.g (k text primary key, id uuid not null); grant select on test.g to public;
create function test.gid(k text) returns uuid language sql stable as $$ select id from test.g where k = $1 $$;
create function test.hp(b uuid, src public.entitlement_source default 'paid', ends interval default interval '60 days') returns uuid language sql as $$
  insert into public.placements (tenant_id, business_id, slot_type, start_at, end_at, source, status)
  values (test.id('tenantA'), b, 'homepage', now() - interval '1 day', now() + ends, src, 'active') returning id $$;
create function test.lapse(b uuid) returns void language sql as $$
  update public.verification_proofs set revoked_at = now() where business_id = b and revoked_at is null $$;
create function test.nq(b uuid, k public.notification_kind) returns bigint language sql as $$
  select count(*) from public.notifications where business_id = b and kind = k and status <> 'cancelled' $$;
create function test.open_grace(b uuid) returns public.verification_grace language sql as $$
  select * from public.verification_grace where business_id = b and resolved_at is null $$;
create function test.slow(b uuid, due interval) returns void language plpgsql as $$   -- move reverify_due_at without triggers
begin set session_replication_role = replica; update public.businesses set reverify_due_at = now() + due where id = b; set session_replication_role = origin; end $$;

-- ===== A. lapse starts a grace period, placement stays live, owner is emailed
insert into test.g select 'a', test.mk('gra', true);
select test.hp(test.gid('a'));
select test.ok((select verification_level from public.businesses where id = test.gid('a')) = 'green', 'A: verified before lapse');
select test.lapse(test.gid('a'));
select test.ok((select verification_level from public.businesses where id = test.gid('a')) = 'none', 'A: lapsed to unverified');
select test.ok((select ends_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour' from test.open_grace(test.gid('a'))), 'A: grace period is 14 days');
select test.ok(test.nq(test.gid('a'), 'verification_lapsed') = 1, 'A: owner is emailed once when grace starts');
select test.ok((select recipient_email from public.notifications where business_id = test.gid('a') and kind = 'verification_lapsed') = 'owner1@example.test', 'A: email goes to the owner');
select test.ok((select (payload ->> 'grace_days')::int = 14 and jsonb_array_length(payload -> 'placements') = 1 from public.notifications where business_id = test.gid('a') and kind = 'verification_lapsed'), 'A: payload carries grace days and the placements at risk');
select test.ok(exists (select 1 from public.public_placements where business_id = test.gid('a')), 'A: placement stays live and public during grace');
select app.start_verification_grace(test.gid('a')); select app.start_verification_grace(test.gid('a'));
select test.ok((select count(*) from public.verification_grace where business_id = test.gid('a') and resolved_at is null) = 1, 'A: only one open grace period per business');
select test.ok(test.nq(test.gid('a'), 'verification_lapsed') = 1, 'A: no duplicate lapse email');

-- ===== B. re-verifying inside the window ends the grace period and cancels queued reminders
insert into public.verification_proofs (tenant_id, business_id, kind) values (test.id('tenantA'), test.gid('a'), 'sms_code');
select test.ok((select verification_level from public.businesses where id = test.gid('a')) = 'green', 'B: re-verified');
select test.ok((select resolution from public.verification_grace where business_id = test.gid('a')) = 'reverified', 'B: grace resolved as reverified');
select test.ok(test.nq(test.gid('a'), 'verification_lapsed') = 0, 'B: unsent lapse email is cancelled');
select test.ok(exists (select 1 from public.public_placements where business_id = test.gid('a')), 'B: placement continues');

-- ===== C. the reminder ladder, then the end of grace ends the placement
insert into test.g select 'c', test.mk('grc', true);
select test.hp(test.gid('c'));
select test.lapse(test.gid('c'));
update public.verification_grace set ends_at = now() + interval '10 days' where business_id = test.gid('c') and resolved_at is null;
select app.run_daily_maintenance();
select test.ok(test.nq(test.gid('c'), 'featured_grace_reminder') = 0, 'C: no reminder 10 days out');
update public.verification_grace set ends_at = now() + interval '6 days' where business_id = test.gid('c') and resolved_at is null;
select app.run_daily_maintenance();
select test.ok((select count(*) from public.notifications where business_id = test.gid('c') and kind = 'featured_grace_reminder' and (payload ->> 'days_left')::int = 7) = 1, 'C: 7-day reminder at 6 days left');
select app.run_daily_maintenance(); select app.run_daily_maintenance();
select test.ok(test.nq(test.gid('c'), 'featured_grace_reminder') = 1, 'C: re-running the job never duplicates');
update public.verification_grace set ends_at = now() + interval '12 hours' where business_id = test.gid('c') and resolved_at is null;
select app.run_daily_maintenance();
select test.ok((select count(*) from public.notifications where business_id = test.gid('c') and kind = 'featured_grace_reminder' and (payload ->> 'days_left')::int = 1) = 1, 'C: 1-day reminder with 12 hours left');
select test.ok(test.nq(test.gid('c'), 'featured_grace_reminder') = 2, 'C: exactly two reminders in total');
select test.ok(exists (select 1 from public.public_placements where business_id = test.gid('c')), 'C: still live before the deadline');
update public.verification_grace set started_at = now() - interval '15 days', ends_at = now() - interval '1 hour' where business_id = test.gid('c') and resolved_at is null;
select app.run_daily_maintenance();
select test.ok((select bool_and(end_at <= now()) from public.placements where business_id = test.gid('c')), 'C: placement ended at the deadline');
select test.ok(not exists (select 1 from public.public_placements where business_id = test.gid('c')), 'C: no longer public');
select test.ok((select resolution from public.verification_grace where business_id = test.gid('c')) = 'ended', 'C: grace resolved as ended');
select test.ok(test.nq(test.gid('c'), 'featured_ended_unverified') = 1, 'C: owner told the placement ended');
select test.ok((select (payload ->> 'placements_ended')::int from public.notifications where business_id = test.gid('c') and kind = 'featured_ended_unverified') = 1, 'C: payload says how many placements ended');
select app.run_daily_maintenance();
select test.ok(test.nq(test.gid('c'), 'featured_ended_unverified') = 1, 'C: ending is idempotent');

-- ===== D. comped placements end too (verification applies to every source), and need no Enhanced listing
insert into test.g select 'd', test.mk('grd', false);
select test.hp(test.gid('d'), 'founding_member');
select test.lapse(test.gid('d'));
select test.ok((select count(*) from public.verification_grace where business_id = test.gid('d') and resolved_at is null) = 1, 'D: comped placement also gets a grace period');
update public.verification_grace set started_at = now() - interval '15 days', ends_at = now() - interval '1 minute' where business_id = test.gid('d') and resolved_at is null;
select app.run_daily_maintenance();
select test.ok((select bool_and(end_at <= now()) from public.placements where business_id = test.gid('d')), 'D: comped placement ended at the deadline');

-- ===== E. nothing Featured, nothing at risk
insert into test.g select 'e', test.mk('gre', true);
select test.lapse(test.gid('e'));
select test.ok(not exists (select 1 from public.verification_grace where business_id = test.gid('e')), 'E: no grace period without a placement');
select test.ok(test.nq(test.gid('e'), 'verification_lapsed') = 0, 'E: no email without a placement');

-- ===== F. owner removed: grace + email falls back to the business email so a lapse is never silent
insert into test.g select 'f', test.mk('grf', true);
select test.hp(test.gid('f'));
update public.businesses set email = 'info@grf.example' where id = test.gid('f');
delete from public.business_owners where business_id = test.gid('f');
select test.ok((select count(*) from public.verification_grace where business_id = test.gid('f') and resolved_at is null) = 1, 'F: removing the last owner starts grace');
select test.ok((select recipient_email from public.notifications where business_id = test.gid('f') and kind = 'verification_lapsed') = 'info@grf.example', 'F: falls back to the business email');
insert into test.g select 'f2', test.mk('grf2', true);
select test.hp(test.gid('f2'));
delete from public.business_owners where business_id = test.gid('f2');
select test.ok((select count(*) from public.verification_grace where business_id = test.gid('f2')) = 1 and test.nq(test.gid('f2'), 'verification_lapsed') = 0,
               'F: with no owner and no email there is nobody to email, but the grace is visible to staff');

-- ===== G. the grace length is per-tenant
update public.tenant_policies set verification_grace_days = 3 where tenant_id = test.id('tenantA');
insert into test.g select 'g', test.mk('grg', true);
select test.hp(test.gid('g')); select test.lapse(test.gid('g'));
select test.ok((select ends_at < now() + interval '3 days 1 hour' from test.open_grace(test.gid('g'))), 'G: tenant policy sets a 3-day grace');
update public.tenant_policies set verification_grace_days = 14 where tenant_id = test.id('tenantA');

-- ===== H. the 1-year expiry flows end to end through the daily job
insert into test.g select 'h', test.mk('grh', true);
select test.hp(test.gid('h'));
set session_replication_role = replica;
update public.verification_proofs set verified_at = now() - interval '400 days' where business_id = test.gid('h');
update public.businesses set reverify_due_at = now() - interval '35 days' where id = test.gid('h');
set session_replication_role = origin;
select test.ok((select (app.run_daily_maintenance() ->> 'verifications_expired')::int >= 1), 'H: daily job expires the stale verification');
select test.ok((select verification_level from public.businesses where id = test.gid('h')) = 'none', 'H: business is now unverified');
select test.ok((select count(*) from public.verification_grace where business_id = test.gid('h') and resolved_at is null) = 1, 'H: expiry started a grace period');
select test.ok(test.nq(test.gid('h'), 'verification_lapsed') = 1, 'H: and queued the lapse email');

-- ===== I. annual re-verification reminders at 30 / 14 / 7 days before the due date, any verified business
insert into test.g select 'i', test.mk('gri', false);
select app.run_daily_maintenance();
select test.ok(test.nq(test.gid('i'), 'verification_reminder') = 0, 'I: nothing a year out');
select test.slow(test.gid('i'), interval '20 days');
select app.run_daily_maintenance();
select test.ok((select count(*) from public.notifications where business_id = test.gid('i') and kind = 'verification_reminder' and (payload ->> 'days_left')::int = 30) = 1, 'I: 30-day reminder at 20 days out');
select app.run_daily_maintenance();
select test.ok(test.nq(test.gid('i'), 'verification_reminder') = 1, 'I: not duplicated on re-run');
select test.slow(test.gid('i'), interval '10 days');
select app.run_daily_maintenance();
select test.ok((select count(*) from public.notifications where business_id = test.gid('i') and kind = 'verification_reminder' and (payload ->> 'days_left')::int = 14) = 1, 'I: 14-day reminder at 10 days out');
select test.slow(test.gid('i'), interval '5 days');
select app.run_daily_maintenance();
select test.ok((select count(*) from public.notifications where business_id = test.gid('i') and kind = 'verification_reminder' and (payload ->> 'days_left')::int = 7) = 1, 'I: 7-day reminder at 5 days out');
select test.ok(test.nq(test.gid('i'), 'verification_reminder') = 3, 'I: three reminders in total, one per step');
-- a late first run (the job was down) sends only the step nearest the deadline, not a burst
insert into test.g select 'i2', test.mk('gri2', false);
select test.slow(test.gid('i2'), interval '3 days');
select app.run_daily_maintenance();
select test.ok(test.nq(test.gid('i2'), 'verification_reminder') = 1 and (select (payload ->> 'days_left')::int from public.notifications where business_id = test.gid('i2') and kind = 'verification_reminder') = 7,
               'I: a late run sends one reminder (the nearest step), not three');

-- ===== J. 14-day renewal reminders: fixed-term placements and non-subscription listings only
insert into test.g select 'j', test.mk('grj', true);
insert into public.placements (tenant_id, business_id, slot_type, start_at, end_at, source, status)
  values (test.id('tenantA'), test.gid('j'), 'homepage', now() - interval '5 days', now() + interval '10 days', 'paid', 'active');
select app.run_daily_maintenance();
select test.ok(test.nq(test.gid('j'), 'placement_renewal_reminder') = 1, 'J: placement ending in 10 days gets a renewal reminder');
select test.ok((select renewal_reminder_sent_at is not null from public.placements where business_id = test.gid('j')), 'J: reminder recorded on the placement');
select app.run_daily_maintenance();
select test.ok(test.nq(test.gid('j'), 'placement_renewal_reminder') = 1, 'J: sent once');
update public.placements set end_at = now() + interval '40 days' where business_id = test.gid('j');
select test.ok((select renewal_reminder_sent_at is null from public.placements where business_id = test.gid('j')), 'J: extending the placement re-arms the reminder');
select test.ok(test.nq(test.gid('a'), 'placement_renewal_reminder') = 0, 'J: a placement 60 days out gets none');
-- listings: any fixed-term listing is reminded (comped OR a prepaid one-off); a recurring subscription is not
insert into test.g select 'k1', test.mk('grk1', true);
insert into test.g select 'k2', test.mk('grk2', true);
insert into test.g select 'k3', test.mk('grk3', true);
update public.listings set source = 'founding_member', ends_at = now() + interval '10 days' where business_id = test.gid('k1');
update public.listings set ends_at = now() + interval '10 days' where business_id = test.gid('k2');                          -- paid, fixed term
update public.listings set ends_at = now() + interval '10 days', auto_renews = true where business_id = test.gid('k3');     -- paid subscription
select app.run_daily_maintenance();
select test.ok(test.nq(test.gid('k1'), 'listing_renewal_reminder') = 1, 'J: comped fixed-term listing gets a renewal reminder');
select test.ok(test.nq(test.gid('k2'), 'listing_renewal_reminder') = 1, 'J: prepaid fixed-term listing gets one too');
select test.ok(test.nq(test.gid('k3'), 'listing_renewal_reminder') = 0, 'J: a recurring subscription does not (Stripe renews it and sends its own emails)');
-- a monthly Featured subscription would otherwise be reminded every month
insert into test.g select 'k4', test.mk('grk4', true);
insert into public.placements (tenant_id, business_id, slot_type, start_at, end_at, source, status, auto_renews)
  values (test.id('tenantA'), test.gid('k4'), 'homepage', now() - interval '5 days', now() + interval '10 days', 'paid', 'active', true);
select app.run_daily_maintenance();
select test.ok(test.nq(test.gid('k4'), 'placement_renewal_reminder') = 0, 'J: auto-renewing placement gets no renewal reminder');

-- ===== K. outbox: claim / send / retry / lease / dedupe
update public.notifications set status = 'sent', sent_at = now() where status in ('queued', 'sending', 'failed');   -- clean slate
insert into test.g select 'o', test.mk('gro', false);
select app.enqueue_business_notification(test.gid('o'), 'verification_reminder', '{"n":1}', 'ob1');
select app.enqueue_business_notification(test.gid('o'), 'verification_reminder', '{"n":2}', 'ob2');
select app.enqueue_business_notification(test.gid('o'), 'verification_reminder', '{"n":3}', 'ob3');
select test.ok(app.enqueue_business_notification(test.gid('o'), 'verification_reminder', '{"n":1}', 'ob1') = 0, 'K: enqueue is idempotent on dedupe key');
select test.ok((select count(*) from app.claim_notifications(2)) = 2, 'K: worker claims two');
select test.ok((select count(*) from public.notifications where status = 'sending' and attempts = 1 and locked_until > now()) = 2, 'K: claimed rows are leased and counted');
select test.ok((select count(*) from app.claim_notifications(5)) = 1, 'K: a second worker gets only the unclaimed one');
select test.ok((select count(*) from app.claim_notifications(5)) = 0, 'K: nothing left while leases are held');
create temp table k as select id from public.notifications where status = 'sending' order by dedupe_key;
select app.complete_notification((select id from k limit 1), 'provider-123');
select test.ok((select status = 'sent' and provider_message_id = 'provider-123' and sent_at is not null from public.notifications where id = (select id from k limit 1)), 'K: complete records provider id and time');
select app.fail_notification((select id from k offset 1 limit 1), 'smtp timeout');
select test.ok((select status = 'queued' and next_attempt_at > now() and last_error = 'smtp timeout' from public.notifications where id = (select id from k offset 1 limit 1)), 'K: failure retries later with backoff');
select test.ok((select count(*) from app.claim_notifications(5)) = 0, 'K: backed-off row is not claimed yet');
-- a crashed worker: lease expired -> reclaimed
update public.notifications set locked_until = now() - interval '1 minute' where id = (select id from k offset 2 limit 1);
select test.ok((select count(*) from app.claim_notifications(5)) = 1, 'K: expired lease is reclaimed');
select test.ok((select attempts = 2 from public.notifications where id = (select id from k offset 2 limit 1)), 'K: attempt count increments on reclaim');
-- permanent failure after 5 attempts
update public.notifications set attempts = 5, status = 'sending' where id = (select id from k offset 2 limit 1);
select app.fail_notification((select id from k offset 2 limit 1), 'mailbox does not exist');
select test.ok((select status = 'failed' from public.notifications where id = (select id from k offset 2 limit 1)), 'K: fifth failure is permanent and visible to staff');

-- ===== L. suppression: unsubscribe does not block service mail; bounce/complaint does
update public.notifications set status = 'sent', sent_at = now() where status in ('queued', 'sending');
insert into public.suppressions (tenant_id, email, audience, reason) values (test.id('tenantA'), 'owner1@example.test', 'consumer', 'unsubscribe');
select app.enqueue_business_notification(test.gid('o'), 'verification_reminder', '{}', 'sup1');
select test.ok((select count(*) from app.claim_notifications(5)) = 1, 'L: a marketing unsubscribe does not block a transactional email');
update public.notifications set status = 'sent', sent_at = now() where status = 'sending';
insert into public.suppressions (tenant_id, email, audience, reason) values (test.id('tenantA'), 'owner1@example.test', null, 'bounce');
select app.enqueue_business_notification(test.gid('o'), 'verification_reminder', '{}', 'sup2');
select test.ok((select count(*) from app.claim_notifications(5)) = 0, 'L: a hard bounce blocks it');
select test.ok((select status = 'cancelled' and last_error like 'suppressed%' from public.notifications where dedupe_key like 'sup2:%'), 'L: and the row says why');
delete from public.suppressions where email = 'owner1@example.test';

-- ===== M. who may see or call what
select test.as_anon();
select test.throws('select * from public.notifications', 'M: anon cannot read notifications', '42501');
select test.throws('select * from public.verification_grace', 'M: anon cannot read grace periods', '42501');
select test.throws('select * from public.featured_at_risk', 'M: anon cannot read the at-risk view', '42501');
select test.throws('select * from app.claim_notifications(1)', 'M: anon cannot call the worker functions', '42501');
select test.as_user(test.id('owner1'));
select test.throws('select * from app.claim_notifications(1)', 'M: signed-in users cannot call the worker functions', '42501');
select test.throws('select app.run_daily_maintenance()', 'M: nor the daily job', '42501');
select test.ok(test.count('select 1 from public.notifications') = 0, 'M: owner cannot read the outbox');
select test.ok(test.count($$select 1 from public.verification_grace where business_id = test.gid('c')$$) = 1, 'M: owner can see their own business''s grace state');
select test.throws($$insert into public.verification_grace (tenant_id, business_id, ends_at) values (test.id('tenantA'), test.gid('c'), now())$$, 'M: owner cannot create a grace period', '42501');
select test.throws($$update public.notifications set status = 'sent'$$, 'M: owner cannot touch the outbox', '42501');
select test.as_user(test.id('owner2'));
select test.ok(test.count($$select 1 from public.verification_grace where business_id = test.gid('c')$$) = 0, 'M: another owner cannot see it');
select test.as_user(test.id('salesA'));
select test.ok(test.count('select 1 from public.featured_at_risk') >= 1, 'M: sales see Featured businesses at risk');
select test.ok(test.count($$select 1 from public.featured_at_risk where days_left between 0 and 14$$) = test.count('select 1 from public.featured_at_risk'), 'M: days_left is within the window');
select test.ok(test.count('select 1 from public.notifications') = 0, 'M: sales cannot read the outbox (admin audit only)');
update public.tenant_policies set verification_grace_days = 1 where tenant_id = test.id('tenantA');
select test.as_root();
select test.ok((select verification_grace_days from public.tenant_policies where tenant_id = test.id('tenantA')) = 14, 'M: sales cannot change tenant policy');
select test.as_user(test.id('adminA'));
select test.ok(test.count('select 1 from public.notifications') > 0, 'M: admin can audit the outbox');
update public.tenant_policies set renewal_reminder_days = 21 where tenant_id = test.id('tenantA');
select test.throws($$update public.tenant_policies set tenant_id = test.id('tenantB')$$, 'M: policy tenant_id is immutable', '42501');
select test.as_user(test.id('adminB'));
select test.ok(test.count($$select 1 from public.notifications where tenant_id = test.id('tenantA')$$) = 0, 'M: another tenant''s admin sees none of it');
select test.ok(test.count($$select 1 from public.featured_at_risk where tenant_id = test.id('tenantA')$$) = 0, 'M: nor the at-risk view');
update public.tenant_policies set renewal_reminder_days = 99 where tenant_id = test.id('tenantA');
select test.as_root();
select test.ok((select renewal_reminder_days from public.tenant_policies where tenant_id = test.id('tenantA')) = 21, 'M: another tenant''s admin cannot change policy');
update public.tenant_policies set renewal_reminder_days = 14 where tenant_id = test.id('tenantA');
select test.ok((select count(*) from public.tenant_policies) = 2, 'M: every tenant has a policy row');

-- restore the default inventory limits this file relaxed (suites share one database)
update public.placement_limits set max_slots = case slot_type when 'homepage' then 6 when 'category' then 3 when 'community' then 4 else 6 end
 where tenant_id = test.id('tenantA');
