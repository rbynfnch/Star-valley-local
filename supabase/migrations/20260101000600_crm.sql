-- Elevartemis CRM: Business -> Contacts -> Opportunities -> Communications.
-- All of this is staff-only and kept OUT of public tables (businesses is publicly readable).

create table public.business_crm (             -- one row per business: account-level lead state
  business_id   uuid primary key,
  tenant_id     uuid not null,
  lead_stage    public.lead_stage not null default 'new',
  services_interest public.service_interest[] not null default '{}',   -- potential services checklist
  assigned_to   uuid references auth.users on delete set null,
  next_action   text,
  next_action_at timestamptz,
  lost_reason   text,
  updated_at    timestamptz not null default now(),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);
create index business_crm_stage on public.business_crm (tenant_id, lead_stage);
create index business_crm_next  on public.business_crm (tenant_id, next_action_at);
create trigger business_crm_touch before update on public.business_crm for each row execute function app.touch_updated_at();

create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  business_id uuid not null,
  name        text not null,
  role        text,
  email       text,
  phone       text,
  is_primary  boolean not null default false,
  email_opt_in boolean not null default false,     -- B2B outreach consent tracking
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);
create index contacts_business on public.contacts (business_id);
create index contacts_email on public.contacts (tenant_id, lower(email));
create trigger contacts_touch before update on public.contacts for each row execute function app.touch_updated_at();

create table public.opportunities (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  business_id uuid not null,
  service     public.service_interest not null,
  stage       public.lead_stage not null default 'new',
  value_cents int check (value_cents >= 0),
  expected_close date,
  assigned_to uuid references auth.users on delete set null,
  lost_reason text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);
create index opportunities_pipeline on public.opportunities (tenant_id, stage);
create trigger opportunities_touch before update on public.opportunities for each row execute function app.touch_updated_at();

create table public.communications (            -- emails, calls, notes, visits (field-visit mode lands here)
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  business_id    uuid not null,
  contact_id     uuid,
  opportunity_id uuid,
  kind           public.comm_kind not null,
  outcome        public.visit_outcome,
  subject        text,
  body           text,
  photo_media_id uuid,
  follow_up_at   timestamptz,
  occurred_at    timestamptz not null default now(),
  staff_id       uuid references auth.users on delete set null,
  created_at     timestamptz not null default now(),
  foreign key (business_id, tenant_id)    references public.businesses (id, tenant_id) on delete cascade,
  foreign key (contact_id, tenant_id)     references public.contacts (id, tenant_id) on delete set null (contact_id),
  foreign key (opportunity_id, tenant_id) references public.opportunities (id, tenant_id) on delete set null (opportunity_id),
  foreign key (photo_media_id, tenant_id) references public.media_assets (id, tenant_id) on delete set null (photo_media_id)
);
create index communications_business on public.communications (business_id, occurred_at desc);
create index communications_followup on public.communications (tenant_id, follow_up_at) where follow_up_at is not null;
