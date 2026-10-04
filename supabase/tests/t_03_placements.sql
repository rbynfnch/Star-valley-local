-- Placement inventory, eligibility, expiry windows, waitlist. Uses biz3..biz8 (all tenant A, owner1).
create function test.make_featurable(b uuid, with_proof boolean default true, with_listing boolean default true) returns void language plpgsql as $$
begin
  insert into public.business_owners (business_id, tenant_id, user_id) values (b, test.id('tenantA'), test.id('owner1'));
  if with_proof then insert into public.verification_proofs (tenant_id, business_id, kind) values (test.id('tenantA'), b, 'sms_code'); end if;
  if with_listing then insert into public.listings (tenant_id, business_id, tier, status, source) values (test.id('tenantA'), b, 'enhanced', 'active', 'paid'); end if;
end $$;
create function test.place(b uuid, slot public.slot_type, cat uuid, s timestamptz, e timestamptz, st public.placement_status default 'active')
returns void language sql as $$
  insert into public.placements (tenant_id, business_id, slot_type, category_id, start_at, end_at, source, status)
  values (test.id('tenantA'), b, slot, cat, s, e, 'paid', st) $$;

select test.make_featurable(test.id('biz3')); select test.make_featurable(test.id('biz4'));
select test.make_featurable(test.id('biz5')); select test.make_featurable(test.id('biz6')); select test.make_featurable(test.id('biz7'));
select test.make_featurable(test.id('biz8'), true, false);          -- verified, NOT Enhanced
select test.ok((select max_slots from public.placement_limits where tenant_id = test.id('tenantA') and slot_type = 'category') = 3, 'default limits seeded: 3 per category');
select test.ok((select max_slots from public.placement_limits where tenant_id = test.id('tenantA') and slot_type = 'homepage') = 6, 'default limits seeded: 6 homepage');
select test.ok((select max_slots from public.placement_limits where tenant_id = test.id('tenantA') and slot_type = 'community') = 4, 'default limits seeded: 4 community');
select test.ok((select max_slots from public.placement_limits where tenant_id = test.id('tenantA') and slot_type = 'things_to_do') = 6, 'default limits seeded: 6 things to do');

-- eligibility
select test.throws($$select test.place(test.id('biz2'), 'homepage', null, now(), now() + interval '30 days')$$,
                   'unverified business cannot be Featured', '23514');
select test.throws($$select test.place(test.id('biz8'), 'homepage', null, now(), now() + interval '30 days')$$,
                   'verified but non-Enhanced business cannot be Featured', '23514');
select test.throws($$insert into public.placements (tenant_id, business_id, slot_type, start_at, end_at, source, status)
                     values (test.id('tenantA'), test.id('biz3'), 'category', now(), now() + interval '1 day', 'paid', 'active')$$,
                   'category slot requires a category', '23514');
select test.throws($$insert into public.placements (tenant_id, business_id, slot_type, start_at, end_at, source) values (test.id('tenantA'), test.id('biz3'), 'homepage', now(), now() - interval '1 day', 'paid')$$,
                   'end must follow start', '23514');
-- pending/waitlist rows do not need to be eligible yet and do not consume inventory
select test.place(test.id('biz2'), 'homepage', null, now(), now() + interval '30 days', 'waitlist');

-- 3 per category, fill plumbing: now .. +30d
select test.place(test.id('biz3'), 'category', test.id('catPlumb'), now(), now() + interval '30 days');
select test.place(test.id('biz4'), 'category', test.id('catPlumb'), now(), now() + interval '30 days');
select test.place(test.id('biz5'), 'category', test.id('catPlumb'), now(), now() + interval '30 days');
select test.ok((select remaining from app.placement_availability(test.id('tenantA'), 'category', test.id('catPlumb'))) = 0, 'availability: 0 plumbing spots remaining');
select test.ok((select used from app.placement_availability(test.id('tenantA'), 'category', test.id('catPlumb'))) = 3, 'availability: 3 used');
select test.throws($$select test.place(test.id('biz6'), 'category', test.id('catPlumb'), now(), now() + interval '30 days')$$,
                   'a 4th concurrent plumbing placement is rejected', '23514');
select test.ok((select remaining from app.placement_availability(test.id('tenantA'), 'category', test.id('catEat'))) = 3, 'other categories have their own inventory');
select test.place(test.id('biz6'), 'category', test.id('catEat'), now(), now() + interval '30 days');   -- ok: different scope

-- time windows: back-to-back is fine; overlap with a full instant is not
select test.place(test.id('biz6'), 'category', test.id('catPlumb'), now() + interval '30 days', now() + interval '60 days');
select test.throws($$select test.place(test.id('biz7'), 'category', test.id('catPlumb'), now() + interval '15 days', now() + interval '45 days')$$,
                   'window overlapping a full period is rejected', '23514');
select test.place(test.id('biz7'), 'category', test.id('catPlumb'), now() + interval '60 days', now() + interval '90 days');   -- starts when biz6 ends
-- a window that begins before a later-starting placement and would overlap it only at the end
select test.place(test.id('biz7'), 'category', test.id('catPlumb'), now() + interval '30 days', now() + interval '45 days');   -- 2 concurrent (biz6 + biz7)
select test.ok(true, 'two concurrent within limit accepted');

-- same business cannot hold the same slot twice at once
select test.place(test.id('biz3'), 'things_to_do', null, now(), now() + interval '30 days');
select test.throws($$select test.place(test.id('biz3'), 'things_to_do', null, now() + interval '10 days', now() + interval '20 days')$$,
                   'duplicate overlapping placement for one business is rejected', '23P01');

-- waitlist promotion goes through the same check
select test.place(test.id('biz7'), 'category', test.id('catPlumb'), now() + interval '1 day', now() + interval '10 days', 'waitlist');
select test.throws($$update public.placements set status = 'active' where business_id = test.id('biz7') and status = 'waitlist'$$,
                   'cannot promote a waitlisted placement into a full slot', '23514');
-- cancelling one frees the slot
update public.placements set status = 'cancelled' where business_id = test.id('biz5') and slot_type = 'category' and category_id = test.id('catPlumb');
update public.placements set status = 'active' where business_id = test.id('biz7') and status = 'waitlist';
select test.ok((select status from public.placements where business_id = test.id('biz7') and start_at < now() + interval '2 days') = 'active', 'waitlist promotion succeeds after a slot frees');

-- tenant-configurable limits
update public.placement_limits set max_slots = 1 where tenant_id = test.id('tenantA') and slot_type = 'homepage';
select test.place(test.id('biz3'), 'homepage', null, now(), now() + interval '30 days');
select test.throws($$select test.place(test.id('biz4'), 'homepage', null, now(), now() + interval '30 days')$$, 'lowered homepage limit is enforced', '23514');
update public.placement_limits set max_slots = 6 where tenant_id = test.id('tenantA') and slot_type = 'homepage';
select test.place(test.id('biz4'), 'homepage', null, now(), now() + interval '30 days');
select test.ok((select max_slots from public.placement_limits where tenant_id = test.id('tenantB') and slot_type = 'homepage') = 6, 'tenant B limits unaffected');

-- one active Enhanced listing per business at a time
select test.throws($$insert into public.listings (tenant_id, business_id, tier, status) values (test.id('tenantA'), test.id('biz3'), 'enhanced', 'active')$$,
                   'overlapping active listings rejected', '23P01');

-- public reads placements only through public_placements (live, active, public business; no commercial fields)
select test.as_anon();
select test.throws('select * from public.placements', 'anon cannot read the base placements table', '42501');
select test.ok(test.count($$select 1 from public.public_placements where end_at <= now() or start_at > now()$$) = 0, 'public view never shows future/expired placements');
select test.ok(test.count($$select 1 from public.public_placements$$) > 0, 'anon sees live placements through the view');
select test.as_user(test.id('adminA'));
select test.ok(test.count($$select 1 from public.placements where status = 'waitlist'$$) > 0, 'admin sees waitlist');
select test.as_root();
