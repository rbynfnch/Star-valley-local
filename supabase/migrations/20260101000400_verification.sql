-- Claim + verification ladder: unclaimed -> Green -> Gold. Level is DERIVED from owners + proofs.

create table public.business_owners (
  business_id uuid not null,
  user_id     uuid not null references auth.users on delete cascade,
  tenant_id   uuid not null,
  role        text not null default 'owner' check (role in ('owner', 'manager')),
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);
create index business_owners_user on public.business_owners (user_id);

create table public.claims (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  business_id  uuid not null,
  method       public.claim_method not null,
  status       public.claim_status not null default 'pending',
  claimant_user_id uuid references auth.users on delete set null,
  destination  text,                       -- phone or email the code/link was sent to
  token_hash   text,                       -- sha256 of emailed link token / SMS code. Never store plaintext.
  attempts     int not null default 0,
  expires_at   timestamptz not null,
  created_by   uuid references auth.users on delete set null,   -- staff who generated it (field sales)
  created_at   timestamptz not null default now(),
  verified_at  timestamptz,
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);
create index claims_business on public.claims (business_id, status);

create table public.postcard_batches (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants on delete cascade,
  label      text not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table public.postcard_codes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  batch_id    uuid not null,
  business_id uuid not null,
  code_hash   text not null,               -- the printed code/QR token is shown once at generation
  status      public.postcard_status not null default 'issued',
  issued_at   timestamptz not null default now(),
  redeemed_at timestamptz,
  unique (id, tenant_id),
  unique (tenant_id, code_hash),
  foreign key (batch_id, tenant_id)    references public.postcard_batches (id, tenant_id) on delete cascade,
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);

create table public.verification_proofs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  business_id uuid not null,
  kind        public.proof_kind not null,
  verified_at timestamptz not null default now(),
  verified_by uuid references auth.users on delete set null,
  claim_id    uuid references public.claims on delete set null,
  evidence    jsonb not null default '{}'::jsonb,     -- e.g. GBP place id, license number
  revoked_at  timestamptz,
  revoked_reason text,
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);
create index verification_proofs_business on public.verification_proofs (business_id) where revoked_at is null;

-- Ladder:  Green = owner linked + a valid (<1y, unrevoked) sms_code|email_link proof.
--          Gold  = Green + a valid postcard|google_business_profile|business_license proof.
-- Losing the owner or the Green proof drops to 'none'; losing only the extra proof drops Gold to Green.
create function app.recompute_verification(p_business uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  has_owner boolean; green_at timestamptz; gold_at timestamptz;
  lvl public.verification_level; v_at timestamptz; due timestamptz;
begin
  select exists (select 1 from public.business_owners where business_id = p_business) into has_owner;
  select max(verified_at) into green_at from public.verification_proofs
   where business_id = p_business and revoked_at is null and kind in ('sms_code', 'email_link')
     and verified_at > now() - interval '1 year';
  select max(verified_at) into gold_at from public.verification_proofs
   where business_id = p_business and revoked_at is null and kind in ('postcard', 'google_business_profile', 'business_license')
     and verified_at > now() - interval '1 year';

  if has_owner and green_at is not null and gold_at is not null then
    lvl := 'gold'; v_at := greatest(green_at, gold_at); due := least(green_at, gold_at) + interval '1 year';
  elsif has_owner and green_at is not null then
    lvl := 'green'; v_at := green_at; due := green_at + interval '1 year';
  else
    lvl := 'none'; v_at := null; due := null;
  end if;

  update public.businesses
     set verification_level = lvl, verified_at = v_at, reverify_due_at = due
   where id = p_business
     and (verification_level, verified_at, reverify_due_at) is distinct from (lvl, v_at, due);
end $$;

create function app.proofs_changed() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform app.recompute_verification(coalesce(new.business_id, old.business_id)); return null; end $$;
create trigger proofs_changed after insert or update or delete on public.verification_proofs
  for each row execute function app.proofs_changed();

create function app.owners_changed() returns trigger language plpgsql security definer set search_path = '' as $$
declare b uuid := coalesce(new.business_id, old.business_id);
begin
  if tg_op = 'INSERT' then
    update public.businesses set status = 'claimed', claimed_at = coalesce(claimed_at, now())
     where id = b and status = 'unclaimed';
  elsif not exists (select 1 from public.business_owners where business_id = b) then
    update public.businesses set status = 'unclaimed' where id = b and status = 'claimed';
  end if;
  perform app.recompute_verification(b);
  return null;
end $$;
create trigger owners_changed after insert or delete on public.business_owners
  for each row execute function app.owners_changed();

-- Run daily (pg_cron / scheduled edge function): downgrades businesses whose proofs aged past 1 year.
create function app.expire_verifications() returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.businesses where verification_level <> 'none' and reverify_due_at <= now() loop
    perform app.recompute_verification(r.id); n := n + 1;
  end loop;
  return n;
end $$;
