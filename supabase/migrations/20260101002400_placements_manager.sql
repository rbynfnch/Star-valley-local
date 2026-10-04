-- Placements manager: sell and activate Enhanced listings and Featured placements (CLAUDE.md §8, §15 slice 6).
--
-- The inventory rules already live in app.placements_enforce() (verified + public, paid needs Enhanced, per-slot limits under an
-- advisory lock). These functions are the operations staff and owners use on top of them:
--   placement_scarcity       PUBLIC (aggregates only): "2 of 3 plumbing spots remaining" for the pricing page
--   admin_placements_overview staff: inventory by slot, who holds each spot, expiry, waitlist in order
--   activate_listing         admin: mark paid / comp an Enhanced listing (or extend a running one) + its payment record
--   end_listing              admin: end an Enhanced listing now (its PAID placements end with it, via the existing trigger)
--   activate_placement       admin: mark paid / comp a Featured placement, or promote a waitlist entry; says 'full' instead of failing
--   end_placement            admin: end a placement now (or cancel a waitlist entry)
--   add_to_waitlist          admin: put a business on a slot's waitlist
--   join_waitlist            owner: a verified owner with an Enhanced listing joins a waitlist, only when the slot is actually full
-- Writes are admin-only, matching the table policies. Every change leaves a note in the business's CRM log.

-- ---------------------------------------------------------------------------------------------------------------- public
create function public.placement_scarcity(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with lim as (select slot_type, max_slots from public.placement_limits where tenant_id = p_tenant),
  used as (select slot_type, scope_id, count(*) n from public.placements
            where tenant_id = p_tenant and status = 'active' and start_at <= now() and end_at > now() group by slot_type, scope_id)
  select jsonb_build_object(
    'homepage',     (select jsonb_build_object('max', l.max_slots, 'used', coalesce((select n from used where slot_type = 'homepage'), 0)) from lim l where l.slot_type = 'homepage'),
    'things_to_do', (select jsonb_build_object('max', l.max_slots, 'used', coalesce((select n from used where slot_type = 'things_to_do'), 0)) from lim l where l.slot_type = 'things_to_do'),
    'categories',   coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', coalesce(c.plural_name, c.name), 'max', l.max_slots, 'used', coalesce(u.n, 0)) order by c.sort_order, c.name)
                        from public.categories c join lim l on l.slot_type = 'category' left join used u on u.slot_type = 'category' and u.scope_id = c.id
                       where c.tenant_id = p_tenant and c.is_active), '[]'::jsonb),
    'communities',  coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'slug', m.slug, 'name', m.name, 'max', l.max_slots, 'used', coalesce(u.n, 0)) order by m.sort_order, m.name)
                        from public.communities m join lim l on l.slot_type = 'community' left join used u on u.slot_type = 'community' and u.scope_id = m.id
                       where m.tenant_id = p_tenant), '[]'::jsonb));
$$;

-- --------------------------------------------------------------------------------------------------------------- overview
create function public.admin_placements_overview(p_tenant uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_res jsonb;
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  select jsonb_build_object(
    'slots', coalesce((select jsonb_agg(to_jsonb(s) order by s.slot_type, s.scope_name) from (
        select k.slot_type, k.scope_id, coalesce(c.name, m.name) as scope_name,
               (select max_slots from public.placement_limits l where l.tenant_id = p_tenant and l.slot_type = k.slot_type) as max_slots,
               (select count(*) from public.placements p where p.tenant_id = p_tenant and p.slot_type = k.slot_type and p.scope_id is not distinct from k.scope_id and p.status = 'active' and p.start_at <= now() and p.end_at > now()) as used,
               coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'business_id', p.business_id, 'business_name', b.name, 'source', p.source, 'start_at', p.start_at, 'end_at', p.end_at, 'auto_renews', p.auto_renews, 'upcoming', p.start_at > now()) order by p.end_at)
                          from public.placements p join public.businesses b on b.id = p.business_id
                         where p.tenant_id = p_tenant and p.slot_type = k.slot_type and p.scope_id is not distinct from k.scope_id and p.status = 'active' and p.end_at > now()), '[]'::jsonb) as holders,
               coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'business_id', p.business_id, 'business_name', b.name, 'since', p.created_at, 'eligible', (b.status in ('unclaimed', 'claimed') and b.verification_level <> 'none' and app.business_is_enhanced(b.id))) order by p.created_at, p.id)
                          from public.placements p join public.businesses b on b.id = p.business_id
                         where p.tenant_id = p_tenant and p.slot_type = k.slot_type and p.scope_id is not distinct from k.scope_id and p.status = 'waitlist'), '[]'::jsonb) as waitlist
          from (select slot_type, scope_id from public.placements where tenant_id = p_tenant and status in ('active', 'waitlist') and end_at > now()
                union select 'homepage', null union select 'things_to_do', null) k
          left join public.categories c on c.id = k.scope_id and k.slot_type = 'category'
          left join public.communities m on m.id = k.scope_id and k.slot_type = 'community') s), '[]'::jsonb),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'business_id', l.business_id, 'business_name', b.name, 'source', l.source, 'ends_at', l.ends_at, 'auto_renews', l.auto_renews) order by l.ends_at nulls last, b.name)
                            from public.listings l join public.businesses b on b.id = l.business_id
                           where l.tenant_id = p_tenant and l.tier = 'enhanced' and l.status = 'active' and l.starts_at <= now() and (l.ends_at is null or l.ends_at > now())), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;

-- ----------------------------------------------------------------------------------------------------------- activate_listing
create function public.activate_listing(
  p_tenant uuid, p_business uuid, p_months int default null, p_ends_at timestamptz default null,
  p_source public.entitlement_source default 'paid', p_amount_cents int default null, p_product_code text default null,
  p_auto_renews boolean default false, p_notes text default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  b public.businesses%rowtype; l public.listings%rowtype; v_end timestamptz; v_id uuid; v_extended boolean := false;
  v_notes text := left(nullif(btrim(coalesce(p_notes, '')), ''), 500); v_product uuid;
begin
  if not app.has_role(p_tenant, '{}') then raise exception 'only admins can change a listing' using errcode = '42501'; end if;
  select * into b from public.businesses where id = p_business and tenant_id = p_tenant;
  if not found then raise exception 'business not found' using errcode = 'P0002'; end if;
  if b.status not in ('unclaimed', 'claimed') then raise exception 'publish the business before giving it a paid listing' using errcode = '22023'; end if;
  if (p_months is null) = (p_ends_at is null) then raise exception 'choose either a number of months or an end date' using errcode = '22023'; end if;
  if p_months is not null and (p_months < 1 or p_months > 36) then raise exception 'months must be between 1 and 36' using errcode = '22023'; end if;
  if p_source = 'paid' and coalesce(p_amount_cents, 0) <= 0 then raise exception 'a paid listing needs the amount paid' using errcode = '22023'; end if;
  if p_source <> 'paid' and coalesce(p_amount_cents, 0) <> 0 then raise exception 'a comped listing has no payment' using errcode = '22023'; end if;
  if p_amount_cents is not null and p_amount_cents > 1000000 then raise exception 'that amount looks wrong' using errcode = '22023'; end if;
  if p_product_code is not null then select id into v_product from public.tenant_products where tenant_id = p_tenant and code = p_product_code; end if;

  select * into l from public.listings where business_id = p_business and tier = 'enhanced' and status = 'active' and starts_at <= now() and (ends_at is null or ends_at > now()) for update;
  if found then                                                    -- renewal: extend the running listing in place
    if l.ends_at is null then raise exception 'this listing is already open-ended' using errcode = '22023'; end if;
    v_end := coalesce(p_ends_at, l.ends_at + make_interval(months => p_months));
    if v_end <= l.ends_at then raise exception 'the new end date must be after the current end (%)', l.ends_at::date using errcode = '22023'; end if;
    if v_end > now() + interval '3 years' then raise exception 'a listing can run at most 3 years ahead' using errcode = '22023'; end if;
    update public.listings set ends_at = v_end, renewal_reminder_sent_at = null, auto_renews = p_auto_renews where id = l.id;
    v_id := l.id; v_extended := true;
  else
    v_end := coalesce(p_ends_at, now() + make_interval(months => p_months));
    if v_end <= now() then raise exception 'the end date must be in the future' using errcode = '22023'; end if;
    if v_end > now() + interval '3 years' then raise exception 'a listing can run at most 3 years ahead' using errcode = '22023'; end if;
    insert into public.listings (tenant_id, business_id, tier, status, source, starts_at, ends_at, auto_renews, created_by)
      values (p_tenant, p_business, 'enhanced', 'active', p_source, now(), v_end, p_auto_renews, (select auth.uid())) returning id into v_id;
  end if;

  insert into public.payments (tenant_id, business_id, channel, status, amount_cents, product_id, listing_id, marked_by, notes, paid_at)
    values (p_tenant, p_business, (case when p_source = 'paid' then 'manual' else 'comp' end)::public.payment_channel, 'paid', coalesce(p_amount_cents, 0), v_product, v_id, (select auth.uid()), v_notes, now());
  insert into public.communications (tenant_id, business_id, kind, subject, body, staff_id)
    values (p_tenant, p_business, 'note', case when v_extended then 'Enhanced listing extended' else 'Enhanced listing activated' end,
            case when p_source = 'paid' then format('Paid $%s, until %s. ', to_char(p_amount_cents / 100.0, 'FM999990.00'), v_end::date) else format('Comped (%s), until %s. ', replace(p_source::text, '_', ' '), v_end::date) end || coalesce(v_notes, ''), (select auth.uid()));
  return jsonb_build_object('listing_id', v_id, 'ends_at', v_end, 'extended', v_extended);
end $$;

create function public.end_listing(p_tenant uuid, p_business uuid, p_reason text default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare l public.listings%rowtype; v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 500); n int;
begin
  if not app.has_role(p_tenant, '{}') then raise exception 'only admins can change a listing' using errcode = '42501'; end if;
  select * into l from public.listings where tenant_id = p_tenant and business_id = p_business and tier = 'enhanced' and status = 'active' and starts_at <= now() and (ends_at is null or ends_at > now()) for update;
  if not found then raise exception 'there is no active Enhanced listing to end' using errcode = '22023'; end if;
  select count(*) into n from public.placements where business_id = p_business and source = 'paid' and status = 'active' and end_at > now();
  update public.listings set status = 'cancelled', ends_at = case when starts_at < now() then now() else ends_at end where id = l.id;   -- the existing trigger ends its PAID placements
  insert into public.communications (tenant_id, business_id, kind, subject, body, staff_id)
    values (p_tenant, p_business, 'note', 'Enhanced listing ended', coalesce(v_reason, '') || case when n > 0 then format(' %s paid Featured placement(s) ended with it.', n) else '' end, (select auth.uid()));
  return jsonb_build_object('ended_paid_placements', n);
end $$;

-- ------------------------------------------------------------------------------------------------------- activate_placement
create function public.activate_placement(
  p_tenant uuid, p_business uuid, p_slot public.slot_type, p_scope uuid, p_months int default null, p_ends_at timestamptz default null,
  p_source public.entitlement_source default 'paid', p_amount_cents int default null, p_product_code text default null,
  p_auto_renews boolean default false, p_notes text default null, p_waitlist_id uuid default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  w public.placements%rowtype; v_end timestamptz; v_id uuid; v_cat uuid; v_com uuid; v_product uuid; v_msg text; v_state text;
  v_notes text := left(nullif(btrim(coalesce(p_notes, '')), ''), 500);
begin
  if not app.has_role(p_tenant, '{}') then raise exception 'only admins can change a placement' using errcode = '42501'; end if;
  if p_waitlist_id is not null then                                 -- promoting a waitlist entry: it decides business, slot and scope
    select * into w from public.placements where id = p_waitlist_id and tenant_id = p_tenant and status = 'waitlist' for update;
    if not found then raise exception 'that waitlist entry is no longer there' using errcode = 'P0002'; end if;
    p_business := w.business_id; p_slot := w.slot_type; p_scope := w.scope_id;
  elsif not exists (select 1 from public.businesses where id = p_business and tenant_id = p_tenant) then
    raise exception 'business not found' using errcode = 'P0002';
  end if;
  v_cat := case when p_slot = 'category' then p_scope end; v_com := case when p_slot = 'community' then p_scope end;
  if p_slot in ('category', 'community') and p_scope is null then raise exception 'choose a % for this placement', p_slot using errcode = '22023'; end if;
  if p_slot in ('homepage', 'things_to_do') and p_scope is not null then raise exception 'this kind of placement has no category or community' using errcode = '22023'; end if;
  if (p_months is null) = (p_ends_at is null) then raise exception 'choose either a number of months or an end date' using errcode = '22023'; end if;
  if p_months is not null and (p_months < 1 or p_months > 36) then raise exception 'months must be between 1 and 36' using errcode = '22023'; end if;
  v_end := coalesce(p_ends_at, now() + make_interval(months => p_months));
  if v_end <= now() then raise exception 'the end date must be in the future' using errcode = '22023'; end if;
  if v_end > now() + interval '3 years' then raise exception 'a placement can run at most 3 years ahead' using errcode = '22023'; end if;
  if p_source = 'paid' and coalesce(p_amount_cents, 0) <= 0 then raise exception 'a paid placement needs the amount paid' using errcode = '22023'; end if;
  if p_source <> 'paid' and coalesce(p_amount_cents, 0) <> 0 then raise exception 'a comped placement has no payment' using errcode = '22023'; end if;
  if p_amount_cents is not null and p_amount_cents > 1000000 then raise exception 'that amount looks wrong' using errcode = '22023'; end if;
  if p_product_code is not null then select id into v_product from public.tenant_products where tenant_id = p_tenant and code = p_product_code; end if;

  begin                                                              -- the inventory trigger decides; a full slot is an answer, not an error
    if p_waitlist_id is not null then
      update public.placements set status = 'active', start_at = now(), end_at = v_end, source = p_source, auto_renews = p_auto_renews where id = w.id;
      v_id := w.id;
    else
      insert into public.placements (tenant_id, business_id, slot_type, category_id, community_id, start_at, end_at, source, status, auto_renews, created_by)
        values (p_tenant, p_business, p_slot, v_cat, v_com, now(), v_end, p_source, 'active', p_auto_renews, (select auth.uid())) returning id into v_id;
    end if;
  exception when check_violation or exclusion_violation then
    get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
    if v_msg like '%inventory full%' then return jsonb_build_object('result', 'full'); end if;
    if v_state = '23P01' then raise exception 'this business already holds that spot' using errcode = '22023'; end if;
    raise exception '%', initcap(left(v_msg, 1)) || substr(v_msg, 2) using errcode = '22023';
  end;

  insert into public.payments (tenant_id, business_id, channel, status, amount_cents, product_id, placement_id, marked_by, notes, paid_at)
    values (p_tenant, p_business, (case when p_source = 'paid' then 'manual' else 'comp' end)::public.payment_channel, 'paid', coalesce(p_amount_cents, 0), v_product, v_id, (select auth.uid()), v_notes, now());
  insert into public.communications (tenant_id, business_id, kind, subject, body, staff_id)
    values (p_tenant, p_business, 'note', 'Featured placement activated (' || replace(p_slot::text, '_', ' ') || ')',
            case when p_source = 'paid' then format('Paid $%s, until %s. ', to_char(p_amount_cents / 100.0, 'FM999990.00'), v_end::date) else format('Comped (%s), until %s. ', replace(p_source::text, '_', ' '), v_end::date) end
            || case when p_waitlist_id is not null then 'Promoted from the waitlist. ' else '' end || coalesce(v_notes, ''), (select auth.uid()));
  return jsonb_build_object('result', 'active', 'placement_id', v_id, 'ends_at', v_end);
end $$;

create function public.end_placement(p_tenant uuid, p_id uuid, p_reason text default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare p public.placements%rowtype; v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 500); v_how text;
begin
  if not app.has_role(p_tenant, '{}') then raise exception 'only admins can change a placement' using errcode = '42501'; end if;
  select * into p from public.placements where id = p_id and tenant_id = p_tenant for update;
  if not found then raise exception 'placement not found' using errcode = 'P0002'; end if;
  if p.status = 'waitlist' or p.status = 'pending' or (p.status = 'active' and p.start_at >= now()) then
    update public.placements set status = 'cancelled' where id = p.id; v_how := case when p.status = 'waitlist' then 'removed from the waitlist' else 'cancelled before it started' end;
  elsif p.status = 'active' and p.end_at > now() then
    update public.placements set end_at = now() where id = p.id; v_how := 'ended now';
  else raise exception 'that placement has already ended' using errcode = '22023'; end if;
  insert into public.communications (tenant_id, business_id, kind, subject, body, staff_id)
    values (p_tenant, p.business_id, 'note', 'Featured placement ' || v_how || ' (' || replace(p.slot_type::text, '_', ' ') || ')', coalesce(v_reason, ''), (select auth.uid()));
  return jsonb_build_object('result', v_how);
end $$;

-- ---------------------------------------------------------------------------------------------------------------- waitlist
create function public.add_to_waitlist(p_tenant uuid, p_business uuid, p_slot public.slot_type, p_scope uuid default null, p_notes text default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_cat uuid := case when p_slot = 'category' then p_scope end; v_com uuid := case when p_slot = 'community' then p_scope end;
begin
  if not app.has_role(p_tenant, '{}') then raise exception 'only admins can change a placement' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_business and tenant_id = p_tenant and status in ('unclaimed', 'claimed')) then raise exception 'business not found' using errcode = 'P0002'; end if;
  if p_slot in ('category', 'community') and p_scope is null then raise exception 'choose a % for this waitlist', p_slot using errcode = '22023'; end if;
  if p_slot in ('homepage', 'things_to_do') and p_scope is not null then raise exception 'this kind of placement has no category or community' using errcode = '22023'; end if;
  select id into v_id from public.placements where business_id = p_business and slot_type = p_slot and scope_id is not distinct from p_scope and status = 'waitlist';
  if v_id is not null then return jsonb_build_object('id', v_id, 'already', true); end if;
  insert into public.placements (tenant_id, business_id, slot_type, category_id, community_id, start_at, end_at, source, status, created_by)
    values (p_tenant, p_business, p_slot, v_cat, v_com, now(), now() + interval '1 month', 'paid', 'waitlist', (select auth.uid())) returning id into v_id;
  insert into public.communications (tenant_id, business_id, kind, subject, body, staff_id)
    values (p_tenant, p_business, 'note', 'Added to the waitlist (' || replace(p_slot::text, '_', ' ') || ')', left(coalesce(p_notes, ''), 500), (select auth.uid()));
  return jsonb_build_object('id', v_id, 'already', false);
end $$;

-- An owner asks for a spot that is full. security definer, but everything is checked against the CALLER (auth.uid()).
create function public.join_waitlist(p_business uuid, p_slot public.slot_type, p_scope uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.businesses%rowtype; v_id uuid; v_pos int; a record; v_cat uuid := case when p_slot = 'category' then p_scope end; v_com uuid := case when p_slot = 'community' then p_scope end;
begin
  if (select auth.uid()) is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into b from public.businesses where id = p_business;
  if not found or not app.owns_business(p_business) then raise exception 'only the owner of a business can join a waitlist' using errcode = '22023'; end if;
  if b.status not in ('unclaimed', 'claimed') then raise exception 'this business is not listed publicly' using errcode = '22023'; end if;
  if b.verification_level = 'none' then raise exception 'verify your business first: Featured is for verified businesses' using errcode = '22023'; end if;
  if not app.business_is_enhanced(p_business) then raise exception 'Featured is added on top of an Enhanced listing' using errcode = '22023'; end if;
  if p_slot in ('category', 'community') and p_scope is null then raise exception 'choose a % for this waitlist', p_slot using errcode = '22023'; end if;
  if p_slot in ('homepage', 'things_to_do') and p_scope is not null then raise exception 'this kind of placement has no category or community' using errcode = '22023'; end if;
  if p_slot = 'category' and not exists (select 1 from public.categories where id = p_scope and tenant_id = b.tenant_id and is_active) then raise exception 'unknown category' using errcode = '22023'; end if;
  if p_slot = 'community' and not exists (select 1 from public.communities where id = p_scope and tenant_id = b.tenant_id) then raise exception 'unknown community' using errcode = '22023'; end if;
  select * into a from app.placement_availability(b.tenant_id, p_slot, p_scope);
  if a.remaining > 0 then raise exception 'there is room right now: you can buy this spot directly' using errcode = '22023'; end if;
  if exists (select 1 from public.placements where business_id = p_business and slot_type = p_slot and scope_id is not distinct from p_scope and status = 'active' and end_at > now()) then
    raise exception 'you already hold this spot' using errcode = '22023';
  end if;
  select id into v_id from public.placements where business_id = p_business and slot_type = p_slot and scope_id is not distinct from p_scope and status = 'waitlist';
  if v_id is null then
    if (select count(*) from public.placements where business_id = p_business and status = 'waitlist') >= 5 then raise exception 'a business can be on at most 5 waitlists' using errcode = '22023'; end if;
    insert into public.placements (tenant_id, business_id, slot_type, category_id, community_id, start_at, end_at, source, status, created_by)
      values (b.tenant_id, p_business, p_slot, v_cat, v_com, now(), now() + interval '1 month', 'paid', 'waitlist', (select auth.uid())) returning id into v_id;
    insert into public.communications (tenant_id, business_id, kind, subject, body)
      values (b.tenant_id, p_business, 'note', 'Owner joined the waitlist (' || replace(p_slot::text, '_', ' ') || ')', 'Joined from the pricing page.');
  end if;
  select count(*) into v_pos from public.placements w where w.tenant_id = b.tenant_id and w.slot_type = p_slot and w.scope_id is not distinct from p_scope and w.status = 'waitlist'
     and (w.created_at, w.id) <= (select created_at, id from public.placements where id = v_id);
  return jsonb_build_object('id', v_id, 'position', v_pos);
end $$;

revoke all on function public.placement_scarcity(uuid) from public;
revoke all on function public.admin_placements_overview(uuid) from public, anon;
revoke all on function public.activate_listing(uuid, uuid, int, timestamptz, public.entitlement_source, int, text, boolean, text) from public, anon;
revoke all on function public.end_listing(uuid, uuid, text) from public, anon;
revoke all on function public.activate_placement(uuid, uuid, public.slot_type, uuid, int, timestamptz, public.entitlement_source, int, text, boolean, text, uuid) from public, anon;
revoke all on function public.end_placement(uuid, uuid, text) from public, anon;
revoke all on function public.add_to_waitlist(uuid, uuid, public.slot_type, uuid, text) from public, anon;
revoke all on function public.join_waitlist(uuid, public.slot_type, uuid) from public, anon;
grant execute on function public.placement_scarcity(uuid) to anon, authenticated, service_role;
grant execute on function public.admin_placements_overview(uuid) to authenticated, service_role;
grant execute on function public.activate_listing(uuid, uuid, int, timestamptz, public.entitlement_source, int, text, boolean, text) to authenticated, service_role;
grant execute on function public.end_listing(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.activate_placement(uuid, uuid, public.slot_type, uuid, int, timestamptz, public.entitlement_source, int, text, boolean, text, uuid) to authenticated, service_role;
grant execute on function public.end_placement(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.add_to_waitlist(uuid, uuid, public.slot_type, uuid, text) to authenticated, service_role;
grant execute on function public.join_waitlist(uuid, public.slot_type, uuid) to authenticated, service_role;
