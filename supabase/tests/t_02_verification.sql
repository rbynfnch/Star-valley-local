-- Verification ladder: Unclaimed -> Green -> Gold, derived from owners + proofs. Uses biz3 / biz4; cleans up.
select test.ok((select verification_level from public.businesses where id = test.id('biz3')) = 'none', 'starts unverified');

-- direct writes are rejected for everyone (even superuser): level is derived only
select test.throws($$update public.businesses set verification_level = 'green', verified_at = now() where id = test.id('biz3')$$,
                   'cannot set verification directly', '42501');
select test.throws($$insert into public.businesses (tenant_id, slug, name, status, home_community_id, primary_category_id, verification_level, verified_at)
                      values (test.id('tenantA'), 'sneaky', 'Sneaky', 'unclaimed', test.id('afton'), test.id('catEat'), 'gold', now())$$,
                   'cannot insert a pre-verified business', '42501');

-- a proof with no owner is not verification
insert into public.verification_proofs (tenant_id, business_id, kind) values (test.id('tenantA'), test.id('biz3'), 'sms_code');
select test.ok((select verification_level from public.businesses where id = test.id('biz3')) = 'none', 'proof without an owner stays unverified');

-- claim: owner linked -> status claimed -> Green
insert into public.business_owners (business_id, tenant_id, user_id) values (test.id('biz3'), test.id('tenantA'), test.id('owner1'));
select test.ok((select status from public.businesses where id = test.id('biz3')) = 'claimed', 'adding an owner marks the business claimed');
select test.ok((select verification_level from public.businesses where id = test.id('biz3')) = 'green', 'owner + sms proof = Green');
select test.ok((select reverify_due_at from public.businesses where id = test.id('biz3')) between now() + interval '364 days' and now() + interval '366 days',
               're-verification due ~1 year out');

-- an additional Green-type proof alone never makes Gold
insert into public.verification_proofs (tenant_id, business_id, kind) values (test.id('tenantA'), test.id('biz3'), 'email_link');
select test.ok((select verification_level from public.businesses where id = test.id('biz3')) = 'green', 'email_link on top of sms_code is still Green');

-- Gold = Green + postcard | GBP | license
insert into public.verification_proofs (tenant_id, business_id, kind) values (test.id('tenantA'), test.id('biz3'), 'postcard');
select test.ok((select verification_level from public.businesses where id = test.id('biz3')) = 'gold', 'Green + postcard = Gold');

-- revoke the extra proof -> back to Green; revoke Green proofs -> none
update public.verification_proofs set revoked_at = now(), revoked_reason = 'test' where business_id = test.id('biz3') and kind = 'postcard';
select test.ok((select verification_level from public.businesses where id = test.id('biz3')) = 'green', 'revoking postcard drops Gold to Green');
update public.verification_proofs set revoked_at = now() where business_id = test.id('biz3') and kind in ('sms_code', 'email_link');
select test.ok((select verification_level from public.businesses where id = test.id('biz3')) = 'none', 'revoking all Green proofs drops to none');
select test.ok((select verified_at is null and reverify_due_at is null from public.businesses where id = test.id('biz3')), 're-verification date hidden when unverified');

-- Gold needs Green: postcard only (with owner) is not verified
select test.ok((select verification_level from public.businesses where id = test.id('biz3')) = 'none', 'postcard alone cannot be Gold');

-- losing the last owner un-claims and un-verifies
insert into public.verification_proofs (tenant_id, business_id, kind) values (test.id('tenantA'), test.id('biz3'), 'sms_code');
select test.ok((select verification_level from public.businesses where id = test.id('biz3')) = 'green', 'fresh Green proof restores Green');
delete from public.business_owners where business_id = test.id('biz3');
select test.ok((select status from public.businesses where id = test.id('biz3')) = 'unclaimed', 'removing last owner returns to unclaimed');
select test.ok((select verification_level from public.businesses where id = test.id('biz3')) = 'none', 'removing last owner clears verification');

-- prospects are not auto-published by an owner being attached
insert into public.business_owners (business_id, tenant_id, user_id) values (test.id('bizP'), test.id('tenantA'), test.id('owner2'));
select test.ok((select status from public.businesses where id = test.id('bizP')) = 'prospect', 'owner on a prospect does not publish it');
delete from public.business_owners where business_id = test.id('bizP');

-- proofs older than a year do not count
delete from public.verification_proofs where business_id = test.id('biz3');
insert into public.business_owners (business_id, tenant_id, user_id) values (test.id('biz4'), test.id('tenantA'), test.id('owner1'));
insert into public.verification_proofs (tenant_id, business_id, kind, verified_at)
  values (test.id('tenantA'), test.id('biz4'), 'sms_code', now() - interval '13 months');
select test.ok((select verification_level from public.businesses where id = test.id('biz4')) = 'none', 'a 13-month-old proof does not verify');

-- expiry job: age a valid proof past a year without triggers firing, then run the daily job
delete from public.verification_proofs where business_id = test.id('biz4');
insert into public.verification_proofs (tenant_id, business_id, kind) values (test.id('tenantA'), test.id('biz4'), 'sms_code');
select test.ok((select verification_level from public.businesses where id = test.id('biz4')) = 'green', 'biz4 Green before aging');
set session_replication_role = replica;
update public.verification_proofs set verified_at = now() - interval '400 days' where business_id = test.id('biz4');
update public.businesses set reverify_due_at = now() - interval '35 days' where id = test.id('biz4');
set session_replication_role = origin;
select test.ok(app.expire_verifications() = 1, 'expire job processes exactly the overdue business');
select test.ok((select verification_level from public.businesses where id = test.id('biz4')) = 'none', 'expiry downgrades to none');

-- cleanup
delete from public.business_owners where business_id = test.id('biz4');
delete from public.verification_proofs where business_id in (test.id('biz3'), test.id('biz4'));
