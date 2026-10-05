-- Postcard verification: who may issue, who is eligible, one-time hashed codes, redemption by the owner only, Gold, expiry, lockout.
create function test.pk_t() returns uuid language sql as $$ select test.id('tenantA') $$;
create function test.pk_as(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', test.id(u)::text, false); execute 'set role authenticated'; end $$;
create function test.pk_svc() returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', '', false); execute 'set role service_role'; end $$;
create function test.pk_n(q text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute q into n; return n; end $$;
create temp table pk_keep (k text primary key, j jsonb); grant all on pk_keep to public;
create function test.pk_put(k text, j jsonb) returns void language sql as $$ insert into pk_keep values (k, j) on conflict (k) do update set j = excluded.j $$;
create function test.pk_get(k text) returns jsonb language sql as $$ select j from pk_keep where pk_keep.k = $1 $$;
create function test.pk_b(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000f20' || n)::uuid $$;
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone, address_line1, city) values
 (test.pk_b(1), test.pk_t(), 'pk-green',  'Pk Green',  'unclaimed', test.id('afton'), test.id('catEat'), '307-555-0951', '1 Main St', 'Afton'),
 (test.pk_b(2), test.pk_t(), 'pk-green2', 'Pk Green2', 'unclaimed', test.id('afton'), test.id('catEat'), '307-555-0952', '2 Main St', 'Afton'),
 (test.pk_b(3), test.pk_t(), 'pk-none',   'Pk None',   'unclaimed', test.id('afton'), test.id('catEat'), '307-555-0953', '3 Main St', 'Afton'),
 (test.pk_b(4), test.pk_t(), 'pk-owned-only', 'Pk Owned Only', 'unclaimed', test.id('afton'), test.id('catEat'), '307-555-0954', '4 Main St', 'Afton');
insert into public.business_owners (business_id, tenant_id, user_id) values (test.pk_b(1), test.pk_t(), test.id('owner1')), (test.pk_b(2), test.pk_t(), test.id('owner2')), (test.pk_b(4), test.pk_t(), test.id('consumer'));
insert into public.verification_proofs (tenant_id, business_id, kind) values (test.pk_t(), test.pk_b(1), 'sms_code'), (test.pk_t(), test.pk_b(2), 'email_link');

select test.ok((select verification_level from public.businesses where id = test.pk_b(1)) = 'green' and (select verification_level from public.businesses where id = test.pk_b(4)) = 'none', 'S0: setup: two Green businesses, one owned but unverified');

-- ===== who may issue
select test.pk_as('editorA');
select test.throws($$select public.postcard_batch_create(test.pk_t(), 'x', array[test.pk_b(1)])$$, 'A1: an editor cannot create a batch', '42501');
select test.pk_as('owner1');
select test.throws($$select public.postcard_batch_create(test.pk_t(), 'x', array[test.pk_b(1)])$$, 'A2: an owner cannot', '42501');
select test.throws($$select public.admin_postcard_overview(test.pk_t())$$, 'A3: nor read the overview', '42501');
select test.throws($$insert into public.postcard_codes (tenant_id, batch_id, business_id, code_hash) values (test.pk_t(), gen_random_uuid(), test.pk_b(1), 'x')$$, 'A4: nor write the table', '42501');
select test.pk_as('adminB');
select test.throws($$select public.postcard_batch_create(test.pk_t(), 'x', array[test.pk_b(1)])$$, 'A5: another tenant''s admin cannot', '42501');

-- ===== eligibility and validation
select test.pk_as('salesA');
select test.ok(jsonb_array_length(public.admin_postcard_overview(test.pk_t()) -> 'eligible') >= 2 and public.admin_postcard_overview(test.pk_t())::text !~ 'Pk None|Pk Owned Only', 'E1: only claimed, Green businesses are offered');
select test.throws($$select public.postcard_batch_create(test.pk_t(), 'x', array[test.pk_b(3)])$$, 'E2: an unverified business cannot be sent a card', '22023');
select test.throws($$select public.postcard_batch_create(test.pk_t(), 'x', array[test.pk_b(4)])$$, 'E3: nor one that is owned but not Green', '22023');
select test.throws($$select public.postcard_batch_create(test.pk_t(), '  ', array[test.pk_b(1)])$$, 'E4: the batch needs a name', '22023');
select test.throws($$select public.postcard_batch_create(test.pk_t(), 'x', '{}')$$, 'E5: and at least one business', '22023');
select test.throws($$select public.postcard_batch_create(test.pk_t(), 'x', array[test.pk_b(1), test.pk_b(1)])$$, 'E6: no duplicates', '22023');
select test.as_root();
select test.ok(test.pk_n($$select count(*) from public.postcard_codes$$) = 0, 'E7: nothing was created by the refusals');

-- ===== create a batch
select test.pk_as('salesA');
select test.pk_put('batch', public.postcard_batch_create(test.pk_t(), 'October mailing', array[test.pk_b(1), test.pk_b(2)]));
select test.as_root();
select test.ok(jsonb_array_length(test.pk_get('batch') -> 'cards') = 2 and (test.pk_get('batch') -> 'cards' -> 0 ->> 'code') ~ '^[A-HJKMNP-Z2-9]{10}$', 'B1: each card gets a 10-character code from an unambiguous alphabet');
select test.ok(test.pk_n($$select count(*) from public.postcard_codes where code_hash ~ '^[0-9a-f]{64}$' and status = 'issued'$$) = 2, 'B2: only hashes are stored');
select test.ok(not exists (select 1 from public.postcard_codes c where test.pk_get('batch')::text like '%' || c.code_hash || '%') and test.pk_n($$select count(*) from public.postcard_codes where code_hash = '$$ || (test.pk_get('batch') -> 'cards' -> 0 ->> 'code') || $$'$$) = 0, 'B3: the plaintext code is not stored anywhere');
select test.ok(test.pk_n($$select count(*) from public.communications where kind = 'postcard' and subject = 'Verification postcard issued'$$) = 2, 'B4: each card is noted in the business''s log');
select test.pk_as('salesA');
select test.throws($$select public.postcard_batch_create(test.pk_t(), 'again', array[test.pk_b(1)])$$, 'B5: a business with a card waiting cannot get a second', '22023');
select test.ok(public.admin_postcard_overview(test.pk_t())::text !~ (test.pk_get('batch') -> 'cards' -> 0 ->> 'code'), 'B6: the overview never shows a code');
select test.as_root();

-- ===== redemption
select test.pk_svc();
select test.ok(public.postcard_redeem(test.pk_t(), test.id('owner1'), 'nope') ->> 'result' = 'invalid', 'R1: junk is invalid');
select test.ok(public.postcard_redeem(test.pk_t(), test.id('owner1'), test.pk_get('batch') -> 'cards' -> 1 ->> 'code') ->> 'result' = 'invalid', 'R2: another business''s code is invalid for this owner, with the same answer as junk');
select test.ok(public.postcard_redeem(test.pk_t(), test.id('consumer'), test.pk_get('batch') -> 'cards' -> 0 ->> 'code') ->> 'result' = 'invalid', 'R3: a non-owner cannot redeem it');
select test.ok(public.postcard_redeem(test.id('tenantB'), test.id('owner1'), test.pk_get('batch') -> 'cards' -> 0 ->> 'code') ->> 'result' = 'invalid', 'R4: the code does not work under another tenant');
select test.throws($$select public.postcard_redeem(test.pk_t(), gen_random_uuid(), 'ABCDEFGHJK')$$, 'R5: an unknown account cannot redeem', '28000');
select test.pk_put('ok1', public.postcard_redeem(test.pk_t(), test.id('owner1'), lower(substr(test.pk_get('batch') -> 'cards' -> 0 ->> 'code', 1, 5)) || '-' || substr(test.pk_get('batch') -> 'cards' -> 0 ->> 'code', 6)));
select test.as_root();
select test.ok(test.pk_get('ok1') ->> 'result' = 'verified' and test.pk_get('ok1') ->> 'level' = 'gold', 'R6: the owner redeems it (case and a hyphen do not matter) and the listing becomes Gold');
select test.ok(exists (select 1 from public.verification_proofs where business_id = test.pk_b(1) and kind = 'postcard' and verified_by = test.id('owner1')), 'R7: a postcard proof was recorded');
select test.ok((select verification_level from public.businesses where id = test.pk_b(1)) = 'gold', 'R8: and the business shows Gold (Green plus the extra proof)');
select test.ok((select reverify_due_at from public.businesses where id = test.pk_b(1)) > now() + interval '300 days', 'R9: with a re-verification date a year out');
select test.pk_svc();
select test.ok(public.postcard_redeem(test.pk_t(), test.id('owner1'), test.pk_get('batch') -> 'cards' -> 0 ->> 'code') ->> 'result' = 'already', 'R10: a second redemption says it was already used');
select test.as_root();
select test.ok(test.pk_n($$select count(*) from public.verification_proofs where business_id = test.pk_b(1) and kind = 'postcard'$$) = 1, 'R11: and adds no second proof');

-- ===== voiding
select test.pk_as('salesA');
select test.throws(format($$select public.postcard_void(test.pk_t(), %L)$$, (select id from public.postcard_codes where business_id = test.pk_b(1))), 'V1: a redeemed card cannot be voided', '22023');
select test.pk_put('c2', to_jsonb((select id from public.postcard_codes where business_id = test.pk_b(2))));
select public.postcard_void(test.pk_t(), (trim(both '"' from test.pk_get('c2')::text))::uuid);
select test.pk_svc();
select test.ok(public.postcard_redeem(test.pk_t(), test.id('owner2'), test.pk_get('batch') -> 'cards' -> 1 ->> 'code') ->> 'result' = 'invalid', 'V2: a voided card no longer works');
select test.pk_as('salesA');
select test.pk_put('batch2', public.postcard_batch_create(test.pk_t(), 'Reissue', array[test.pk_b(2)]));
select test.ok(true, 'V3: after a void a new card can be issued');
select test.as_root();

-- ===== lockout, expiry
select test.pk_svc();
do $$ begin for i in 1..4 loop perform public.postcard_redeem(test.pk_t(), test.id('owner2'), 'ZZZZZZZZZZ'); end loop; end $$;
select test.throws($$select public.postcard_redeem(test.pk_t(), test.id('owner2'), 'ZZZZZZZZZZ')$$, 'L1: after five wrong codes in an hour the account is locked out, even with the right code', '53400');
select test.throws(format($$select public.postcard_redeem(test.pk_t(), test.id('owner2'), %L)$$, test.pk_get('batch2') -> 'cards' -> 0 ->> 'code'), 'L2: including the right code', '53400');
select test.as_root();
update public.postcard_attempts set at = now() - interval '2 hours';
update public.postcard_codes set issued_at = now() - interval '91 days' where business_id = test.pk_b(2) and status = 'issued';
select test.pk_svc();
select test.ok(public.postcard_redeem(test.pk_t(), test.id('owner2'), test.pk_get('batch2') -> 'cards' -> 0 ->> 'code') ->> 'result' = 'expired', 'L3: a card older than 90 days has expired (and the lockout lifted after the hour)');
select test.pk_as('salesA');
select test.ok(public.admin_postcard_overview(test.pk_t())::text ~ 'expired' and public.admin_postcard_overview(test.pk_t())::text ~ 'redeemed', 'L4: the overview shows redeemed and expired cards');
select test.ok(jsonb_array_length(public.admin_postcard_overview(test.pk_t()) -> 'eligible') >= 1, 'L5: an expired card frees the business for a new one');
select test.as_root();

-- ===== grants
select test.as_anon();
select test.throws($$select public.postcard_redeem(test.pk_t(), test.id('owner1'), 'ABCDEFGHJK')$$, 'G1: redemption is not callable from the browser roles', '42501');
select test.throws($$select app.postcard_hash('x')$$, 'G2: nor the hash helper', '42501');
select test.as_root();
