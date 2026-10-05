-- Admin claim links: staff-only issue, delivery to the address ON FILE, adoption by whoever holds the secret, one winner.
create function test.ci_svc() returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', '', false); execute 'set role service_role'; end $$;
create function test.ci_n(q text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute q into n; return n; end $$;
create function test.ci_msg(stmt text, pat text) returns boolean language plpgsql as $$ begin execute stmt; return false; exception when others then return sqlerrm like pat; end $$;
create function test.ci_code(stmt text, c text) returns boolean language plpgsql as $$ begin execute stmt; return false; exception when others then return sqlstate = c; end $$;
create temp table ci_pk (k text primary key, j jsonb); grant all on ci_pk to public;
create function test.ci_keep(k text, j jsonb) returns void language sql as $$ insert into ci_pk values (k, j) on conflict (k) do update set j = excluded.j $$;
create function test.ci_k(k text, f text) returns text language sql as $$ select j->>f from ci_pk where ci_pk.k = $1 $$;
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone, email) values
 ('00000000-0000-0000-0000-00000000d101', test.id('tenantA'), 'inv-both',  'Inv Both',  'unclaimed', test.id('afton'), test.id('catPlumb'), '307-555-0801', 'Owner@Inv.example'),
 ('00000000-0000-0000-0000-00000000d102', test.id('tenantA'), 'inv-nomail','Inv NoMail','unclaimed', test.id('afton'), test.id('catPlumb'), '307-555-0802', null),
 ('00000000-0000-0000-0000-00000000d103', test.id('tenantA'), 'inv-pros',  'Inv Prospect','prospect', null, null, '307-555-0803', 'p@inv.example'),
 ('00000000-0000-0000-0000-00000000d104', test.id('tenantA'), 'inv-race',  'Inv Race',  'unclaimed', test.id('afton'), test.id('catPlumb'), null, 'race@inv.example');
create function test.ib(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000d10' || n)::uuid $$;
create function test.ci_inv(b uuid, m public.claim_method, staff text default 'salesA') returns jsonb language sql as $$ select public.claim_invite(test.id('tenantA'), b, test.id(staff), m) $$;

-- ===== who may issue
select test.ci_svc();
select test.ok(test.ci_code($$select test.ci_inv(test.ib(1), 'email_link', 'editorA')$$, '42501'), 'I1: an editor cannot issue a claim link');
select test.ok(test.ci_code($$select test.ci_inv(test.ib(1), 'email_link', 'consumer')$$, '42501'), 'I2: a consumer account cannot');
select test.ok(test.ci_code($$select public.claim_invite(test.id('tenantA'), test.ib(1), null, 'email_link')$$, '42501'), 'I3: no staff id, no link');
select test.ok(test.ci_code($$select public.claim_invite(test.id('tenantA'), test.ib(1), test.id('adminB'), 'email_link')$$, '42501'), 'I4: another tenant''s admin cannot');
select test.as_root();
select test.ok(test.ci_n($$select count(*) from public.claims where business_id = test.ib(1)$$) = 0, 'I5: nothing was created by the refusals');
select test.ci_svc();
select test.ok(test.ci_msg($$select test.ci_inv(test.ib(2), 'email_link')$$, '%no email address%'), 'I7: no email on file means no email link');
select test.ok(test.ci_msg($$select test.ci_inv(test.ib(3), 'sms_code')$$, '%only an unclaimed, published%'), 'I8: a hidden prospect cannot be sent a link');
select test.ok(test.ci_msg($$select public.claim_invite(test.id('tenantA'), test.ib(1), test.id('salesA'), 'admin_assisted')$$, '%unsupported%'), 'I9: only the two proven methods');

-- ===== issue: goes to the address on file, secret only as a hash, 7 days
select test.ci_keep('e', test.ci_inv(test.ib(1), 'email_link'));
select test.as_root();
select test.ok(test.ci_k('e', 'destination') = 'Owner@Inv.example' and test.ci_k('e', 'secret') ~ '^[0-9a-f]{64}$', 'S1: the link is addressed to the email on file with a 256-bit secret');
select test.ok((select claimant_user_id is null and created_by = test.id('salesA') and expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' and token_hash !~ test.ci_k('e', 'secret') from public.claims where id = test.ci_k('e', 'claim_id')::uuid), 'S2: unbound, attributed to staff, lasts 7 days, only a hash stored');
select test.ci_svc();
select test.ok(test.ci_msg($$select test.ci_inv(test.ib(1), 'sms_code')$$, '%just sent%'), 'S3: a second link inside a minute is refused');
select test.as_root();
update public.claims set created_at = now() - interval '2 minutes' where business_id = test.ib(1);
select test.ci_svc();
select test.ci_keep('e2', test.ci_inv(test.ib(1), 'email_link'));
select test.as_root();
select test.ok((select status from public.claims where id = test.ci_k('e', 'claim_id')::uuid) = 'cancelled', 'S4: a newer link replaces the earlier one');

-- ===== preview needs the secret
select test.ci_svc();
select test.ok(public.claim_invite_preview(test.ci_k('e', 'claim_id')::uuid, test.ci_k('e', 'secret')) ->> 'status' = 'cancelled', 'V1: the replaced link previews as cancelled');
select test.ok(public.claim_invite_preview(test.ci_k('e2', 'claim_id')::uuid, 'f' || repeat('0', 63)) is null, 'V2: a wrong secret previews nothing');
select test.ok(public.claim_invite_preview(test.ci_k('e2', 'claim_id')::uuid, test.ci_k('e2', 'secret')) ->> 'business_name' = 'Inv Both', 'V3: the right secret shows the business name');
select test.as_root();
select test.ok(test.ci_n($$select attempts from public.claims where id = '$$ || test.ci_k('e2', 'claim_id') || $$'$$) = 0, 'V4: previewing never spends an attempt');

-- ===== adopt and verify
select test.ci_svc();
select test.ok(test.ci_code($$select public.claim_verify_invite(test.ci_k('e2', 'claim_id')::uuid, gen_random_uuid(), test.ci_k('e2', 'secret'))$$, '28000'), 'A1: an account that does not exist cannot adopt');
select test.ok(public.claim_verify_invite(test.ci_k('e2', 'claim_id')::uuid, test.id('owner1'), repeat('a', 64)) ->> 'result' = 'wrong', 'A2: a wrong secret is refused and counted');
select test.as_root();
select test.ok(test.ci_n($$select attempts from public.claims where id = '$$ || test.ci_k('e2', 'claim_id') || $$'$$) = 1 and (select claimant_user_id is null from public.claims where id = test.ci_k('e2', 'claim_id')::uuid), 'A3: still unbound after a wrong secret');
select test.ci_svc();
select test.ci_keep('v', public.claim_verify_invite(test.ci_k('e2', 'claim_id')::uuid, test.id('owner1'), test.ci_k('e2', 'secret')));
select test.as_root();
select test.ok(test.ci_k('v', 'result') = 'verified', 'A4: the right secret from a signed-in account verifies');
select test.ok(exists (select 1 from public.business_owners where business_id = test.ib(1) and user_id = test.id('owner1')) and (select status from public.businesses where id = test.ib(1)) = 'claimed', 'A5: that account owns the business, now claimed');
select test.ok(exists (select 1 from public.verification_proofs where business_id = test.ib(1) and kind = 'email_link'), 'A6: the proof is the emailed link, so the listing is Green');
select test.ci_svc();
select test.ok(test.ci_code($$select public.claim_verify_invite(test.ci_k('e2', 'claim_id')::uuid, test.id('owner2'), test.ci_k('e2', 'secret'))$$, 'P0002'), 'A7: a used link cannot be adopted by a second account');
select test.ok(public.claim_verify_invite(test.ci_k('e2', 'claim_id')::uuid, test.id('owner1'), test.ci_k('e2', 'secret')) ->> 'already' = 'true', 'A8: the same account pressing again is told it is already done');
select test.ok(test.ci_msg($$select test.ci_inv(test.ib(1), 'email_link')$$, '%only an unclaimed%'), 'A9: a claimed business cannot be sent another link');

-- ===== a self-serve claim cannot be hijacked through the invite function
select test.ci_keep('self', public.claim_start(test.id('tenantA'), test.ib(4), test.id('owner1'), 'email_link'));
select test.ok(test.ci_code($$select public.claim_verify_invite(test.ci_k('self', 'claim_id')::uuid, test.id('owner2'), test.ci_k('self', 'secret'))$$, 'P0002'), 'H1: another account cannot take over a self-serve claim even with its secret');

-- ===== five wrong secrets reject
select test.as_root();
update public.claims set created_at = now() - interval '2 minutes' where business_id = test.ib(4);
select test.ci_svc();
select test.ci_keep('r', test.ci_inv(test.ib(4), 'email_link'));
select test.ci_n($$select 1$$);
select public.claim_verify_invite(test.ci_k('r', 'claim_id')::uuid, test.id('owner2'), repeat('b', 64)) from generate_series(1, 5);
select test.ok(public.claim_verify_invite(test.ci_k('r', 'claim_id')::uuid, test.id('owner2'), test.ci_k('r', 'secret')) ->> 'result' = 'rejected', 'R1: after five wrong secrets even the right one is rejected');

-- ===== expiry
select test.as_root();
update public.claims set created_at = now() - interval '3 minutes' where business_id = test.ib(4);
select test.ci_svc();
select test.ci_keep('x', test.ci_inv(test.ib(4), 'email_link'));
select test.as_root();
update public.claims set expires_at = now() - interval '1 second' where id = test.ci_k('x', 'claim_id')::uuid;
select test.ci_svc();
select test.ok(public.claim_verify_invite(test.ci_k('x', 'claim_id')::uuid, test.id('owner2'), test.ci_k('x', 'secret')) ->> 'result' = 'expired', 'X1: an expired link is refused');

-- ===== log and overview
select test.ci_svc();
select public.claim_invite_sent(test.ci_k('x', 'claim_id')::uuid, test.id('salesA'));
select public.claim_invite_sent(test.ci_k('x', 'claim_id')::uuid, test.id('editorA'));
select test.as_root();
select test.ok(test.ci_n($$select count(*) from public.communications where business_id = test.ib(4) and subject = 'Claim link sent'$$) = 1, 'L1: the log entry is written once, only for the issuing staff member');
select test.ok((select body from public.communications where business_id = test.ib(4) and subject = 'Claim link sent') !~ 'race@' , 'L2: the log shows only the domain, not the full address');
select test.as_user(test.id('salesA'));
select test.ok(public.admin_claim_overview(test.id('tenantA'), test.ib(4)) ->> 'email_hint' = 'r•••@inv.example', 'O1: staff see the masked address');
select test.ok(jsonb_array_length(public.admin_claim_overview(test.id('tenantA'), test.ib(4)) -> 'invites') >= 2, 'O2: and the recent invites');
select test.ok(public.admin_claim_overview(test.id('tenantA'), test.ib(4))::text !~ 'secret|token', 'O3: never a secret or hash');
select test.as_user(test.id('owner1'));
select test.ok(test.ci_code($$select public.admin_claim_overview(test.id('tenantA'), test.ib(4))$$, '42501'), 'O4: a business owner cannot read it');
select test.as_anon();
select test.ok(test.ci_code($$select public.admin_claim_overview(test.id('tenantA'), test.ib(4))$$, '42501'), 'O5: neither can anonymous visitors');
select test.ok(test.ci_code($$select public.claim_invite(test.id('tenantA'), test.ib(4), test.id('salesA'), 'email_link')$$, '42501'), 'O6: the issuing function is not callable from the browser roles');
select test.as_root();
