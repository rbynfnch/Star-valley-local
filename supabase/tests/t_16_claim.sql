-- Claim + verify: secrets hashed, limits, expiry, attempts, races, access. Run as service_role like the server does.
create function test.as_service() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', false); execute 'set role service_role'; end $$;
grant execute on function test.as_service() to public;

insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone, email) values
 ('00000000-0000-0000-0000-0000000000c1', test.id('tenantA'), 'clm-one',   'Clm One',   'unclaimed', test.id('afton'), test.id('catPlumb'), '307-555-0601', 'owner@clm.example'),
 ('00000000-0000-0000-0000-0000000000c2', test.id('tenantA'), 'clm-nophone','Clm NoPhone','unclaimed', test.id('afton'), test.id('catPlumb'), null, null),
 ('00000000-0000-0000-0000-0000000000c3', test.id('tenantA'), 'clm-prospect','Clm Prospect','prospect', null, null, '307-555-0603', null),
 ('00000000-0000-0000-0000-0000000000c4', test.id('tenantA'), 'clm-two',   'Clm Two',   'unclaimed', test.id('afton'), test.id('catPlumb'), '307-555-0604', null),
 ('00000000-0000-0000-0000-0000000000c5', test.id('tenantA'), 'clm-badphone','Clm BadPhone','unclaimed', test.id('afton'), test.id('catPlumb'), '555-0605', null);
create function test.cs(b uuid, u text, m public.claim_method default 'sms_code') returns jsonb language sql as $$ select public.claim_start(test.id('tenantA'), b, test.id(u), m) $$;
create function test.cv(c uuid, u text, s text) returns jsonb language sql as $$ select public.claim_verify(c, test.id(u), s) $$;
create function test.age(b uuid) returns void language sql security definer as $$ update public.claims set created_at = created_at - interval '2 minutes' where business_id = b $$;
create function test.age_hours(b uuid) returns void language sql security definer as $$ update public.claims set created_at = created_at - interval '2 hours' where business_id = b $$;
create temp table cc (k text primary key, j jsonb); grant all on cc to public;
create function test.keep(k text, j jsonb) returns void language sql as $$ insert into cc values (k, j) on conflict (k) do update set j = excluded.j $$;
create function test.k(k text, f text) returns text language sql as $$ select j->>f from cc where cc.k = $1 $$;

select test.as_service();
select test.keep('a', test.cs('00000000-0000-0000-0000-0000000000c1', 'owner1'));
select test.ok(test.k('a', 'secret') ~ '^[0-9]{6}$' and test.k('a', 'destination') = '+13075550601', 'C1: a 6-digit code, sent to the number on file (not caller-supplied)');
select test.as_root();
select test.ok((select token_hash from public.claims where id = test.k('a', 'claim_id')::uuid) ~ '^[0-9a-f]{64}$'
               and not exists (select 1 from public.claims where token_hash = test.k('a', 'secret') or destination = test.k('a', 'secret')), 'C2: only a SHA-256 hash is stored, never the code');
select test.ok((select expires_at from public.claims where id = test.k('a', 'claim_id')::uuid) between now() + interval '9 minutes' and now() + interval '11 minutes', 'C3: a code lasts 10 minutes');
select test.as_service();
select test.keep('w', test.cv(test.k('a', 'claim_id')::uuid, 'owner1', '000000x'));
select test.ok(test.k('w', 'result') = 'wrong' and test.k('w', 'attempts_left') = '4', 'C4: a wrong code is "wrong" with 4 attempts left');
select test.ok(test.cv(test.k('a', 'claim_id')::uuid, 'owner1', 'abc')->>'result' = 'wrong', 'C5: junk input is just wrong, never an error');
select test.throws($$select test.cv(test.k('a', 'claim_id')::uuid, 'owner2', 'x')$$, 'C6: another user cannot use someone else''s claim', 'P0002');
select test.keep('v', test.cv(test.k('a', 'claim_id')::uuid, 'owner1', '  ' || test.k('a', 'secret') || ' '));
select test.as_root();
select test.ok(test.k('v', 'result') = 'verified' and test.k('v', 'level') = 'green', 'C7: the right code (spaces trimmed) verifies and the business is Green');
select test.ok((select status from public.businesses where id = '00000000-0000-0000-0000-0000000000c1') = 'claimed'
               and (select count(*) from public.business_owners where business_id = '00000000-0000-0000-0000-0000000000c1' and user_id = test.id('owner1')) = 1, 'C8: the claimant is the owner and the business is "claimed"');
select test.ok((select kind from public.verification_proofs where business_id = '00000000-0000-0000-0000-0000000000c1') = 'sms_code'
               and (select claim_id from public.verification_proofs where business_id = '00000000-0000-0000-0000-0000000000c1') = test.k('a', 'claim_id')::uuid, 'C9: an sms_code proof is recorded against the claim');
select test.ok((select evidence from public.verification_proofs where business_id = '00000000-0000-0000-0000-0000000000c1') = '{"destination_last4": "0601"}'::jsonb, 'C10: the proof keeps only the last 4 digits of the phone');
select test.ok((select reverify_due_at from public.businesses where id = '00000000-0000-0000-0000-0000000000c1') between now() + interval '364 days' and now() + interval '366 days', 'C11: re-verification is due in a year');
select test.ok(exists (select 1 from public.communications where business_id = '00000000-0000-0000-0000-0000000000c1' and subject = 'Claimed by the owner' and body like '%owner1@example.test%'), 'C12: the CRM log records the claim');
select test.as_service();
select test.ok(test.cv(test.k('a', 'claim_id')::uuid, 'owner1', test.k('a', 'secret'))->>'already' = 'true', 'C13: verifying again is harmless (already verified)');
select test.as_root();
select test.ok((select count(*) from public.business_owners where business_id = '00000000-0000-0000-0000-0000000000c1') = 1 and (select count(*) from public.verification_proofs where business_id = '00000000-0000-0000-0000-0000000000c1') = 1, 'C14: no duplicate owner or proof');

-- cannot claim what is already claimed / not public / has no phone / has an unusable phone
select test.as_service();
select test.throws($$select test.cs('00000000-0000-0000-0000-0000000000c1', 'owner2')$$, 'C15: an already-claimed business cannot be claimed again', '22023');
select test.throws($$select test.cs('00000000-0000-0000-0000-0000000000c3', 'owner2')$$, 'C16: a prospect (not public) looks like it does not exist', 'P0002');
select test.throws($$select test.cs('00000000-0000-0000-0000-0000000000c2', 'owner2')$$, 'C17: no phone on file: cannot text a code', '22023');
select test.throws($$select test.cs('00000000-0000-0000-0000-0000000000c5', 'owner2')$$, 'C18: a 7-digit number is not textable', '22023');
select test.throws($$select test.cs(test.id('bizB'), 'owner2')$$, 'C19: another tenant''s business is not found', 'P0002');
select test.throws($$select public.claim_start(test.id('tenantA'), '00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-00000000dead')$$, 'C20: an unknown user id is refused', '28000');
select test.throws($$select test.cs('00000000-0000-0000-0000-0000000000c4', 'owner2', 'admin_assisted')$$, 'C21: only sms_code and email_link are startable here', '22023');

-- expiry
select test.keep('e', test.cs('00000000-0000-0000-0000-0000000000c4', 'owner2'));
select test.as_root();
update public.claims set expires_at = now() - interval '1 second' where id = test.k('e', 'claim_id')::uuid;
select test.as_service();
select test.ok(test.cv(test.k('e', 'claim_id')::uuid, 'owner2', test.k('e', 'secret'))->>'result' = 'expired', 'C22: an expired code does not verify, even if correct');
select test.as_root();
select test.ok((select status from public.claims where id = test.k('e', 'claim_id')::uuid) = 'expired', 'C23: and the claim is marked expired');
select test.ok((select count(*) from public.business_owners where business_id = '00000000-0000-0000-0000-0000000000c4') = 0, 'C24: no owner was created');

-- attempts: the 5th wrong attempt rejects the claim, and then even the right code fails
select test.age_hours('00000000-0000-0000-0000-0000000000c4');
select test.as_service();
select test.keep('f', test.cs('00000000-0000-0000-0000-0000000000c4', 'owner2'));
select test.cv(test.k('f', 'claim_id')::uuid, 'owner2', 'bad1'); select test.cv(test.k('f', 'claim_id')::uuid, 'owner2', 'bad2');
select test.cv(test.k('f', 'claim_id')::uuid, 'owner2', 'bad3'); select test.cv(test.k('f', 'claim_id')::uuid, 'owner2', 'bad4');
select test.ok(test.cv(test.k('f', 'claim_id')::uuid, 'owner2', 'bad5')->>'result' = 'rejected', 'C25: the 5th wrong attempt rejects the claim');
select test.ok(test.cv(test.k('f', 'claim_id')::uuid, 'owner2', test.k('f', 'secret'))->>'result' = 'rejected', 'C26: after rejection even the correct code is refused');
select test.as_root();
select test.ok((select count(*) from public.business_owners where business_id = '00000000-0000-0000-0000-0000000000c4') = 0, 'C27: still no owner');

-- a code for one claim never works for another (salted by claim id)
select test.age_hours('00000000-0000-0000-0000-0000000000c4');
select test.as_service();
select test.keep('g', test.cs('00000000-0000-0000-0000-0000000000c4', 'owner2'));
select test.age_hours('00000000-0000-0000-0000-0000000000c4');
select test.keep('h', test.cs('00000000-0000-0000-0000-0000000000c4', 'consumer'));
select test.ok(test.cv(test.k('h', 'claim_id')::uuid, 'consumer', test.k('g', 'secret'))->>'result' in ('wrong'), 'C28: another claim''s code does not verify this one');
select test.as_root();
select test.ok((select status from public.claims where id = test.k('g', 'claim_id')::uuid) = 'pending', 'C29: a different user''s request does not cancel mine');

-- limits: cooldown, per business per hour, replaced pending
select test.as_root(); select test.age_hours('00000000-0000-0000-0000-0000000000c4'); select test.as_service();
select test.keep('i', test.cs('00000000-0000-0000-0000-0000000000c4', 'owner2'));
select test.as_root();
select test.ok((select count(*) from public.claims where business_id = '00000000-0000-0000-0000-0000000000c4' and claimant_user_id = test.id('owner2') and status = 'pending') = 1, 'C30: a new request cancels the same user''s earlier pending claim');
select test.as_service();
select test.throws($$select test.cs('00000000-0000-0000-0000-0000000000c4', 'owner2')$$, 'C31: a second code within 60 seconds is refused', '53400');
select test.as_root(); select test.age('00000000-0000-0000-0000-0000000000c4'); select test.as_service();
select test.cs('00000000-0000-0000-0000-0000000000c4', 'consumer');                       -- 2nd this hour
select test.as_root(); select test.age('00000000-0000-0000-0000-0000000000c4'); select test.as_service();
select test.cs('00000000-0000-0000-0000-0000000000c4', 'adminA');                         -- 3rd this hour
select test.as_root(); select test.age('00000000-0000-0000-0000-0000000000c4'); select test.as_service();
select test.throws($$select test.cs('00000000-0000-0000-0000-0000000000c4', 'editorA')$$, 'C32: more than 3 codes per business per hour is refused', '53400');

-- per user per day
select test.as_root();
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone)
 select ('00000000-0000-0000-0000-00000000d' || lpad(g::text, 3, '0'))::uuid, test.id('tenantA'), 'clm-u' || g, 'Clm U' || g, 'unclaimed', test.id('afton'), test.id('catPlumb'), '307-555-07' || lpad(g::text, 2, '0') from generate_series(1, 6) g;
select test.as_service();
select test.cs(('00000000-0000-0000-0000-00000000d' || lpad(g::text, 3, '0'))::uuid, 'owner1') from generate_series(1, 4) g;     -- owner1 already has 1 claim today (C1) + these 4 = 5
select test.as_root();
select test.ok(true, 'C33-setup');
select test.as_service();
select test.throws($$select test.cs('00000000-0000-0000-0000-00000000d005', 'owner1')$$, 'C33: more than 5 codes per user per day is refused', '53400');

-- per tenant per day
select test.as_root();
insert into public.claims (tenant_id, business_id, method, status, claimant_user_id, destination, token_hash, expires_at, created_at)
 select test.id('tenantA'), '00000000-0000-0000-0000-0000000000c5', 'sms_code', 'expired', test.id('adminA'), '+13075550000', 'x', now(), now() - interval '5 hours' from generate_series(1, 300);
select test.as_service();
select test.throws($$select test.cs('00000000-0000-0000-0000-00000000d006', 'owner2')$$, 'C34: the per-tenant daily cap stops SMS pumping', '53400');

-- race: two claimants, first verification wins
select test.as_root();
delete from public.claims where destination = '+13075550000';
delete from public.claims where business_id in ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000d002') ;
select test.as_service();
select test.keep('r1', test.cs('00000000-0000-0000-0000-00000000d001', 'adminA'));
select test.as_root(); select test.age('00000000-0000-0000-0000-00000000d001'); select test.as_service();
select test.keep('r2', test.cs('00000000-0000-0000-0000-00000000d001', 'editorA'));
select test.ok(test.cv(test.k('r2', 'claim_id')::uuid, 'editorA', test.k('r2', 'secret'))->>'result' = 'verified', 'C35: the first to verify becomes the owner');
select test.ok(test.cv(test.k('r1', 'claim_id')::uuid, 'adminA', test.k('r1', 'secret'))->>'result' in ('cancelled', 'already_claimed'), 'C36: the other claimant is told it is taken');
select test.as_root();
select test.ok((select count(*) from public.business_owners where business_id = '00000000-0000-0000-0000-00000000d001') = 1, 'C37: exactly one owner');

-- email link
select test.as_root();
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone, email) values
 ('00000000-0000-0000-0000-0000000000c6', test.id('tenantA'), 'clm-mail', 'Clm Mail', 'unclaimed', test.id('afton'), test.id('catPlumb'), null, 'hello@mail.example');
select test.as_service();
select test.keep('m', test.cs('00000000-0000-0000-0000-0000000000c6', 'consumer', 'email_link'));
select test.ok(test.k('m', 'secret') ~ '^[0-9a-f]{64}$' and test.k('m', 'destination') = 'hello@mail.example', 'C38: an emailed link token is 256 bits and goes to the email on file');
select test.ok(test.cv(test.k('m', 'claim_id')::uuid, 'consumer', test.k('m', 'secret'))->>'level' = 'green', 'C39: verifying by emailed link also reaches Green');
select test.as_root();
select test.ok((select kind from public.verification_proofs where business_id = '00000000-0000-0000-0000-0000000000c6') = 'email_link', 'C40: recorded as an email_link proof');
select test.as_service();
select test.throws($$select test.cs('00000000-0000-0000-0000-0000000000c2', 'owner2', 'email_link')$$, 'C41: no email on file: cannot send a link', '22023');

-- access: no browser role may call these
select test.as_user(test.id('owner1'));
select test.throws($$select test.cs('00000000-0000-0000-0000-0000000000c4', 'owner1')$$, 'C42: a signed-in user cannot call claim_start', '42501');
select test.throws($$select public.claim_verify(gen_random_uuid(), test.id('owner1'), '123456')$$, 'C43: a signed-in user cannot call claim_verify', '42501');
select test.as_user(test.id('adminA'));
select test.throws($$select test.cs('00000000-0000-0000-0000-0000000000c4', 'adminA')$$, 'C44: not even staff', '42501');
select test.as_anon();
select test.throws($$select test.cs('00000000-0000-0000-0000-0000000000c4', 'owner1')$$, 'C45: anon cannot call claim_start', '42501');
select test.throws($$select public.claim_verify(gen_random_uuid(), test.id('owner1'), '123456')$$, 'C46: anon cannot call claim_verify', '42501');
select test.as_user(test.id('owner1'));
select test.ok((select count(*) from public.claims) = 0, 'C47: a signed-in user (even an owner) cannot read claims or their hashes (RLS: staff only)');
select test.as_root();
