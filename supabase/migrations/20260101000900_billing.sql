-- Products, payments, and Stripe linkage. Payment Links first; manual/comp activation by admin.

create table public.tenant_products (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  code        text not null,                         -- 'enhanced_monthly', 'enhanced_yearly', 'featured_monthly'
  name        text not null,
  kind        text not null check (kind in ('listing', 'placement')),
  tier        public.listing_tier,
  slot_type   public.slot_type,
  interval    text check (interval in ('month', 'year')),
  amount_cents int not null check (amount_cents >= 0),
  stripe_price_id text,
  payment_link_url text check (payment_link_url is null or payment_link_url ~* '^https://'),
  is_active   boolean not null default true,
  unique (tenant_id, code),
  check ((kind = 'listing' and tier is not null) or (kind = 'placement' and slot_type is not null))
);

-- Stripe identifiers live here (private), not on the public listings table.
create table public.billing_accounts (
  business_id uuid primary key,
  tenant_id   uuid not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  listing_id  uuid,
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade,
  foreign key (listing_id, tenant_id)  references public.listings (id, tenant_id) on delete set null (listing_id)
);

create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  business_id uuid not null,
  channel     public.payment_channel not null,
  status      public.payment_status not null default 'pending',
  amount_cents int not null check (amount_cents >= 0),
  currency    text not null default 'usd',
  product_id  uuid references public.tenant_products on delete set null,
  listing_id  uuid,
  placement_id uuid,
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text unique,
  marked_by   uuid references auth.users on delete set null,   -- staff who hit "mark as paid"
  notes       text,
  paid_at     timestamptz,
  created_at  timestamptz not null default now(),
  foreign key (business_id, tenant_id)  references public.businesses (id, tenant_id) on delete cascade,
  foreign key (listing_id, tenant_id)   references public.listings (id, tenant_id) on delete set null (listing_id),
  foreign key (placement_id, tenant_id) references public.placements (id, tenant_id) on delete set null (placement_id),
  check (channel <> 'manual' or marked_by is not null),
  check (status <> 'paid' or paid_at is not null)
);
create index payments_business on public.payments (business_id, created_at desc);

-- Webhook idempotency. Service role only (no policies, no grants).
create table public.stripe_events (
  id          text primary key,
  type        text not null,
  payload     jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
