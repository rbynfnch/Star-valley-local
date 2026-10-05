-- Claim by emailed link: lifetime, options and preview (masked, claimant only), blocked addresses, one-use links, access.
create function test.cl_svc() returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', '', false); execute 'set role service_role'; end $$;
create function test.cl_start(b uuid, u text, m public.claim_method default 'email_link') returns jsonb language sql as $$ select public.claim_start(test.id('tenantA'), b, test.id(u), m) $$;
create function test.cl_n(q text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute q into n; return n; end $$;
create function test.cl_msg(stmt text, pat text) returns boolean language plpgsql as $$ begin execute stmt; return false; exception when others then return sqlerrm like pat; end $$;
create temp table cl_pk (k text primary key, j jsonb); grant all on cl_pk to public;
create function test.cl_keep(k text, j jsonb) returns void language sql as $$ insert into cl_pk values (k, j) on conflict (k) do update set j = excluded.j $$;
create function test.cl_k(k text, f text) returns text language sql as $$ select j->>f from cl_pk where cl_pk.k = $1 $$;
insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id, phone, email) values
 ('00000000-0000-0000-0000-00000000cf01', test.id('tenantA'), 'cle-both',  'Cle Both',  'unclaimed', test.id('afton'), test.id('catPlumb'), '307-555-0701', 'Owner@Cle.example'),
 ('00000000-0000-0000-0000-00000000cf02', test.id('tenantA'), 'cle-phone', 'Cle Phone', 'unclaimed', test.id('afton'), test.id('catPlumb'), '307-555-0702', null),
 ('00000000-0000-0000-0000-00000000cf03', test.id('tenantA'), 'cle-mail',  'Cle Mail',  'unclaimed', test.id('afton'), test.id('catPlumb'), '555-0703', 'info@cle-mail.example'),
 ('00000000-0000-0000-0000-00000000cf04', test.id('tenantA'), 'cle-bad',   'Cle Bad',   'unclaimed', test.id('afton'), test.id('catPlumb'), null, 'not an email'),
 ('00000000-0000-0000-0000-00000000cf05', test.id('tenantA'), 'cle-bounce','Cle Bounce','unclaimed', test.id('afton'), test.id('catPlumb'), null, 'gone@cle.example'),
 ('00000000-0000-0000-0000-00000000cf06', test.id('tenantA'), 'cle-pros',  'Cle Prospect','prospect', null, null, '307-555-0706', 'p@cle.example');
create function test.cb(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000cf0' || n)::uuid $$;

-- ===== claim_options: masked hints, only for claimable businesses
select test.cl_svc();
select test.cl_keep('o1', public.claim_options(test.id('tenantA'), test.cb(1)));
select test.cl_keep('o2', public.claim_options(test.id('tenantA'), test.cb(2)));
select test.cl_keep('o3', public.claim_options(test.id('tenantA'), test.cb(3)));
select test.cl_keep('o4', public.claim_options(test.id('tenantA'), test.cb(4)));
select test.as_root();
select test.ok(test.cl_k('o1', 'phone_last4') = '0701' and test.cl_k('o1', 'email_hint') = 'O•••@Cle.example', 'O1: a business with both offers both, masked to the last four digits and the first letter plus domain');
select test.ok(test.cl_k('o2', 'phone_last4') = '0702' and test.cl_k('o2', 'email_hint') is null, 'O2: no email on file: no email offer');
select test.ok(test.cl_k('o3', 'phone_last4') is null and test.cl_k('o3', 'email_hint') = 'i•••@cle-mail.example', 'O3: an unusable phone number is not offered, the email is');
select test.ok(test.cl_k('o4', 'email_hint') is null, 'O4: a malformed email is not offered');
select test.ok(not (test.cl_k('o1', 'email_hint') like '%wner@%') and (select j::text from cl_pk where k = 'o1') !~ '555', 'O5: the hints never contain the full address or number');
select test.cl_svc();
select test.ok(public.claim_options(test.id('tenantA'), test.cb(6)) is null, 'O6: a hidden prospect is not claimable, so no options');
select test.ok(public.claim_options(test.id('tenantB'), test.cb(1)) is null, 'O7: another tenant sees nothing');
select test.ok(public.claim_options(test.id('tenantA'), gen_random_uuid()) is null, 'O8: an unknown business sees nothing');

-- ===== lifetime
select test.cl_keep('s', test.cl_start(test.cb(1), 'salesA'));
select test.as_root();
select test.ok((select expires_at from public.claims where id = test.cl_k('s', 'claim_id')::uuid) between now() + interval '59 minutes' and now() + interval '61 minutes', 'E1: an emailed link lasts an hour');
select test.ok(test.cl_k('s', 'destination') = 'Owner@Cle.example' and test.cl_k('s', 'secret') ~ '^[0-9a-f]{64}$', 'E2: it goes to the address on file, with a 256-bit secret');
select test.ok((select token_hash from public.claims where id = test.cl_k('s', 'claim_id')::uuid) !~ test.cl_k('s', 'secret'), 'E3: only a hash of the secret is stored');
select test.ok(test.cl_n('select count(*) from public.communications where business_id = ''' || test.cb(1) || '''') = 0, 'E4: nothing is logged about the business until it is verified');
select test.cl_svc();
select test.cl_keep('t', test.cl_start(test.cb(2), 'salesA', 'sms_code'));
select test.as_root();
select test.ok((select expires_at from public.claims where id = test.cl_k('t', 'claim_id')::uuid) between now() + interval '9 minutes' and now() + interval '11 minutes', 'E5: a text code still lasts 10 minutes');

-- ===== preview: only the claimant
select test.cl_svc();
select test.cl_keep('p', public.claim_preview(test.cl_k('s', 'claim_id')::uuid, test.id('salesA')));
select test.as_root();
select test.ok(test.cl_k('p', 'business_name') = 'Cle Both' and test.cl_k('p', 'slug') = 'cle-both' and test.cl_k('p', 'status') = 'pending' and test.cl_k('p', 'method') = 'email_link' and test.cl_k('p', 'expired') = 'false', 'P1: the claimant sees what the link will confirm');
select test.ok((select j::text from cl_pk where k = 'p') !~ 'secret|token|Owner@', 'P2: the preview carries no secret and no address');
select test.cl_svc();
select test.ok(public.claim_preview(test.cl_k('s', 'claim_id')::uuid, test.id('owner2')) is null, 'P3: another account sees nothing');
select test.ok(public.claim_preview(gen_random_uuid(), test.id('salesA')) is null, 'P4: an unknown claim sees nothing');
select test.as_root();

-- ===== using the link
select test.cl_svc();
select test.throws($$select public.claim_verify(test.cl_k('s', 'claim_id')::uuid, test.id('owner2'), test.cl_k('s', 'secret'))$$, 'U1: another account cannot use the link, even holding the secret', 'P0002');
select test.ok(public.claim_verify(test.cl_k('s', 'claim_id')::uuid, test.id('salesA'), 'f' || substr(test.cl_k('s', 'secret'), 2))->>'result' in ('wrong'), 'U2: a wrong token is wrong and counts an attempt');
select test.cl_keep('v', public.claim_verify(test.cl_k('s', 'claim_id')::uuid, test.id('salesA'), test.cl_k('s', 'secret')));
select test.as_root();
select test.ok(test.cl_k('v', 'result') = 'verified' and test.cl_k('v', 'level') = 'green', 'U3: the right token verifies and reaches Green');
select test.ok((select kind from public.verification_proofs where business_id = test.cb(1)) = 'email_link', 'U4: recorded as an email_link proof');
select test.ok((select body from public.communications where business_id = test.cb(1) limit 1) like '%emailed link%', 'U5: the CRM log says it was an emailed link');
select test.ok((select user_id from public.business_owners where business_id = test.cb(1)) = test.id('salesA'), 'U6: the claimant is the owner');
select test.cl_svc();
select test.ok(public.claim_verify(test.cl_k('s', 'claim_id')::uuid, test.id('salesA'), test.cl_k('s', 'secret'))->>'already' = 'true', 'U7: pressing the button twice is harmless');
select test.ok(public.claim_preview(test.cl_k('s', 'claim_id')::uuid, test.id('salesA'))->>'status' = 'verified', 'U8: and the preview then shows it as verified');
select test.ok(public.claim_options(test.id('tenantA'), test.cb(1)) is null, 'U9: a claimed business offers no claim options');

-- ===== an expired link
select test.cl_keep('x', test.cl_start(test.cb(3), 'salesA'));
select test.as_root();
update public.claims set expires_at = now() - interval '1 second' where id = test.cl_k('x', 'claim_id')::uuid;
select test.cl_svc();
select test.ok(public.claim_preview(test.cl_k('x', 'claim_id')::uuid, test.id('salesA'))->>'expired' = 'true', 'X1: the preview says the link has expired');
select test.ok(public.claim_verify(test.cl_k('x', 'claim_id')::uuid, test.id('salesA'), test.cl_k('x', 'secret'))->>'result' = 'expired', 'X2: and the right token no longer works');
select test.throws($$select test.cl_start(test.cb(4), 'salesA')$$, 'X3: a malformed email on file cannot be mailed', '22023');

-- ===== blocked addresses
select test.ok(not public.email_is_blocked(test.id('tenantA'), 'gone@cle.example'), 'B1: a clean address is not blocked');
select public.record_email_suppression(test.id('tenantA'), 'Gone@Cle.example', 'bounce');
select test.ok(public.email_is_blocked(test.id('tenantA'), 'gone@cle.example') and public.email_is_blocked(test.id('tenantA'), 'GONE@cle.example'), 'B2: a bounced address is blocked, whatever its case');
select test.ok(not public.email_is_blocked(test.id('tenantB'), 'x@cle.example'), 'B3: only addresses that bounced are blocked');
select public.record_email_suppression(test.id('tenantA'), 'unsub@cle.example', 'unsubscribe');
select test.ok(not public.email_is_blocked(test.id('tenantA'), 'unsub@cle.example'), 'B4: an unsubscribe does not block a claim email');
select test.as_root();

-- ===== access
select test.as_user(test.id('adminA'));
select test.throws($$select public.claim_options(test.id('tenantA'), test.cb(2))$$, 'A1: no browser role, not even admin, can read claim options', '42501');
select test.throws($$select public.claim_preview(gen_random_uuid(), test.id('adminA'))$$, 'A2: or a claim preview', '42501');
select test.throws($$select public.email_is_blocked(test.id('tenantA'), 'a@b.test')$$, 'A3: or probe which addresses are blocked', '42501');
select test.as_root(); set role anon;
select test.throws($$select public.claim_options(test.id('tenantA'), gen_random_uuid())$$, 'A4: anon cannot either', '42501');
select test.as_root();
