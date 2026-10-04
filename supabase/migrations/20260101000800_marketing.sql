-- V3 schema (exists in V1, no UI yet): campaigns, newsletters, subscribers, suppression, social.
-- Two audiences, never mixed: 'consumer' (residents, opt-in) and 'business' (B2B outreach).

create table public.email_templates (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants on delete cascade,
  audience   public.email_audience not null,
  name       text not null,
  subject    text not null,
  body_md    text not null,
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table public.email_subscribers (          -- consumer newsletter list (opt-in)
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+$'),
  status      public.subscriber_status not null default 'subscribed',
  consent_source text not null default 'website_form',
  consented_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  user_id     uuid references auth.users on delete set null,
  unique (tenant_id, email)
);
create unique index email_subscribers_lower on public.email_subscribers (tenant_id, lower(email));

-- Business-side audience is `contacts` (with email_opt_in) + business owners who opted in.
create table public.suppressions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants on delete cascade,
  email      text not null,
  audience   public.email_audience,                -- null = suppress everything
  reason     text not null check (reason in ('unsubscribe', 'bounce', 'complaint', 'manual')),
  created_at timestamptz not null default now()
);
create unique index suppressions_unique_all on public.suppressions (tenant_id, lower(email)) where audience is null;
create unique index suppressions_unique_aud on public.suppressions (tenant_id, lower(email), audience) where audience is not null;

create table public.newsletters (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  audience    public.email_audience not null,
  subject     text not null,
  preheader   text,
  body_md     text not null default '',
  segment     jsonb not null default '{}'::jsonb,  -- e.g. {"category": "...", "community": "..."}
  status      public.content_status not null default 'draft',
  scheduled_at timestamptz,
  sent_at     timestamptz,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  unique (id, tenant_id)
);

create table public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  name          text not null,
  status        public.campaign_status not null default 'draft',
  slot_type     public.slot_type not null default 'category',
  offer_months  smallint check (offer_months > 0),   -- e.g. 3 months Featured free
  offer_notes   text,
  slot_count    int check (slot_count > 0),
  starts_at     timestamptz,
  ends_at       timestamptz,
  deadline_at   timestamptz,
  auto_expand   boolean not null default false,       -- widen audience if slots remain at deadline
  created_by    uuid references auth.users on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, tenant_id)
);
create trigger campaigns_touch before update on public.campaigns for each row execute function app.touch_updated_at();

create table public.campaign_targets (
  campaign_id  uuid not null,
  tenant_id    uuid not null,
  category_id  uuid,
  community_id uuid,
  foreign key (campaign_id, tenant_id)  references public.campaigns (id, tenant_id) on delete cascade,
  foreign key (category_id, tenant_id)  references public.categories (id, tenant_id) on delete cascade,
  foreign key (community_id, tenant_id) references public.communities (id, tenant_id) on delete cascade,
  check (num_nonnulls(category_id, community_id) >= 1)
);

create table public.campaign_steps (            -- email sequence
  campaign_id uuid not null,
  tenant_id   uuid not null,
  step_no     smallint not null,
  delay_days  smallint not null default 0,
  template_id uuid,
  primary key (campaign_id, step_no),
  foreign key (campaign_id, tenant_id) references public.campaigns (id, tenant_id) on delete cascade,
  foreign key (template_id, tenant_id) references public.email_templates (id, tenant_id)
);

-- System proposes ranked candidates; an admin approves before anything is sent.
create table public.campaign_recipients (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  campaign_id  uuid not null,
  business_id  uuid not null,
  contact_id   uuid,
  priority_score numeric(6,2) not null default 0,
  score_factors jsonb not null default '{}'::jsonb,   -- explainability: why it ranked here
  status       public.recipient_status not null default 'proposed',
  approved_by  uuid references auth.users on delete set null,
  approved_at  timestamptz,
  sent_at      timestamptz,
  placement_id uuid,
  unique (campaign_id, business_id),
  foreign key (campaign_id, tenant_id) references public.campaigns (id, tenant_id) on delete cascade,
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade,
  foreign key (contact_id, tenant_id)  references public.contacts (id, tenant_id) on delete set null (contact_id),
  foreign key (placement_id, tenant_id) references public.placements (id, tenant_id) on delete set null (placement_id),
  check (status in ('proposed') or approved_at is not null)     -- nothing proceeds without approval
);
create index campaign_recipients_rank on public.campaign_recipients (campaign_id, status, priority_score desc);

create table public.message_deliveries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  audience    public.email_audience not null,
  email       text not null,
  newsletter_id uuid,
  campaign_recipient_id uuid references public.campaign_recipients on delete set null,
  provider_message_id text,
  status      public.delivery_status not null default 'queued',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (newsletter_id, tenant_id) references public.newsletters (id, tenant_id) on delete set null (newsletter_id)
);

create table public.social_posts (              -- draft + approve; no direct Meta integration
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  platform    public.social_platform not null,
  body        text not null,
  media_ids   uuid[] not null default '{}',
  status      public.social_status not null default 'draft',
  scheduled_at timestamptz,
  approved_by uuid references auth.users on delete set null,
  approved_at timestamptz,
  article_id  uuid,
  business_id uuid,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  foreign key (article_id, tenant_id)  references public.articles (id, tenant_id) on delete set null (article_id),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete set null (business_id),
  check (status in ('draft', 'rejected') or approved_by is not null)
);

-- Consumer newsletter subscribers must never be sent business mail and vice versa: enforced in the
-- send path by selecting recipients per audience and excluding `suppressions`. This helper is the
-- single place that decides eligibility.
create function app.email_is_suppressed(p_tenant uuid, p_email text, p_audience public.email_audience)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.suppressions s
                 where s.tenant_id = p_tenant and lower(s.email) = lower(p_email)
                   and (s.audience is null or s.audience = p_audience))
$$;
