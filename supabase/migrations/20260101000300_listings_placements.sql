-- Listings (what is displayed: tier + dates) and placements (time-bound Featured slots).
-- There is deliberately NO is_featured column anywhere. "Free" is the absence of an active Enhanced listing.

create table public.listings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  business_id uuid not null,
  tier        public.listing_tier not null default 'enhanced',
  status      public.listing_status not null default 'pending',
  source      public.entitlement_source not null default 'paid',
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,                 -- null = open-ended (renewals extend this in place)
  renewal_reminder_sent_at timestamptz,    -- 14 days before ends_at
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  unique (id, tenant_id),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade,
  -- one active listing per business at any moment
  exclude using gist (business_id with =, tstzrange(starts_at, coalesce(ends_at, 'infinity')) with &&) where (status = 'active')
);
create index listings_expiry on public.listings (ends_at) where status = 'active';
create trigger listings_touch before update on public.listings for each row execute function app.touch_updated_at();

-- Per-tenant inventory limits (configurable). Per-scope: "3 per category" means 3 in EACH category.
create table public.placement_limits (
  tenant_id uuid not null references public.tenants on delete cascade,
  slot_type public.slot_type not null,
  max_slots int not null check (max_slots >= 0),
  primary key (tenant_id, slot_type)
);

create function app.seed_placement_limits() returns trigger language plpgsql as $$
begin
  insert into public.placement_limits (tenant_id, slot_type, max_slots) values
    (new.id, 'homepage', 6), (new.id, 'category', 3), (new.id, 'community', 4), (new.id, 'things_to_do', 6);
  return new;
end $$;
create trigger tenants_seed_limits after insert on public.tenants for each row execute function app.seed_placement_limits();

create table public.placements (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  business_id  uuid not null,
  slot_type    public.slot_type not null,
  category_id  uuid,
  community_id uuid,
  scope_id     uuid generated always as (coalesce(category_id, community_id)) stored,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  source       public.entitlement_source not null,
  status       public.placement_status not null default 'pending',
  renewal_reminder_sent_at timestamptz,
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now(),     -- waitlist order
  updated_at   timestamptz not null default now(),
  check (end_at > start_at),
  check ((slot_type = 'category'  and category_id is not null and community_id is null)
      or (slot_type = 'community' and community_id is not null and category_id is null)
      or (slot_type in ('homepage', 'things_to_do') and category_id is null and community_id is null)),
  unique (id, tenant_id),
  foreign key (business_id, tenant_id)  references public.businesses (id, tenant_id) on delete cascade,
  foreign key (category_id, tenant_id)  references public.categories (id, tenant_id),
  foreign key (community_id, tenant_id) references public.communities (id, tenant_id),
  -- a business cannot hold the same slot twice at once
  exclude using gist (
    business_id with =, slot_type with =,
    (coalesce(category_id, community_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    tstzrange(start_at, end_at) with &&) where (status = 'active')
);
create index placements_slot   on public.placements (tenant_id, slot_type, category_id, community_id, status);
create index placements_expiry on public.placements (end_at) where status = 'active';
create trigger placements_touch before update on public.placements for each row execute function app.touch_updated_at();

create function app.business_is_enhanced(p_business uuid, p_at timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from public.listings l
                 where l.business_id = p_business and l.tier = 'enhanced' and l.status = 'active'
                   and l.starts_at <= p_at and (l.ends_at is null or l.ends_at > p_at));
end $$;

create function app.business_is_public(p_business uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin return exists (select 1 from public.businesses b where b.id = p_business and b.status in ('unclaimed','claimed')); end $$;

-- Quote requests only reach owners of paid listings, so only paid listings may receive them.
create function app.business_accepts_quotes(p_business uuid, p_tenant uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from public.businesses b where b.id = p_business and b.tenant_id = p_tenant)
     and app.business_is_public(p_business) and app.business_is_enhanced(p_business);
end $$;

-- Rules enforced when a placement occupies inventory (status = 'active'):
--  1. business is public and verified (green or gold);
--  2. business has an Enhanced listing active at start_at;
--  3. concurrent active placements in the same slot/scope never exceed the tenant limit at any instant
--     of the window (advisory lock serializes concurrent activations of the same slot).
create function app.placements_enforce() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_limit int; t timestamptz; c int; b public.businesses;
  v_lock bigint;
begin
  if new.status <> 'active' then return new; end if;

  select * into b from public.businesses where id = new.business_id;
  if b.status not in ('unclaimed', 'claimed') or b.verification_level = 'none' then
    raise exception 'Featured requires a verified, published business' using errcode = 'check_violation';
  end if;
  if not app.business_is_enhanced(new.business_id, new.start_at) then
    raise exception 'Featured requires an active Enhanced listing' using errcode = 'check_violation';
  end if;

  v_lock := hashtextextended(concat_ws('|', new.tenant_id, new.slot_type, new.category_id, new.community_id), 0);
  perform pg_advisory_xact_lock(v_lock);

  select max_slots into v_limit from public.placement_limits where tenant_id = new.tenant_id and slot_type = new.slot_type;
  if v_limit is null then raise exception 'no placement limit configured for % in tenant', new.slot_type; end if;

  for t in
    select new.start_at
    union
    select p.start_at from public.placements p
    where p.tenant_id = new.tenant_id and p.slot_type = new.slot_type and p.status = 'active' and p.id <> new.id
      and p.category_id is not distinct from new.category_id and p.community_id is not distinct from new.community_id
      and p.start_at > new.start_at and p.start_at < new.end_at
  loop
    select count(*) into c from public.placements p
    where p.tenant_id = new.tenant_id and p.slot_type = new.slot_type and p.status = 'active' and p.id <> new.id
      and p.category_id is not distinct from new.category_id and p.community_id is not distinct from new.community_id
      and p.start_at <= t and p.end_at > t;
    if c + 1 > v_limit then
      raise exception 'placement inventory full for % (limit %) at %', new.slot_type, v_limit, t using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;
create trigger placements_enforce before insert or update on public.placements
  for each row execute function app.placements_enforce();

-- Live scarcity for the pricing page: "2 of 3 plumbing spots remaining".
create function app.placement_availability(
  p_tenant uuid, p_slot public.slot_type, p_scope uuid default null, p_at timestamptz default now())
returns table (max_slots int, used int, remaining int)
language sql stable security definer set search_path = '' as $$
  select l.max_slots, u.n::int, greatest(l.max_slots - u.n, 0)::int
  from public.placement_limits l
  cross join lateral (
    select count(*) n from public.placements p
    where p.tenant_id = p_tenant and p.slot_type = p_slot and p.status = 'active'
      and p.scope_id is not distinct from p_scope and p.start_at <= p_at and p.end_at > p_at) u
  where l.tenant_id = p_tenant and l.slot_type = p_slot
$$;
