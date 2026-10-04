-- Consumer-originated data: quote requests (leads), moderation submissions, append-only tracking.

-- Quote requests to a business. NOT the CRM: this is consumer -> business.
create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  business_id uuid not null,
  name        text not null check (length(name) between 1 and 200),
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+$'),
  phone       text,
  service_needed text,
  message     text check (length(message) <= 4000),
  source      text not null default 'star_valley_local',
  status      public.inquiry_status not null default 'new',
  consumer_user_id uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (email is not null or phone is not null),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);
create index leads_business on public.leads (business_id, created_at desc);
create trigger leads_touch before update on public.leads for each row execute function app.touch_updated_at();

-- Suggest an Update / Suggest a Business / Submit an Event -> one moderation queue.
create table public.submissions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  kind        public.submission_kind not null,
  status      public.submission_status not null default 'pending',
  business_id uuid,                              -- set for 'update'
  payload     jsonb not null check (pg_column_size(payload) < 20000),
  submitter_name  text,
  submitter_email text,
  submitter_phone text,
  submitter_user_id uuid references auth.users on delete set null,
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  resolution_notes text,
  created_at  timestamptz not null default now(),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade,
  check (kind <> 'update' or business_id is not null)
);
create index submissions_queue on public.submissions (tenant_id, status, kind, created_at);

-- Append-only analytics. Bots and admin traffic are dropped at ingest (never inserted).
-- Only the service role inserts (the /api/track route); there is no client insert policy.
create table public.tracking_events (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null,
  event_type  public.tracking_type not null,
  business_id uuid,
  deal_id     uuid,
  article_id  uuid,
  community_id uuid,
  category_id  uuid,
  search_query text check (length(search_query) <= 200),
  surface     text,                              -- 'search' | 'category' | 'community' | 'home' | 'profile' ...
  session_hash text,                             -- salted, rotating; no IPs stored
  referrer_host text,
  occurred_at timestamptz not null default now(),
  foreign key (business_id, tenant_id)  references public.businesses (id, tenant_id) on delete cascade,
  foreign key (deal_id, tenant_id)      references public.deals (id, tenant_id) on delete cascade,
  foreign key (article_id, tenant_id)   references public.articles (id, tenant_id) on delete cascade,
  foreign key (community_id, tenant_id) references public.communities (id, tenant_id),
  foreign key (category_id, tenant_id)  references public.categories (id, tenant_id),
  check (event_type not in ('profile_view','website_click','phone_click','directions_click','quote_request','search_appearance')
         or business_id is not null),
  check (event_type <> 'deal_view' or deal_id is not null),
  check (event_type <> 'article_view' or article_id is not null)
);
create index tracking_business_time on public.tracking_events (business_id, occurred_at desc) where business_id is not null;
create index tracking_tenant_type_time on public.tracking_events (tenant_id, event_type, occurred_at desc);

create function app.tracking_append_only() returns trigger language plpgsql as $$
begin raise exception 'tracking_events is append-only' using errcode = '42501'; end $$;
create trigger tracking_no_update before update or delete on public.tracking_events
  for each row execute function app.tracking_append_only();

-- Daily rollup powering owner analytics + "your listing got 212 views and 14 calls".
create table public.business_stats_daily (
  tenant_id   uuid not null,
  business_id uuid not null,
  day         date not null,
  event_type  public.tracking_type not null,
  n           int not null,
  primary key (business_id, day, event_type),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);

create function app.rollup_tracking(p_day date) returns void language sql security definer set search_path = '' as $$
  insert into public.business_stats_daily (tenant_id, business_id, day, event_type, n)
  select tenant_id, business_id, p_day, event_type, count(*)
  from public.tracking_events
  where business_id is not null and occurred_at >= p_day and occurred_at < p_day + 1
  group by tenant_id, business_id, event_type
  on conflict (business_id, day, event_type) do update set n = excluded.n
$$;
