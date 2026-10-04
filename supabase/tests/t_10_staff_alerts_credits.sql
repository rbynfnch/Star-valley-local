-- Staff alerts when nobody can be emailed; credits for paid placements ended early. Reuses test.mk/hp/gid helpers.
update public.placement_limits set max_slots = 50 where tenant_id = test.id('tenantA');
create function test.pay(b uuid, placement uuid, cents int) returns void language sql as $$
  insert into public.payments (tenant_id, business_id, channel, status, amount_cents, placement_id, marked_by, paid_at)
  values (test.id('tenantA'), b, 'manual', 'paid', cents, placement, test.id('adminA'), now()) $$;
create function test.end_grace(b uuid) returns void language plpgsql as $$
begin
  update public.verification_grace set started_at = now() - interval '15 days', ends_at = now() - interval '1 hour' where business_id = b and resolved_at is null;
  perform app.run_daily_maintenance();
end $$;

-- ===== S. staff alerts
insert into test.g select 's', test.mk('gs', true);
select test.hp(test.gid('s'));
delete from public.business_owners where business_id = test.gid('s');      -- no owner, no business email, no contact
select test.ok((select count(*) from public.verification_grace where business_id = test.gid('s') and resolved_at is null) = 1, 'S: grace opens');
select test.ok(test.nq(test.gid('s'), 'verification_lapsed') = 0, 'S: nothing sent to the business (nobody to send to)');
select test.ok((select count(*) from public.notifications where business_id = test.gid('s') and kind = 'staff_no_contact_alert') = 2, 'S: staff alerted: one email each to admin and sales');
select test.ok((select array_agg(recipient_email order by recipient_email) from public.notifications where business_id = test.gid('s') and kind = 'staff_no_contact_alert')
               = array['adminA@example.test', 'salesA@example.test'], 'S: to admin and sales only, not the editor');
select test.ok((select bool_and(payload ->> 'original_kind' = 'verification_lapsed' and payload ->> 'reason' = 'no_contact' and payload ->> 'business_name' is not null and (payload ->> 'ends_at') is not null)
                from public.notifications where business_id = test.gid('s') and kind = 'staff_no_contact_alert'), 'S: payload says what happened and when it ends');
select app.run_daily_maintenance(); select app.run_daily_maintenance();
select test.ok((select count(*) from public.notifications where business_id = test.gid('s') and kind = 'staff_no_contact_alert') = 2, 'S: re-running does not re-alert');
update public.verification_grace set ends_at = now() + interval '12 hours' where business_id = test.gid('s') and resolved_at is null;
select app.run_daily_maintenance();
select test.ok((select count(*) from public.notifications where business_id = test.gid('s') and kind = 'staff_no_contact_alert' and payload ->> 'original_kind' = 'featured_grace_reminder') = 2, 'S: the 1-day step alerts staff too');
select test.end_grace(test.gid('s'));
select test.ok((select count(*) from public.notifications where business_id = test.gid('s') and kind = 'staff_no_contact_alert' and payload ->> 'original_kind' = 'featured_ended_unverified') = 2, 'S: staff told when the placement ends');
-- a business that CAN be emailed never triggers staff alerts
insert into test.g select 's2', test.mk('gs2', true);
select test.hp(test.gid('s2')); select test.lapse(test.gid('s2'));
select test.ok(test.nq(test.gid('s2'), 'verification_lapsed') = 1 and not exists (select 1 from public.notifications where business_id = test.gid('s2') and kind = 'staff_no_contact_alert'),
               'S: reachable business: owner emailed, staff not alerted');
-- the staff-alert address block honours bounces like any other email
insert into public.suppressions (tenant_id, email, audience, reason) values (test.id('tenantA'), 'salesA@example.test', null, 'bounce');
update public.notifications set status = 'sent', sent_at = now() where status in ('queued', 'sending');
insert into test.g select 's3', test.mk('gs3', true);
select test.hp(test.gid('s3')); delete from public.business_owners where business_id = test.gid('s3');
select test.ok((select count(*) from app.claim_notifications(10)) = 1, 'S: a bounced staff address is skipped; the other staff address still gets it');
delete from public.suppressions where email = 'salesA@example.test';
update public.notifications set status = 'sent', sent_at = now() where status in ('queued', 'sending');

-- ===== C. credits for paid placements ended early
-- C1: 30-day paid placement, $49, ended 10 days in -> credit ~ 20/30 of $49
insert into test.g select 'c1', test.mk('gc1', true);
select test.hp(test.gid('c1'), 'paid', interval '20 days') as pid \gset
select test.pay(test.gid('c1'), :'pid'::uuid, 4900);
select test.lapse(test.gid('c1'));
select test.end_grace(test.gid('c1'));
select test.ok((select count(*) from public.account_credits where business_id = test.gid('c1')) = 1, 'C1: one credit created');
select test.ok((select amount_cents between 4600 and 4800 and status = 'available' and reason = 'verification_lapse' and placement_id = :'pid'::uuid from public.account_credits where business_id = test.gid('c1')),
               'C1: pro-rated for the unused part (about 20 of 21 days of $49)');
select test.ok((select (payload ->> 'credit_cents')::int = (select amount_cents from public.account_credits where business_id = test.gid('c1'))
                from public.notifications where business_id = test.gid('c1') and kind = 'featured_ended_unverified'), 'C1: the ended email tells the owner the credit amount');
select app.run_daily_maintenance();
select test.ok((select count(*) from public.account_credits where business_id = test.gid('c1')) = 1, 'C1: never credited twice');

-- C2: exact proration with controlled times: 30-day term, 10 days used
insert into test.g select 'c2', test.mk('gc2', true);
insert into public.placements (id, tenant_id, business_id, slot_type, start_at, end_at, source, status)
  values ('00000000-0000-0000-0000-0000000000d2', test.id('tenantA'), test.gid('c2'), 'homepage', now() - interval '10 days', now() + interval '20 days', 'paid', 'active');
select test.pay(test.gid('c2'), '00000000-0000-0000-0000-0000000000d2', 4900);
select test.lapse(test.gid('c2'));
select test.end_grace(test.gid('c2'));
select test.ok((select amount_cents between 3260 and 3267 from public.account_credits where business_id = test.gid('c2')), 'C2: $49 x 20/30 = $32.67 (got ' || (select amount_cents from public.account_credits where business_id = test.gid('c2'))::text || ' cents)');

-- C3: a placement that never started is credited in full and cancelled
insert into test.g select 'c3', test.mk('gc3', true);
insert into public.placements (id, tenant_id, business_id, slot_type, start_at, end_at, source, status)
  values ('00000000-0000-0000-0000-0000000000d3', test.id('tenantA'), test.gid('c3'), 'homepage', now() + interval '5 days', now() + interval '35 days', 'paid', 'active');
select test.pay(test.gid('c3'), '00000000-0000-0000-0000-0000000000d3', 4900);
select test.lapse(test.gid('c3'));
select test.end_grace(test.gid('c3'));
select test.ok((select amount_cents = 4900 from public.account_credits where business_id = test.gid('c3')), 'C3: unstarted placement credited in full');
select test.ok((select status = 'cancelled' from public.placements where id = '00000000-0000-0000-0000-0000000000d3'), 'C3: and cancelled');

-- C4: renewals: three monthly payments over a 90-day term, 30 days left -> one month back
insert into test.g select 'c4', test.mk('gc4', true);
update public.listings set starts_at = now() - interval '70 days' where business_id = test.gid('c4');     -- listing predates the placement
insert into public.placements (id, tenant_id, business_id, slot_type, start_at, end_at, source, status, auto_renews)
  values ('00000000-0000-0000-0000-0000000000d4', test.id('tenantA'), test.gid('c4'), 'homepage', now() - interval '60 days' + interval '1 hour', now() + interval '30 days', 'paid', 'active', true);
select test.pay(test.gid('c4'), '00000000-0000-0000-0000-0000000000d4', 4900); select test.pay(test.gid('c4'), '00000000-0000-0000-0000-0000000000d4', 4900); select test.pay(test.gid('c4'), '00000000-0000-0000-0000-0000000000d4', 4900);
select test.lapse(test.gid('c4'));
select test.end_grace(test.gid('c4'));
select test.ok((select amount_cents between 4890 and 4910 from public.account_credits where business_id = test.gid('c4')), 'C4: renewed placement (3 payments, 30 of 90 days left) credits about one month, $49');

-- C5: nothing to credit: comped, or paid with no payment record
insert into test.g select 'c5', test.mk('gc5', false);
select test.hp(test.gid('c5'), 'founding_member'); select test.lapse(test.gid('c5')); select test.end_grace(test.gid('c5'));
select test.ok(not exists (select 1 from public.account_credits where business_id = test.gid('c5')), 'C5: comped placement earns no credit');
insert into test.g select 'c6', test.mk('gc6', true);
select test.hp(test.gid('c6'), 'paid'); select test.lapse(test.gid('c6')); select test.end_grace(test.gid('c6'));
select test.ok(not exists (select 1 from public.account_credits where business_id = test.gid('c6')), 'C5: paid placement with no payment record earns none');
select test.ok((select bool_and(end_at <= now()) from public.placements where business_id = test.gid('c6')), 'C5: but it still ends');
-- unpaid payment rows do not count
insert into test.g select 'c7', test.mk('gc7', true);
select test.hp(test.gid('c7'), 'paid') as pid7 \gset
insert into public.payments (tenant_id, business_id, channel, status, amount_cents, placement_id) values (test.id('tenantA'), test.gid('c7'), 'stripe_payment_link', 'pending', 4900, :'pid7'::uuid);
select test.lapse(test.gid('c7')); select test.end_grace(test.gid('c7'));
select test.ok(not exists (select 1 from public.account_credits where business_id = test.gid('c7')), 'C5: a pending (unpaid) payment earns no credit');

-- C6: losing Enhanced (the business stopped paying) is NOT a verification lapse: no credit
insert into test.g select 'c8', test.mk('gc8', true);
select test.hp(test.gid('c8'), 'paid') as pid8 \gset
select test.pay(test.gid('c8'), :'pid8'::uuid, 4900);
update public.listings set status = 'cancelled' where business_id = test.gid('c8');
select test.ok(not exists (select 1 from public.account_credits where business_id = test.gid('c8')), 'C6: ending a placement because the listing was cancelled earns no credit');

-- C7: visibility and handling
select test.as_user(test.id('owner1'));
select test.ok(test.count($$select 1 from public.account_credits where business_id = test.gid('c1')$$) = 1, 'C7: owner sees their own credit');
update public.account_credits set status = 'applied' where business_id = test.gid('c1');          -- RLS: no update policy for owners
select test.as_root();
select test.ok((select status = 'available' from public.account_credits where business_id = test.gid('c1')), 'C7: owner cannot apply their own credit');
select test.as_user(test.id('salesA'));
update public.account_credits set status = 'void' where business_id = test.gid('c1');             -- sales may read, not change
select test.as_root();
select test.ok((select status = 'available' from public.account_credits where business_id = test.gid('c1')), 'C7: sales cannot void or apply credits (admin only)');
select test.as_user(test.id('owner1'));
select test.as_user(test.id('owner2'));
select test.ok(test.count($$select 1 from public.account_credits where business_id = test.gid('c1')$$) = 0, 'C7: other owners cannot see it');
select test.as_user(test.id('editorA'));
select test.ok(test.count('select 1 from public.account_credits') = 0, 'C7: editor cannot see credits');
select test.as_user(test.id('salesA'));
select test.ok(test.count('select 1 from public.account_credits') >= 4, 'C7: sales can see credits');
select test.as_user(test.id('adminB'));
select test.ok(test.count('select 1 from public.account_credits') = 0, 'C7: another tenant sees none');
select test.as_anon();
select test.throws('select * from public.account_credits', 'C7: anon denied', '42501');
select test.as_user(test.id('adminA'));
update public.account_credits set status = 'applied', applied_note = 'Applied to July invoice' where business_id = test.gid('c1');
select test.as_root();
select test.ok((select status = 'applied' and applied_at is not null from public.account_credits where business_id = test.gid('c1')), 'C7: admin marks a credit applied (timestamped)');
select test.throws($$update public.account_credits set amount_cents = 1 where business_id = test.gid('c1')$$, 'C7: the amount is immutable (audit trail)', '42501');

-- restore default inventory limits
update public.placement_limits set max_slots = case slot_type when 'homepage' then 6 when 'category' then 3 when 'community' then 4 else 6 end
 where tenant_id = test.id('tenantA');
