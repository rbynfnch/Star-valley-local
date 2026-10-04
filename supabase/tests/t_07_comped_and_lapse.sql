-- Comped placements are exempt from Enhanced; a lapsing Enhanced listing ends PAID placements only.
-- Fresh businesses c1..c6 in the 'alpine' community slot (limit 4, empty), tenant A, owner1.
create function test.mk(k text, with_listing boolean, verified boolean default true) returns uuid language plpgsql as $$
declare b uuid := gen_random_uuid();
begin
  insert into public.businesses (id, tenant_id, slug, name, status, home_community_id, primary_category_id)
  values (b, test.id('tenantA'), 'lapse-' || k, 'Lapse ' || k, 'unclaimed', test.id('alpine'), test.id('catEat'));
  if verified then
    insert into public.business_owners (business_id, tenant_id, user_id) values (b, test.id('tenantA'), test.id('owner1'));
    insert into public.verification_proofs (tenant_id, business_id, kind) values (test.id('tenantA'), b, 'sms_code');
  end if;
  if with_listing then
    insert into public.listings (tenant_id, business_id, tier, status, source, starts_at) values (test.id('tenantA'), b, 'enhanced', 'active', 'paid', now() - interval '10 days');
  end if;
  return b;
end $$;
create function test.put(b uuid, src public.entitlement_source, s timestamptz, e timestamptz) returns uuid language sql as $$
  insert into public.placements (tenant_id, business_id, slot_type, community_id, start_at, end_at, source, status)
  values (test.id('tenantA'), b, 'community', test.id('alpine'), s, e, src, 'active') returning id $$;
create function test.avail() returns int language sql as $$
  select remaining from app.placement_availability(test.id('tenantA'), 'community', test.id('alpine')) $$;

-- 1. comped placement: allowed with NO Enhanced listing (verified business)
create temp table c (k text primary key, id uuid);
insert into c values ('founder', test.mk('founder', false)), ('unver', test.mk('unver', false, false)),
                     ('paid1', test.mk('paid1', true)), ('paid2', test.mk('paid2', true)), ('paid3', test.mk('paid3', true)),
                     ('paid4', test.mk('paid4', true)), ('comp2', test.mk('comp2', false));
select test.put((select id from c where k = 'founder'), 'founding_member', now(), now() + interval '90 days');
select test.ok(test.avail() = 3, 'comped founding_member placement takes a slot without any Enhanced listing');
select test.put((select id from c where k = 'comp2'), 'campaign', now(), now() + interval '90 days');
select test.ok(test.avail() = 2, 'campaign-comped placement also exempt');

-- 2. comped still needs verified + public
select test.throws($$select test.put((select id from c where k = 'unver'), 'founding_member', now(), now() + interval '30 days')$$,
                   'comped placement still requires a verified business', '23514');
-- 3. paid still needs Enhanced
select test.throws($$select test.put((select id from c where k = 'founder'), 'paid', now() + interval '100 days', now() + interval '130 days')$$,
                   'paid placement still requires an Enhanced listing', '23514');

-- 4. cancelling the listing ends the paid placement NOW and frees the slot
select test.put((select id from c where k = 'paid1'), 'paid', now() - interval '5 days', now() + interval '25 days');
select test.ok(test.avail() = 1, 'paid placement occupies a slot');
update public.listings set status = 'cancelled' where business_id = (select id from c where k = 'paid1');
select test.ok((select end_at <= now() from public.placements where business_id = (select id from c where k = 'paid1')), 'paid placement end_at clamped to cancellation time');
select test.ok(test.avail() = 2, 'slot freed immediately when Enhanced listing is cancelled');
select test.ok((select status from public.placements where business_id = (select id from c where k = 'paid1')) = 'active', 'past portion of the placement is preserved (not rewritten as cancelled)');

-- 5. comped placements are untouched by listing changes
select test.ok((select end_at > now() + interval '80 days' from public.placements where business_id = (select id from c where k = 'founder')), 'comped placement unaffected');

-- 6. future paid placement is cancelled outright when the listing lapses
select test.put((select id from c where k = 'paid2'), 'paid', now() + interval '10 days', now() + interval '40 days');
update public.listings set status = 'expired', ends_at = now() - interval '1 hour', starts_at = starts_at - interval '1 day'
 where business_id = (select id from c where k = 'paid2');
select test.ok((select status from public.placements where business_id = (select id from c where k = 'paid2')) = 'cancelled', 'not-yet-started paid placement is cancelled');

-- 7. shortening the listing's end clamps the placement to that date
select test.put((select id from c where k = 'paid3'), 'paid', now(), now() + interval '60 days');
update public.listings set ends_at = now() + interval '20 days' where business_id = (select id from c where k = 'paid3');
select test.ok((select end_at between now() + interval '19 days' and now() + interval '21 days' from public.placements where business_id = (select id from c where k = 'paid3')),
               'shortened listing end clamps the paid placement');

-- 8. renewal (extending ends_at) does NOT touch the placement
update public.listings set ends_at = now() + interval '200 days' where business_id = (select id from c where k = 'paid3');
select test.ok((select end_at between now() + interval '19 days' and now() + interval '21 days' from public.placements where business_id = (select id from c where k = 'paid3')),
               'renewal extending the listing leaves the placement alone');
-- (and a placement built after renewal can use the longer window)
select test.put((select id from c where k = 'paid4'), 'paid', now(), now() + interval '30 days');
update public.listings set ends_at = now() + interval '200 days' where business_id = (select id from c where k = 'paid4');
select test.ok((select end_at > now() + interval '29 days' from public.placements where business_id = (select id from c where k = 'paid4')), 'extending an already-long listing is a no-op');

-- 9. cancelling the only listing ends the placement
update public.listings set status = 'cancelled' where business_id = (select id from c where k = 'paid4');
select test.ok((select end_at <= now() from public.placements where business_id = (select id from c where k = 'paid4')), 'cancelling the only listing ends the placement');

-- 10. a listing that lapsed by date but was succeeded by a new Enhanced listing does NOT end the placement
create temp table s as select test.mk('succ', false) as id, test.mk('nosucc', false) as id2;
-- A: ended 1 day ago but still flagged active; B (successor) starts exactly when A ended.
insert into public.listings (tenant_id, business_id, tier, status, source, starts_at, ends_at) values
  (test.id('tenantA'), (select id from s),  'enhanced', 'active', 'paid', now() - interval '10 days', now() - interval '1 day'),
  (test.id('tenantA'), (select id2 from s), 'enhanced', 'active', 'paid', now() - interval '10 days', now() - interval '1 day');
insert into public.listings (tenant_id, business_id, tier, status, source, starts_at, ends_at)
  select tenant_id, business_id, 'enhanced', 'active', 'paid', ends_at, null           -- begins exactly when A ended
  from public.listings where business_id = (select id from s);
-- (afton slot is empty; alpine is deliberately full from the cases above)
insert into public.placements (tenant_id, business_id, slot_type, community_id, start_at, end_at, source, status)
select test.id('tenantA'), b, 'community', test.id('afton'), now() - interval '5 days', now() + interval '30 days', 'paid', 'active'
from (select id as b from s union all select id2 from s) x;
update public.listings set status = 'expired' where business_id in ((select id from s), (select id2 from s)) and ends_at is not null;
select test.ok((select end_at > now() + interval '29 days' from public.placements where business_id = (select id from s)),
               'successor listing covers the lapse: placement continues');
select test.ok((select end_at <= now() - interval '23 hours' and end_at >= now() - interval '25 hours' from public.placements where business_id = (select id2 from s)),
               'no successor: placement clamped to when the listing actually ended');

-- 11. availability is callable by the public pricing page
select test.as_anon();
select test.ok((select remaining from app.placement_availability(test.id('tenantA'), 'community', test.id('alpine'))) >= 0, 'availability callable by anon');
select test.as_root();
