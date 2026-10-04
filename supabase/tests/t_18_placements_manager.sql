-- Placements manager: activate/extend/end listings and placements with payment records, waitlist, scarcity, access.
-- Own category and community so limits are fresh (3 per category, 4 per community); homepage is cleared first.
insert into public.categories (id, tenant_id, slug, name, plural_name) values ('00000000-0000-0000-0000-00000000ca01', test.id('tenantA'), 'pm-cat', 'Pm Cat', 'Pm Cats');
insert into public.communities (id, tenant_id, region_id, slug, name) values ('00000000-0000-0000-0000-00000000cb01', test.id('tenantA'), test.id('regionA'), 'pm-comm', 'Pm Comm');
update public.placements set status = 'cancelled' where tenant_id = test.id('tenantA') and slot_type in ('homepage', 'things_to_do') and status in ('active', 'waitlist', 'pending');
insert into public.tenant_products (tenant_id, code, name, kind, tier, interval, amount_cents) values (test.id('tenantA'), 'pm_enhanced_monthly', 'Pm Enhanced', 'listing', 'enhanced', 'month', 1900);

create function test.mkbiz(n int, verified boolean default true, owner text default 'owner1', status public.business_status default 'unclaimed') returns uuid language plpgsql security definer as $$
declare id uuid := ('00000000-0000-0000-0000-00000000ea' || lpad(n::text, 2, '0'))::uuid;
begin
  insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id)
    values (id, test.id('tenantA'), 'pm-biz-' || n, 'Pm Biz ' || n, case when status = 'prospect' then 'prospect'::public.business_status else 'unclaimed'::public.business_status end, case when status = 'prospect' then null else test.id('afton') end, case when status = 'prospect' then null else test.id('catPlumb') end);
  if verified then
    insert into public.business_owners (business_id, tenant_id, user_id) values (id, test.id('tenantA'), test.id(owner));
    insert into public.verification_proofs (tenant_id, business_id, kind) values (test.id('tenantA'), id, 'sms_code');
  end if;
  return id;
end $$;
create function test.b(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000ea' || lpad(n::text, 2, '0'))::uuid $$;
create function test.al(n int, months int default 1, ends timestamptz default null, src public.entitlement_source default 'paid', amt int default 1900, prod text default null, renews boolean default false) returns jsonb language sql as $$
  select public.activate_listing(test.id('tenantA'), test.b(n), months, ends, src, amt, prod, renews) $$;
create function test.ap(n int, slot public.slot_type, scope uuid default null, months int default 1, src public.entitlement_source default 'paid', amt int default 4900, ends timestamptz default null, wl uuid default null) returns jsonb language sql as $$
  select public.activate_placement(test.id('tenantA'), test.b(n), slot, scope, months, ends, src, amt, null, false, null, wl) $$;
create function test.cat() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000ca01'::uuid $$;
create function test.com() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000cb01'::uuid $$;
create function test.cnt(q text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute q into n; return n; end $$;
create function test.msg_like(stmt text, pat text) returns boolean language plpgsql as $$
begin execute stmt; return false; exception when others then return sqlerrm like pat; end $$;
create temp table pk (k text primary key, j jsonb); grant all on pk to public;
create function test.keepj(k text, j jsonb) returns void language sql as $$ insert into pk values (k, j) on conflict (k) do update set j = excluded.j $$;
create function test.kj(k text, f text) returns text language sql as $$ select j->>f from pk where pk.k = $1 $$;

-- businesses 1..12 verified and public; 13 unverified; 14 prospect
select test.mkbiz(g) from generate_series(1, 12) g;
select test.mkbiz(13, false); select test.mkbiz(14, false, 'owner1', 'prospect');

select test.as_user(test.id('adminA'));
-- ================= activate_listing =================
select test.keepj('l1', test.al(1));
select test.as_root();
select test.ok((select status || '|' || tier || '|' || source from public.listings where id = test.kj('l1', 'listing_id')::uuid) = 'active|enhanced|paid' and app.business_is_enhanced(test.b(1)), 'P1: a paid activation creates an active Enhanced listing');
select test.ok((select ends_at from public.listings where id = test.kj('l1', 'listing_id')::uuid) between now() + interval '27 days' and now() + interval '32 days', 'P2: one month runs about a month');
select test.ok((select channel || '|' || status || '|' || amount_cents || '|' || (marked_by = test.id('adminA'))::text from public.payments where listing_id = test.kj('l1', 'listing_id')::uuid) = 'manual|paid|1900|true', 'P3: the payment is recorded: manual, paid, the amount, and who marked it');
select test.ok(exists (select 1 from public.communications where business_id = test.b(1) and subject = 'Enhanced listing activated' and body like 'Paid $19.00%'), 'P4: the CRM log shows it');
select test.as_user(test.id('adminA'));
select test.keepj('l1b', test.al(1, 1));
select test.as_root();
select test.ok(test.kj('l1b', 'extended') = 'true' and test.kj('l1b', 'listing_id') = test.kj('l1', 'listing_id'), 'P5: activating again extends the running listing in place');
select test.ok((select ends_at from public.listings where id = test.kj('l1', 'listing_id')::uuid) > now() + interval '55 days' and test.cnt('select count(*) from public.listings where business_id = ''' || test.b(1) || ''' and status = ''active''') = 1, 'P6: it now ends two months out, and there is still one active listing');
select test.ok(test.cnt('select count(*) from public.payments where business_id = ''' || test.b(1) || '''') = 2, 'P7: each activation has its own payment record');
select test.as_user(test.id('adminA'));
select test.throws($$select test.al(1, null, now() + interval '10 days')$$, 'P8: an extension must end after the current end', '22023');
select test.ok(test.msg_like($$select test.al(1, null, now() + interval '4 years')$$, '%3 years%'), 'P18b: extending a running listing beyond 3 years is refused for that reason');
select test.throws($$select test.al(2, null, null)$$, 'P9: neither months nor an end date is refused', '22023');
select test.throws($$select test.al(2, 1, now() + interval '10 days')$$, 'P10: both months and an end date is refused', '22023');
select test.throws($$select test.al(2, 0)$$, 'P11: zero months is refused', '22023');
select test.throws($$select test.al(2, 37)$$, 'P12: more than 36 months is refused', '22023');
select test.throws($$select test.al(2, 1, null, 'paid', null)$$, 'P13: a paid listing needs an amount', '22023');
select test.throws($$select test.al(2, 1, null, 'paid', 0)$$, 'P14: a zero-dollar paid listing is refused', '22023');
select test.throws($$select test.al(2, 1, null, 'founding_member', 1900)$$, 'P15: a comped listing cannot carry a payment', '22023');
select test.throws($$select test.al(2, 1, null, 'paid', 2000000)$$, 'P16: an absurd amount is refused', '22023');
select test.throws($$select test.al(2, null, now() - interval '1 day')$$, 'P17: an end date in the past is refused', '22023');
select test.throws($$select test.al(2, null, now() + interval '4 years')$$, 'P18: more than 3 years ahead is refused', '22023');
select test.ok(test.msg_like($$select test.al(14)$$, '%publish the business%'), 'P19: a hidden prospect must be published first (says so)');
select test.throws($$select public.activate_listing(test.id('tenantA'), test.id('bizB'), 1, null, 'paid', 1900)$$, 'P20: another tenant''s business is not found', 'P0002');
select test.keepj('l2', test.al(2, 12, null, 'founding_member', null, null, true));
select test.as_root();
select test.ok((select source::text || '|' || auto_renews::text from public.listings where id = test.kj('l2', 'listing_id')::uuid) = 'founding_member|true', 'P21: a comped listing records its source, and the auto-renew flag is stored');
select test.ok((select channel || '|' || amount_cents from public.payments where listing_id = test.kj('l2', 'listing_id')::uuid) = 'comp|0', 'P22: a comp is a payment record of channel comp and $0');
select test.as_user(test.id('adminA'));
select test.al(3, 1, null, 'paid', 1900, 'pm_enhanced_monthly'); select test.al(4, 1, null, 'paid', 1900, 'no_such_product');
select test.as_root();
select test.ok((select product_id from public.payments where business_id = test.b(3)) = (select id from public.tenant_products where code = 'pm_enhanced_monthly') and (select product_id from public.payments where business_id = test.b(4)) is null, 'P23: a known product code is linked; an unknown one is ignored');

-- ================= placements: paid, comped, validation =================
select test.as_user(test.id('adminA'));
select test.keepj('p1', test.ap(1, 'category', test.cat()));
select test.as_root();
select test.ok(test.kj('p1', 'result') = 'active' and (select status::text from public.placements where id = test.kj('p1', 'placement_id')::uuid) = 'active', 'P24: a paid placement on an Enhanced, verified business activates');
select test.ok((select channel || '|' || amount_cents from public.payments where placement_id = test.kj('p1', 'placement_id')::uuid) = 'manual|4900', 'P25: with its payment record');
select test.ok((select remaining from app.placement_availability(test.id('tenantA'), 'category', test.cat())) = 2, 'P26: the live availability dropped to 2 of 3');
select test.as_user(test.id('adminA'));
select test.ok(test.ap(5, 'category', test.cat(), 1, 'founding_member', null)->>'result' = 'active', 'P27: a founding-member (comped) placement needs no Enhanced listing');
select test.as_root();
select test.ok((select channel || '|' || amount_cents from public.payments where business_id = test.b(5) and placement_id is not null) = 'comp|0', 'P28: and is recorded as a $0 comp');
select test.as_user(test.id('adminA'));
select test.ok(test.msg_like($$select test.ap(6, 'category', test.cat())$$, '%Enhanced listing%'), 'P29: a paid placement without an Enhanced listing is refused with that reason');
select test.ok(test.msg_like($$select test.ap(13, 'category', test.cat(), 1, 'founding_member', null)$$, '%verified%'), 'P30: an unverified business cannot be Featured, even comped (says why)');
select test.throws($$select test.ap(1, 'category', test.cat())$$, 'P31: the same business cannot hold the same spot twice', '22023');
select test.throws($$select test.ap(1, 'category', null)$$, 'P32: a category placement needs a category', '22023');
select test.throws($$select test.ap(1, 'homepage', test.cat())$$, 'P33: a homepage placement has no scope', '22023');
select test.throws($$select test.ap(1, 'homepage', null, null, 'paid', 4900, null)$$, 'P34: neither months nor end date is refused', '22023');
select test.throws($$select test.ap(1, 'homepage', null, 1, 'paid', null)$$, 'P35: a paid placement needs an amount', '22023');
select test.throws($$select test.ap(1, 'homepage', null, 1, 'founding_member', 100)$$, 'P36: a comped placement cannot carry a payment', '22023');
select test.ok(test.msg_like($$select test.ap(12, 'homepage', null, null, 'founding_member', null, now() + interval '4 years')$$, '%3 years%'), 'P37b: a placement cannot run more than 3 years ahead');
select test.ok(test.msg_like($$select test.ap(12, 'homepage', null, null, 'founding_member', null, now() - interval '1 day')$$, '%must be in the future%'), 'P37c: an end date in the past is refused');
select test.throws($$select public.activate_placement(test.id('tenantA'), test.id('bizB'), 'homepage', null, 1)$$, 'P37: another tenant''s business is not found', 'P0002');

-- ================= full slot, waitlist, promotion =================
select test.ok(test.ap(7, 'category', test.cat(), 1, 'founding_member', null)->>'result' = 'active', 'P38: the third spot is taken');
select test.keepj('full', test.ap(8, 'category', test.cat(), 1, 'founding_member', null));
select test.as_root();
select test.ok(test.kj('full', 'result') = 'full' and not exists (select 1 from public.placements where business_id = test.b(8)) and not exists (select 1 from public.payments where business_id = test.b(8)), 'P39: a full slot answers "full", creating no placement and no payment');
select test.as_user(test.id('adminA'));
select test.keepj('w8', public.add_to_waitlist(test.id('tenantA'), test.b(8), 'category', test.cat()));
select test.keepj('w9', public.add_to_waitlist(test.id('tenantA'), test.b(9), 'category', test.cat()));
select test.ok(public.add_to_waitlist(test.id('tenantA'), test.b(8), 'category', test.cat())->>'already' = 'true', 'P40: adding the same business twice returns the existing entry');
select test.throws($$select public.add_to_waitlist(test.id('tenantA'), test.b(14), 'category', test.cat())$$, 'P41: a hidden prospect cannot be waitlisted', 'P0002');
select test.throws($$select public.add_to_waitlist(test.id('tenantA'), test.b(8), 'category', null)$$, 'P42: a category waitlist needs a category', '22023');
select test.keepj('ov', public.admin_placements_overview(test.id('tenantA')));
select test.ok((select (s->>'used')::int || '/' || (s->>'max_slots')::int from jsonb_array_elements(test.kj('ov', 'slots')::jsonb) s where s->>'scope_name' = 'Pm Cat') = '3/3', 'P43: the overview shows 3 of 3 for the category');
select test.ok((select jsonb_array_length(s->'holders') from jsonb_array_elements(test.kj('ov', 'slots')::jsonb) s where s->>'scope_name' = 'Pm Cat') = 3, 'P44: and who holds each spot');
select test.ok((select string_agg(w->>'business_name', ',' order by ord) from jsonb_array_elements(test.kj('ov', 'slots')::jsonb) s, jsonb_array_elements(s->'waitlist') with ordinality t(w, ord) where s->>'scope_name' = 'Pm Cat') = 'Pm Biz 8,Pm Biz 9', 'P45: the waitlist is in the order people asked');
select test.ok((select bool_and((w->>'eligible')::boolean) from jsonb_array_elements(test.kj('ov', 'slots')::jsonb) s, jsonb_array_elements(s->'waitlist') w where s->>'scope_name' = 'Pm Cat') is false, 'P46: waitlist entries flag whether the business is eligible yet (no Enhanced listing yet)');
select test.ok(exists (select 1 from jsonb_array_elements(test.kj('ov', 'slots')::jsonb) s where s->>'slot_type' = 'homepage') and exists (select 1 from jsonb_array_elements(test.kj('ov', 'slots')::jsonb) s where s->>'slot_type' = 'things_to_do'), 'P47: homepage and Things to Do always appear');
select test.ok(exists (select 1 from jsonb_array_elements(test.kj('ov', 'listings')::jsonb) l where l->>'business_name' = 'Pm Biz 1'), 'P48: running Enhanced listings are listed with their end dates');
select test.keepj('pfull', public.activate_placement(test.id('tenantA'), null, 'category', null, 1, null, 'founding_member', null, null, false, null, test.kj('w8', 'id')::uuid));
select test.ok(test.kj('pfull', 'result') = 'full', 'P49: promoting from the waitlist while full answers "full" too');
select test.as_root();
select test.ok((select status::text from public.placements where id = test.kj('w8', 'id')::uuid) = 'waitlist', 'P50: and the entry stays on the waitlist');
select test.as_user(test.id('adminA'));
select test.ok(public.end_placement(test.id('tenantA'), test.kj('p1', 'placement_id')::uuid, 'switched plan')->>'result' = 'ended now', 'P51: ending an active placement ends it now');
select test.as_root();
select test.ok((select remaining from app.placement_availability(test.id('tenantA'), 'category', test.cat())) = 1, 'P52: the spot is free again immediately');
select test.ok(exists (select 1 from public.communications where business_id = test.b(1) and subject like 'Featured placement ended now%' and body = 'switched plan'), 'P53: the end is logged with the reason');
select test.as_user(test.id('adminA'));
create temp table prom as select public.activate_placement(test.id('tenantA'), null, 'category', null, 2, null, 'founding_member', null, null, false, null, test.kj('w8', 'id')::uuid) as r; grant all on prom to public;
select test.as_root();
select test.ok((select r->>'result' from prom) = 'active' and (select r->>'placement_id' from prom) = test.kj('w8', 'id') and (select status::text from public.placements where id = test.kj('w8', 'id')::uuid) = 'active', 'P54: promotion turns the SAME waitlist row into the active placement');
select test.ok((select business_id from public.placements where id = test.kj('w8', 'id')::uuid) = test.b(8) and (select end_at from public.placements where id = test.kj('w8', 'id')::uuid) > now() + interval '55 days', 'P55: for the right business, for the term chosen now');
select test.ok(test.cnt('select count(*) from public.placements where business_id = ''' || test.b(8) || '''') = 1, 'P56: no second row was created');
select test.ok(test.cnt('select count(*) from public.payments where business_id = ''' || test.b(8) || ''' and placement_id is not null') = 1, 'P57: the promotion has its own payment record');
select test.as_user(test.id('adminA'));
select test.ok(public.end_placement(test.id('tenantA'), test.kj('w9', 'id')::uuid)->>'result' = 'removed from the waitlist', 'P58: ending a waitlist entry removes it from the waitlist');
select test.throws($$select public.end_placement(test.id('tenantA'), test.kj('w9', 'id')::uuid)$$, 'P59: a placement that already ended cannot be ended again', '22023');
select test.throws($$select public.end_placement(test.id('tenantA'), gen_random_uuid())$$, 'P60: an unknown placement is not found', 'P0002');
select test.as_root();
update public.placements set start_at = now() + interval '5 days', end_at = now() + interval '35 days' where id = test.kj('w8', 'id')::uuid;
select test.as_user(test.id('adminA'));
select test.ok(public.end_placement(test.id('tenantA'), test.kj('w8', 'id')::uuid)->>'result' = 'cancelled before it started', 'P61: a placement that has not started yet is cancelled');

-- ================= end_listing and its paid placements =================
select test.ok(test.ap(1, 'homepage')->>'result' = 'active', 'P62: a paid homepage placement for a business with an Enhanced listing');
select test.ok(test.ap(5, 'homepage', null, 1, 'founding_member', null)->>'result' = 'active', 'P63: and a comped one for another');
select test.keepj('el', public.end_listing(test.id('tenantA'), test.b(1), 'cancelled by owner'));
select test.as_root();
select test.ok(test.kj('el', 'ended_paid_placements') = '1', 'P64: ending the listing reports the paid placement that ended with it');
select test.ok(not app.business_is_enhanced(test.b(1)) and (select status::text from public.listings where id = test.kj('l1', 'listing_id')::uuid) = 'cancelled', 'P65: the business is no longer Enhanced');
select test.ok(not exists (select 1 from public.placements where business_id = test.b(1) and status = 'active' and end_at > now()), 'P66: its paid placements are over');
select test.ok(exists (select 1 from public.placements where business_id = test.b(5) and slot_type = 'homepage' and status = 'active' and end_at > now()), 'P67: a comped placement is independent of any listing');
select test.as_user(test.id('adminA'));
select test.throws($$select public.end_listing(test.id('tenantA'), test.b(1))$$, 'P68: with no active listing there is nothing to end', '22023');

-- ================= public scarcity =================
select test.as_anon();
select test.keepj('sc', public.placement_scarcity(test.id('tenantA')));
select test.ok((select (c->>'used')::int || '/' || (c->>'max')::int from jsonb_array_elements(test.kj('sc', 'categories')::jsonb) c where c->>'slug' = 'pm-cat') = '2/3', 'P69: anyone can see the live count for a category (two holders remain after the earlier endings)');
select test.ok((select (c->>'used')::int || '/' || (c->>'max')::int from jsonb_array_elements(test.kj('sc', 'communities')::jsonb) c where c->>'slug' = 'pm-comm') = '0/4', 'P70: and for a community');
select test.ok((test.kj('sc', 'homepage')::jsonb->>'max')::int = 6 and (test.kj('sc', 'things_to_do')::jsonb->>'max')::int = 6, 'P71: homepage and Things to Do limits are included');
select test.ok(not exists (select 1 from jsonb_array_elements(test.kj('sc', 'categories')::jsonb) c, jsonb_object_keys(c) k where k not in ('id', 'slug', 'name', 'max', 'used')), 'P72: only aggregate keys are exposed (no business, source, price or date)');
select test.ok((select (c->>'name') from jsonb_array_elements(test.kj('sc', 'categories')::jsonb) c where c->>'slug' = 'pm-cat') = 'Pm Cats', 'P73: categories use their plural name');
select test.as_root();
-- an upcoming and an expired placement do not count as used
insert into public.placements (tenant_id, business_id, slot_type, community_id, start_at, end_at, source, status) values
  (test.id('tenantA'), test.b(9), 'community', test.com(), now() + interval '3 days', now() + interval '30 days', 'founding_member', 'active'),
  (test.id('tenantA'), test.b(10), 'community', test.com(), now() - interval '30 days', now() - interval '1 day', 'founding_member', 'active');
select test.as_anon();
select test.ok((select (c->>'used')::int from jsonb_array_elements(public.placement_scarcity(test.id('tenantA'))->'communities') c where c->>'slug' = 'pm-comm') = 0, 'P74: an upcoming or an expired placement does not use a spot today');
select test.as_root();

-- ================= owner joins a waitlist =================
select test.as_user(test.id('adminA'));
select test.ap(9, 'category', test.cat(), 1, 'founding_member', null);      -- refill: the category is full again (5, 7, 9)
select test.al(10);
select test.as_user(test.id('owner1'));
select test.keepj('j1', public.join_waitlist(test.b(10), 'category', test.cat()));
select test.ok(test.kj('j1', 'position') = '1', 'P75: a verified owner with an Enhanced listing joins a full waitlist and gets a position');
select test.ok(public.join_waitlist(test.b(10), 'category', test.cat())->>'id' = test.kj('j1', 'id'), 'P76: asking again returns the same entry');
select test.throws($$select public.join_waitlist(test.b(10), 'community', test.com())$$, 'P77: when there is room, the owner is told to buy directly', '22023');
select test.throws($$select public.join_waitlist(test.b(11), 'category', test.cat())$$, 'P78: no Enhanced listing: refused', '22023');
select test.as_root();
select test.ok((select created_by from public.placements where id = test.kj('j1', 'id')::uuid) = test.id('owner1') and (select status::text from public.placements where id = test.kj('j1', 'id')::uuid) = 'waitlist', 'P79: the entry is a waitlist row created by the owner');
select test.as_user(test.id('owner2'));
select test.throws($$select public.join_waitlist(test.b(10), 'category', test.cat())$$, 'P80: someone who does not own the business cannot join for it', '22023');
select test.as_user(test.id('owner1'));
select test.throws($$select public.join_waitlist(test.b(13), 'category', test.cat())$$, 'P81: an unowned or unverified business cannot join', '22023');
select test.as_root();
insert into public.business_owners (business_id, tenant_id, user_id) values (test.b(13), test.id('tenantA'), test.id('owner1'));
select test.as_user(test.id('owner1'));
select test.as_user(test.id('adminA')); select test.al(13); select test.as_user(test.id('owner1'));
select test.ok(test.msg_like($$select public.join_waitlist(test.b(13), 'category', test.cat())$$, '%verify your business first%'), 'P82: an owned, Enhanced but unverified business is told to verify first (not just refused)');
select test.as_root();
select test.as_user(test.id('adminA')); select test.al(11); select test.as_user(test.id('owner1'));
select test.ok(public.join_waitlist(test.b(11), 'category', test.cat())->>'position' = '2', 'P82b: the second business to ask gets position 2');
select test.as_root();
-- the 5-waitlist cap: with community/homepage/Things-to-Do limits at 0 every such slot is "full"
insert into public.communities (id, tenant_id, region_id, slug, name) values
  ('00000000-0000-0000-0000-00000000cb02', test.id('tenantA'), test.id('regionA'), 'pm-comm2', 'Pm Comm 2'), ('00000000-0000-0000-0000-00000000cb03', test.id('tenantA'), test.id('regionA'), 'pm-comm3', 'Pm Comm 3');
update public.placement_limits set max_slots = 0 where tenant_id = test.id('tenantA') and slot_type in ('homepage', 'community', 'things_to_do');
select test.as_user(test.id('owner1'));
select public.join_waitlist(test.b(10), 'homepage'); select public.join_waitlist(test.b(10), 'things_to_do'); select public.join_waitlist(test.b(10), 'community', test.com());
select test.ok(test.cnt('select count(*) from public.placements where business_id = ''' || test.b(10) || ''' and status = ''waitlist''') = 4, 'P83: waitlist entries accumulate (category, homepage, Things to Do, community = 4)');
select public.join_waitlist(test.b(10), 'community', '00000000-0000-0000-0000-00000000cb02');
select test.throws($$select public.join_waitlist(test.b(10), 'community', '00000000-0000-0000-0000-00000000cb03')$$, 'P84: a business can be on at most 5 waitlists', '22023');
select test.ok(public.join_waitlist(test.b(10), 'community', '00000000-0000-0000-0000-00000000cb02')->>'position' = '1', 'P85: re-joining one it is already on is still fine at the cap');
select test.throws($$select public.join_waitlist(test.b(10), 'community', gen_random_uuid())$$, 'P86: an unknown community is refused', '22023');
select test.as_root();
update public.placement_limits set max_slots = 6 where tenant_id = test.id('tenantA') and slot_type in ('homepage', 'things_to_do');
update public.placement_limits set max_slots = 4 where tenant_id = test.id('tenantA') and slot_type = 'community';

-- ================= access =================
select test.as_user(test.id('salesA'));
select test.ok(jsonb_typeof(public.admin_placements_overview(test.id('tenantA'))->'slots') = 'array', 'A1: sales staff can read the overview');
select test.throws($$select test.al(2)$$, 'A2: sales cannot activate a listing (admin only, like the table policies)', '42501');
select test.throws($$select test.ap(2, 'homepage')$$, 'A3: sales cannot activate a placement', '42501');
select test.throws($$select public.end_listing(test.id('tenantA'), test.b(2))$$, 'A4: sales cannot end a listing', '42501');
select test.throws($$select public.end_placement(test.id('tenantA'), gen_random_uuid())$$, 'A5: sales cannot end a placement', '42501');
select test.throws($$select public.add_to_waitlist(test.id('tenantA'), test.b(2), 'homepage')$$, 'A6: sales cannot add to a waitlist', '42501');
select test.as_user(test.id('editorA'));
select test.throws($$select public.admin_placements_overview(test.id('tenantA'))$$, 'A7: an editor cannot read the overview', '42501');
select test.as_user(test.id('owner1'));
select test.throws($$select public.admin_placements_overview(test.id('tenantA'))$$, 'A8: an owner cannot read the overview', '42501');
select test.throws($$select test.al(2)$$, 'A9: an owner cannot activate their own listing', '42501');
select test.throws($$select test.ap(2, 'homepage')$$, 'A10: an owner cannot activate their own placement', '42501');
select test.as_user(test.id('adminB'));
select test.throws($$select test.al(2)$$, 'A11: another tenant''s admin cannot activate', '42501');
select test.throws($$select public.admin_placements_overview(test.id('tenantA'))$$, 'A12: nor read the overview', '42501');
select test.as_anon();
select test.throws($$select test.al(2)$$, 'A13: anon cannot activate', '42501');
select test.throws($$select public.join_waitlist(test.b(10), 'homepage')$$, 'A14: anon cannot join a waitlist', '42501');
select test.as_root();
