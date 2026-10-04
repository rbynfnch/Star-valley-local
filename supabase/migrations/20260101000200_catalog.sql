-- Directory catalog: categories, businesses, hours, service areas, services, links, FAQs, media.
-- Every child table carries tenant_id and uses a composite FK (x_id, tenant_id) so a row can never
-- point at a parent in another tenant.

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  parent_id   uuid,
  slug        text not null,
  name        text not null,
  description text,
  icon        text,
  color_token text,                        -- design-token name, e.g. 'brick', 'lake', 'sunset'
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  unique (tenant_id, slug),
  unique (id, tenant_id),
  foreign key (parent_id, tenant_id) references public.categories (id, tenant_id)
);

create table public.media_assets (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants on delete cascade,
  business_id    uuid,                     -- FK added below (businesses defined after)
  storage_bucket text not null default 'media',
  storage_path   text not null,
  alt_text       text,
  width          int,
  height         int,
  bytes          bigint,
  is_public      boolean not null default true,
  uploaded_by    uuid references auth.users on delete set null,
  created_at     timestamptz not null default now(),
  unique (id, tenant_id),
  unique (storage_bucket, storage_path)
);

create table public.businesses (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants on delete cascade,
  slug                text not null,
  name                text not null,
  legal_name          text,
  status              public.business_status not null default 'prospect',
  home_community_id   uuid,
  primary_category_id uuid,
  address_line1       text,
  address_line2       text,
  city                text,
  state               text not null default 'WY',
  postal_code         text,
  lat                 numeric(9,6),
  lng                 numeric(9,6),
  phone               text,
  phone_digits        text generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,
  website             text check (website is null or website ~* '^https?://'),
  email               text,
  short_description   varchar(120),
  description         varchar(1500),
  hours_note          text,                                   -- e.g. "Emergency service available"
  price_range         smallint check (price_range between 0 and 3),   -- 0 = free, 1..3 = $..$$$
  highlights          text[] not null default '{}',           -- "Locally Owned", "Free Estimates"
  google_place_id     text,                                   -- ID only; never cache Google content
  -- derived by app.recompute_verification(); cannot be written directly (see guard trigger)
  verification_level  public.verification_level not null default 'none',
  verified_at         timestamptz,
  reverify_due_at     timestamptz,
  claimed_at          timestamptz,
  created_by          uuid references auth.users on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  search_tsv          tsvector generated always as (
      setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(short_description, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'C')) stored,
  unique (tenant_id, slug),
  unique (id, tenant_id),
  foreign key (home_community_id, tenant_id)   references public.communities (id, tenant_id),
  foreign key (primary_category_id, tenant_id) references public.categories (id, tenant_id),
  -- anything publicly visible must be locatable and categorized
  check (status in ('prospect', 'archived') or (home_community_id is not null and primary_category_id is not null)),
  check ((verification_level = 'none') = (verified_at is null))
);
create index businesses_tenant_status   on public.businesses (tenant_id, status);
create index businesses_community       on public.businesses (tenant_id, home_community_id) where status in ('unclaimed','claimed');
create index businesses_category        on public.businesses (tenant_id, primary_category_id) where status in ('unclaimed','claimed');
create index businesses_search          on public.businesses using gin (search_tsv);
create index businesses_name_trgm       on public.businesses using gin (lower(name) extensions.gin_trgm_ops);
create index businesses_phone_digits    on public.businesses (tenant_id, phone_digits);
create trigger businesses_touch before update on public.businesses for each row execute function app.touch_updated_at();

alter table public.media_assets
  add foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade;

-- Secondary categories (the primary one lives on businesses.primary_category_id)
create table public.business_categories (
  business_id uuid not null,
  category_id uuid not null,
  tenant_id   uuid not null,
  primary key (business_id, category_id),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade,
  foreign key (category_id, tenant_id) references public.categories (id, tenant_id) on delete cascade
);

-- Home community is on the business; this is the *additional* communities it serves.
create table public.business_service_areas (
  business_id  uuid not null,
  community_id uuid not null,
  tenant_id    uuid not null,
  primary key (business_id, community_id),
  foreign key (business_id, tenant_id)  references public.businesses (id, tenant_id) on delete cascade,
  foreign key (community_id, tenant_id) references public.communities (id, tenant_id) on delete cascade
);

-- Structured hours: one row per open range; a day may have several (lunch break). No row = closed/unknown.
create table public.business_hours (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  business_id uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),   -- 0 = Sunday
  opens       time not null,
  closes      time not null,
  source      public.field_source not null default 'import',
  updated_by  uuid references auth.users on delete set null,
  updated_at  timestamptz not null default now(),
  check (closes > opens),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade,
  exclude using gist (
    business_id with =, day_of_week with =,
    int4range((extract(hour from opens) * 60 + extract(minute from opens))::int,
              (extract(hour from closes) * 60 + extract(minute from closes))::int) with &&)
);
create index business_hours_business on public.business_hours (business_id);

create table public.business_services (        -- Enhanced content
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  business_id uuid not null,
  name        text not null,
  sort_order  int not null default 0,
  source      public.field_source not null default 'import',
  updated_by  uuid references auth.users on delete set null,
  updated_at  timestamptz not null default now(),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);
create index business_services_business on public.business_services (business_id);

create table public.business_links (           -- Enhanced content (social); also google review link-out
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  business_id uuid not null,
  kind        public.link_kind not null,
  url         text not null check (url ~* '^https?://'),
  source      public.field_source not null default 'import',
  updated_by  uuid references auth.users on delete set null,
  updated_at  timestamptz not null default now(),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);
create unique index business_links_one_per_kind on public.business_links (business_id, kind) where kind <> 'other';

create table public.business_faqs (            -- Enhanced content; feeds FAQPage JSON-LD / AEO
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  business_id uuid not null,
  question    text not null,
  answer      text not null,
  sort_order  int not null default 0,
  source      public.field_source not null default 'import',
  updated_by  uuid references auth.users on delete set null,
  updated_at  timestamptz not null default now(),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);

create table public.business_photos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  business_id    uuid not null,
  media_asset_id uuid not null,
  role           public.photo_role not null default 'gallery',
  caption        text,
  sort_order     int not null default 0,
  source         public.field_source not null default 'import',
  updated_by     uuid references auth.users on delete set null,
  updated_at     timestamptz not null default now(),
  foreign key (business_id, tenant_id)    references public.businesses (id, tenant_id) on delete cascade,
  foreign key (media_asset_id, tenant_id) references public.media_assets (id, tenant_id) on delete cascade
);
create unique index business_photos_one_logo  on public.business_photos (business_id) where role = 'logo';
create unique index business_photos_one_cover on public.business_photos (business_id) where role = 'cover';

-- ---------------------------------------------------------------------------------------------
-- Field-level provenance for businesses columns.
-- ---------------------------------------------------------------------------------------------
create table public.business_field_sources (
  business_id uuid not null,
  tenant_id   uuid not null,
  field_name  text not null,
  source      public.field_source not null,
  updated_by  uuid references auth.users on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (business_id, field_name),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);

create function app.tracked_business_fields() returns text[] language sql immutable as $$
  select array['name','legal_name','address_line1','address_line2','city','postal_code','lat','lng','phone',
               'website','email','short_description','description','hours_note','price_range','highlights']
$$;

-- Who is writing? app.write_source can be set by trusted server code (e.g. CSV import runs with 'import').
create function app.write_source(p_tenant uuid, p_business uuid) returns public.field_source
language plpgsql stable as $$
declare v text := nullif(current_setting('app.write_source', true), '');
begin
  if v is not null then return v::public.field_source; end if;
  if (select auth.uid()) is null then return 'import'; end if;
  if app.is_staff(p_tenant) then return 'admin'; end if;
  if app.owns_business(p_business) then return 'owner'; end if;
  return 'import';
end $$;

create function app.businesses_after_insert() returns trigger language plpgsql security definer set search_path = '' as $$
declare f text; src public.field_source := app.write_source(new.tenant_id, new.id);
begin
  foreach f in array app.tracked_business_fields() loop
    if to_jsonb(new) -> f is not null and to_jsonb(new) -> f <> 'null'::jsonb and to_jsonb(new) -> f <> '[]'::jsonb then
      insert into public.business_field_sources (business_id, tenant_id, field_name, source, updated_by)
      values (new.id, new.tenant_id, f, src, (select auth.uid()));
    end if;
  end loop;
  return new;
end $$;
create trigger businesses_after_insert after insert on public.businesses
  for each row execute function app.businesses_after_insert();

-- BEFORE UPDATE: (1) block protected-column writes by non-staff, (2) block direct verification writes,
-- (3) imports can never overwrite owner/admin edits, (4) record provenance of what changed.
create function app.businesses_before_update() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  f text;
  src public.field_source;
  existing public.field_source;
  trusted boolean := (select auth.uid()) is null or pg_trigger_depth() >= 2 or app.is_staff(new.tenant_id);
begin
  if new.verification_level is distinct from old.verification_level
     or new.verified_at is distinct from old.verified_at
     or new.reverify_due_at is distinct from old.reverify_due_at
     or new.claimed_at is distinct from old.claimed_at then
    -- only app.recompute_verification() / app.owners_changed() raise this flag (transaction-local)
    if coalesce(current_setting('app.verification_write', true), '') <> 'on' then
      raise exception 'verification fields are derived; add/remove proofs or owners instead' using errcode = '42501';
    end if;
  end if;

  if not trusted and (new.status is distinct from old.status or new.slug is distinct from old.slug
                      or new.home_community_id is distinct from old.home_community_id
                      or new.primary_category_id is distinct from old.primary_category_id
                      or new.google_place_id is distinct from old.google_place_id) then
    raise exception 'only staff may change status, slug, community, category or place id' using errcode = '42501';
  end if;

  src := app.write_source(new.tenant_id, new.id);
  foreach f in array app.tracked_business_fields() loop
    if to_jsonb(new) -> f is distinct from to_jsonb(old) -> f then
      if src = 'import' then
        select source into existing from public.business_field_sources where business_id = old.id and field_name = f;
        if existing in ('owner', 'admin') then
          new := jsonb_populate_record(new, jsonb_build_object(f, to_jsonb(old) -> f));
          continue;
        end if;
      end if;
      insert into public.business_field_sources (business_id, tenant_id, field_name, source, updated_by)
      values (new.id, new.tenant_id, f, src, (select auth.uid()))
      on conflict (business_id, field_name)
      do update set source = excluded.source, updated_by = excluded.updated_by, updated_at = now();
    end if;
  end loop;
  return new;
end $$;
create trigger businesses_before_update before update on public.businesses
  for each row execute function app.businesses_before_update();

-- Inserts: nobody may seed verification state directly either.
create function app.businesses_before_insert() returns trigger language plpgsql as $$
begin
  if new.verification_level <> 'none' or new.verified_at is not null or new.reverify_due_at is not null or new.claimed_at is not null then
    raise exception 'verification fields are derived; add proofs instead' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger businesses_before_insert before insert on public.businesses
  for each row execute function app.businesses_before_insert();

-- CSV-import helper: likely duplicates by fuzzy name + (same phone | similar street address).
create function app.find_duplicate_businesses(
  p_tenant uuid, p_name text, p_phone text default null, p_address text default null, p_threshold real default 0.55)
returns table (business_id uuid, name_score real, reason text)
language sql stable as $$
  select b.id,
         extensions.similarity(lower(b.name), lower(p_name)),
         case when p_phone is not null and b.phone_digits = nullif(regexp_replace(p_phone, '\D', '', 'g'), '') then 'phone'
              else 'address' end
  from public.businesses b
  where b.tenant_id = p_tenant
    and extensions.similarity(lower(b.name), lower(p_name)) >= p_threshold
    and ( (p_phone is not null and b.phone_digits = nullif(regexp_replace(p_phone, '\D', '', 'g'), ''))
       or (p_address is not null and extensions.similarity(lower(coalesce(b.address_line1, '')), lower(p_address)) >= 0.6))
  order by 2 desc
$$;
