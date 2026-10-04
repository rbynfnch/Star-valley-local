-- Tenant -> Region -> Community, tenant config, accounts.

create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name          text not null,
  tagline       text,
  logo_path     text,
  theme         jsonb not null default '{}'::jsonb,      -- color/type tokens overriding the defaults
  timezone      text not null default 'America/Denver',
  contact_email text,
  support_phone text,
  mailing_address text,                                  -- required in marketing email footers
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger tenants_touch before update on public.tenants for each row execute function app.touch_updated_at();

create table public.tenant_domains (
  domain     text primary key check (domain = lower(domain)),
  tenant_id  uuid not null references public.tenants on delete cascade,
  is_primary boolean not null default false
);
create unique index tenant_domains_one_primary on public.tenant_domains (tenant_id) where is_primary;

-- Private per-tenant config (sending domains, from-addresses, integrations). Admin-only.
create table public.tenant_settings (
  tenant_id  uuid primary key references public.tenants on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.regions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants on delete cascade,
  slug       text not null,
  name       text not null,
  sort_order int  not null default 0,
  unique (tenant_id, slug),
  unique (id, tenant_id)
);

create table public.communities (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants on delete cascade,
  region_id  uuid not null,
  slug       text not null,
  name       text not null,
  state      text not null default 'WY',
  lat        numeric(9,6),
  lng        numeric(9,6),
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  unique (tenant_id, slug),
  unique (id, tenant_id),
  foreign key (region_id, tenant_id) references public.regions (id, tenant_id)
);

-- Accounts. consumer = any signed-in user; business = row in business_owners; admin = tenant_staff.
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_path  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function app.touch_updated_at();

create table public.platform_admins (          -- cross-tenant Elevartemis super-admins
  user_id uuid primary key references auth.users on delete cascade
);

create table public.tenant_staff (
  tenant_id uuid not null references public.tenants on delete cascade,
  user_id   uuid not null references auth.users on delete cascade,
  role      public.staff_role not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_staff_user on public.tenant_staff (user_id);

create function app.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

-- Authorization helpers. plpgsql so they bind tables late; SECURITY DEFINER so policies don't recurse.
create function app.is_platform_admin() returns boolean language plpgsql stable security definer set search_path = '' as $$
begin return exists (select 1 from public.platform_admins where user_id = (select auth.uid())); end $$;

create function app.is_staff(p_tenant uuid) returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return app.is_platform_admin()
      or exists (select 1 from public.tenant_staff where tenant_id = p_tenant and user_id = (select auth.uid()));
end $$;

-- 'admin' satisfies every role check.
create function app.has_role(p_tenant uuid, p_roles public.staff_role[]) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return app.is_platform_admin()
      or exists (select 1 from public.tenant_staff
                 where tenant_id = p_tenant and user_id = (select auth.uid())
                   and (role = 'admin' or role = any (p_roles)));
end $$;

create function app.owns_business(p_business uuid) returns boolean language plpgsql stable security definer set search_path = '' as $$
begin return exists (select 1 from public.business_owners where business_id = p_business and user_id = (select auth.uid())); end $$;

create function app.owns_any_business(p_tenant uuid) returns boolean language plpgsql stable security definer set search_path = '' as $$
begin return exists (select 1 from public.business_owners where tenant_id = p_tenant and user_id = (select auth.uid())); end $$;

-- tenant_id never changes after insert, on any table (installed in the RLS migration).
create function app.forbid_tenant_change() returns trigger language plpgsql as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id is immutable on %', tg_table_name using errcode = '42501';
  end if;
  return new;
end $$;
