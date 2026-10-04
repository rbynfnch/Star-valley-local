-- Articles, community events (recurring), deals, consumer saves.

create table public.article_categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants on delete cascade,
  slug       text not null,
  name       text not null,
  color_token text,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  unique (tenant_id, slug),
  unique (id, tenant_id)
);

-- Bylines are people, not necessarily users (a freelancer or staff writer may never log in).
create table public.authors (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  user_id     uuid references auth.users on delete set null,
  name        text not null,
  bio         text,
  avatar_media_id uuid,
  unique (id, tenant_id),
  foreign key (avatar_media_id, tenant_id) references public.media_assets (id, tenant_id)
);

create table public.articles (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  slug         text not null,
  title        text not null,
  excerpt      text,
  body_md      text not null default '',
  audience     public.content_audience not null default 'public',   -- 'business' = Elevartemis -> business owners
  status       public.content_status not null default 'draft',
  category_id  uuid,
  author_id    uuid,
  cover_media_id uuid,
  spotlight_business_id uuid,                                       -- Business Spotlights
  read_minutes smallint check (read_minutes > 0),
  featured_rank smallint,                      -- editorial "Featured Articles" slot (1 = hero); null = not featured
  publish_at   timestamptz,
  seo_title    text,
  seo_description text,
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  search_tsv   tsvector generated always as (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(body_md, '')), 'C')) stored,
  check (status not in ('scheduled', 'published') or publish_at is not null),
  unique (tenant_id, slug),
  unique (id, tenant_id),
  foreign key (category_id, tenant_id)  references public.article_categories (id, tenant_id),
  foreign key (author_id, tenant_id)    references public.authors (id, tenant_id),
  foreign key (cover_media_id, tenant_id) references public.media_assets (id, tenant_id),
  foreign key (spotlight_business_id, tenant_id) references public.businesses (id, tenant_id)
);
create index articles_listing on public.articles (tenant_id, status, publish_at desc);
create index articles_category on public.articles (tenant_id, category_id, publish_at desc);
create index articles_search on public.articles using gin (search_tsv);
create trigger articles_touch before update on public.articles for each row execute function app.touch_updated_at();

-- Numbered items for "10 Things to Do" style guides; items can point at a business or event.
create table public.article_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  article_id  uuid not null,
  position    int not null,
  title       text not null,
  body        text,
  business_id uuid,
  event_id    uuid,                           -- FK added after community_events
  unique (article_id, position),
  foreign key (article_id, tenant_id)  references public.articles (id, tenant_id) on delete cascade,
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete set null (business_id)
);

create table public.event_categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants on delete cascade,
  slug       text not null,
  name       text not null,
  sort_order int not null default 0,
  unique (tenant_id, slug),
  unique (id, tenant_id)
);

create table public.community_events (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  slug         text not null,
  title        text not null,
  description  text,
  status       public.event_status not null default 'pending',
  community_id uuid,
  category_id  uuid,
  venue_name   text,
  address      text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  rrule        text,                           -- RFC 5545 recurrence rule, expanded in the app
  recurrence_until timestamptz,
  exdates      timestamptz[] not null default '{}',
  organizer_business_id uuid,
  url          text check (url is null or url ~* '^https?://'),
  image_media_id uuid,
  submitted_by_email text,
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  unique (tenant_id, slug),
  unique (id, tenant_id),
  foreign key (community_id, tenant_id) references public.communities (id, tenant_id),
  foreign key (category_id, tenant_id)  references public.event_categories (id, tenant_id),
  foreign key (organizer_business_id, tenant_id) references public.businesses (id, tenant_id) on delete set null (organizer_business_id),
  foreign key (image_media_id, tenant_id) references public.media_assets (id, tenant_id)
);
create index community_events_upcoming on public.community_events (tenant_id, status, starts_at);
create trigger community_events_touch before update on public.community_events for each row execute function app.touch_updated_at();

alter table public.article_items
  add foreign key (event_id, tenant_id) references public.community_events (id, tenant_id) on delete set null (event_id);

create table public.deals (                    -- Enhanced feature; policy requires an active Enhanced listing
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  business_id   uuid not null,
  title         text not null,
  description   text,
  terms         text,
  discount_type public.discount_type not null default 'other',
  discount_value numeric(10,2),
  status        public.content_status not null default 'draft',
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz,                   -- null = ongoing
  image_media_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  unique (id, tenant_id),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade,
  foreign key (image_media_id, tenant_id) references public.media_assets (id, tenant_id)
);
create index deals_active on public.deals (tenant_id, status, ends_at);
create trigger deals_touch before update on public.deals for each row execute function app.touch_updated_at();

-- Consumer saves (optional accounts).
create table public.saved_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  business_id uuid,
  event_id    uuid,
  deal_id     uuid,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(business_id, event_id, deal_id) = 1),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade,
  foreign key (event_id, tenant_id)    references public.community_events (id, tenant_id) on delete cascade,
  foreign key (deal_id, tenant_id)     references public.deals (id, tenant_id) on delete cascade
);
create unique index saved_items_unique on public.saved_items
  (user_id, coalesce(business_id, event_id, deal_id));
