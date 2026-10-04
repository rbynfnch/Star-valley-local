-- Verification-lapse grace period + automated email reminders (outbox pattern).
--
-- Flow
--   * recompute_verification() drops a business to 'none' while it holds an active placement
--       -> start_verification_grace(): 14 days (per tenant), placements stay live, owner is emailed.
--   * business re-verifies inside the window -> grace resolved 'reverified', queued reminders cancelled.
--   * run_daily_maintenance() (pg_cron, daily) queues: pre-expiry re-verification reminders, grace reminders,
--     renewal reminders; and when a grace period runs out it ENDS the business's placements (paid and comped).
--   * The database only QUEUES email (notifications). A backend worker claims rows, sends via the business-side
--     sending domain, and reports back (claim_notifications / complete_notification / fail_notification).
--   These are transactional service emails (about the owner's own account), not marketing: an unsubscribe does
--   not block them, a hard bounce or spam complaint does.

create type public.notification_kind as enum (
  'verification_reminder',       -- annual re-verification coming due
  'verification_lapsed',         -- verification lapsed; grace period started
  'featured_grace_reminder',     -- grace period running out
  'featured_ended_unverified',   -- grace ran out; Featured placements ended
  'placement_renewal_reminder',  -- Featured placement ends soon
  'listing_renewal_reminder',    -- fixed-term (non-subscription) Enhanced listing ends soon
  'staff_no_contact_alert');     -- a grace-period step happened but the business has nobody to email
create type public.notification_status as enum ('queued', 'sending', 'sent', 'failed', 'cancelled');

-- Per-tenant policy knobs.
create table public.tenant_policies (
  tenant_id uuid primary key references public.tenants on delete cascade,
  verification_grace_days int   not null default 14 check (verification_grace_days >= 0),
  reverify_reminder_days  int[] not null default '{30,14,7}',   -- days before reverify_due_at
  grace_reminder_days     int[] not null default '{7,1}',       -- days before grace ends
  renewal_reminder_days   int   not null default 14 check (renewal_reminder_days >= 0),
  updated_at timestamptz not null default now()
);
create trigger tenant_policies_touch before update on public.tenant_policies for each row execute function app.touch_updated_at();
insert into public.tenant_policies (tenant_id) select id from public.tenants on conflict do nothing;
create function app.seed_tenant_policies() returns trigger language plpgsql as $$
begin insert into public.tenant_policies (tenant_id) values (new.id) on conflict do nothing; return new; end $$;
create trigger tenants_seed_policies after insert on public.tenants for each row execute function app.seed_tenant_policies();

create table public.verification_grace (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  business_id uuid not null,
  started_at  timestamptz not null default now(),
  ends_at     timestamptz not null,
  resolved_at timestamptz,
  resolution  text check (resolution in ('reverified', 'ended', 'nothing_to_end')),
  check (ends_at >= started_at),
  check ((resolved_at is null) = (resolution is null)),
  unique (id, tenant_id),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);
create unique index verification_grace_one_open on public.verification_grace (business_id) where resolved_at is null;
create index verification_grace_due on public.verification_grace (ends_at) where resolved_at is null;

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  kind          public.notification_kind not null,
  business_id   uuid,
  recipient_email text not null,                -- snapshot at enqueue time
  recipient_user_id uuid references auth.users on delete set null,
  payload       jsonb not null default '{}'::jsonb,   -- everything the template needs; no secrets
  dedupe_key    text not null unique,           -- makes enqueueing idempotent
  status        public.notification_status not null default 'queued',
  send_after    timestamptz not null default now(),
  attempts      int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until  timestamptz,
  last_error    text,
  provider_message_id text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  foreign key (business_id, tenant_id) references public.businesses (id, tenant_id) on delete cascade
);
create index notifications_pending on public.notifications (next_attempt_at) where status in ('queued', 'sending');
create index notifications_business on public.notifications (business_id, created_at desc);

-- Re-arm renewal reminders when a window is extended.
create function app.rearm_placement_reminder() returns trigger language plpgsql as $$
begin
  if new.end_at > old.end_at then new.renewal_reminder_sent_at := null; end if;
  return new;
end $$;
create function app.rearm_listing_reminder() returns trigger language plpgsql as $$
begin
  if new.ends_at is distinct from old.ends_at and (new.ends_at is null or old.ends_at is null or new.ends_at > old.ends_at) then
    new.renewal_reminder_sent_at := null;
  end if;
  return new;
end $$;
create trigger placements_rearm before update on public.placements for each row execute function app.rearm_placement_reminder();
create trigger listings_rearm   before update on public.listings   for each row execute function app.rearm_listing_reminder();

-- Recipients: the business's owners; if it has none (e.g. the owner was just removed), fall back to the
-- business email and the primary CRM contact so a lapse never goes silent.
create function app.business_recipients(p_business uuid) returns table (email text, uid uuid)
language plpgsql stable security definer set search_path = '' as $$
declare b public.businesses;
begin
  select * into b from public.businesses where id = p_business;
  return query
    select distinct on (lower(x.e)) x.e, x.u from (
      select u.email::text as e, o.user_id as u from public.business_owners o join auth.users u on u.id = o.user_id
       where o.business_id = p_business and u.email is not null
      union all
      select b.email::text, null::uuid where b.email is not null
         and not exists (select 1 from public.business_owners where business_id = p_business)
      union all
      select c.email::text, null::uuid from public.contacts c
       where c.business_id = p_business and c.is_primary and c.email is not null
         and not exists (select 1 from public.business_owners where business_id = p_business)
    ) x order by lower(x.e);
end $$;

-- Queues one email per recipient. Returns rows actually queued (0 if none exist OR all were already queued).
create function app.enqueue_business_notification(
  p_business uuid, p_kind public.notification_kind, p_payload jsonb, p_dedupe text, p_send_after timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare b public.businesses; r record; n int := 0; v int;
begin
  select * into b from public.businesses where id = p_business;
  if not found then return 0; end if;
  for r in select * from app.business_recipients(p_business) loop
    insert into public.notifications (tenant_id, kind, business_id, recipient_email, recipient_user_id, payload, dedupe_key, send_after, next_attempt_at)
    values (b.tenant_id, p_kind, p_business, r.email, r.uid, p_payload, p_dedupe || ':' || lower(r.email), p_send_after, p_send_after)
    on conflict (dedupe_key) do nothing;
    get diagnostics v = row_count; n := n + v;
  end loop;
  return n;
end $$;

-- Staff (admin + sales) of the business's tenant. Used when a grace-period step has nobody to email, so that
-- a human can phone or visit. Each staff address is queued once per step.
create function app.enqueue_staff_alert(p_business uuid, p_payload jsonb, p_dedupe text) returns int
language plpgsql security definer set search_path = '' as $$
declare b public.businesses; r record; n int := 0; v int;
begin
  select * into b from public.businesses where id = p_business;
  if not found then return 0; end if;
  for r in select distinct on (lower(u.email)) u.email::text as email, s.user_id as uid
           from public.tenant_staff s join auth.users u on u.id = s.user_id
           where s.tenant_id = b.tenant_id and s.role in ('admin', 'sales') and u.email is not null
           order by lower(u.email) loop
    insert into public.notifications (tenant_id, kind, business_id, recipient_email, recipient_user_id, payload, dedupe_key)
    values (b.tenant_id, 'staff_no_contact_alert', p_business, r.email, r.uid,
            p_payload || jsonb_build_object('business_id', p_business, 'business_name', b.name, 'business_slug', b.slug, 'reason', 'no_contact'),
            p_dedupe || ':staff:' || lower(r.email))
    on conflict (dedupe_key) do nothing;
    get diagnostics v = row_count; n := n + v;
  end loop;
  return n;
end $$;

-- Email the business if anyone can be reached; otherwise alert staff with the same facts.
create function app.notify_business_or_alert_staff(p_business uuid, p_kind public.notification_kind, p_payload jsonb, p_dedupe text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from app.business_recipients(p_business)) then
    perform app.enqueue_business_notification(p_business, p_kind, p_payload, p_dedupe);
  else
    perform app.enqueue_staff_alert(p_business, p_payload || jsonb_build_object('original_kind', p_kind), p_dedupe);
  end if;
end $$;

create function app.active_placements_json(p_business uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slot_type', slot_type, 'category_id', category_id, 'community_id', community_id,
                                               'start_at', start_at, 'end_at', end_at, 'source', source) order by start_at), '[]'::jsonb)
  from public.placements where business_id = p_business and status = 'active' and end_at > now()
$$;

create function app.start_verification_grace(p_business uuid) returns void language plpgsql security definer set search_path = '' as $$
declare b public.businesses; pol public.tenant_policies; g uuid; v_ends timestamptz;
begin
  if not exists (select 1 from public.placements where business_id = p_business and status = 'active' and end_at > now()) then
    return;                                            -- nothing Featured, nothing at risk
  end if;
  select * into b from public.businesses where id = p_business;
  select * into pol from public.tenant_policies where tenant_id = b.tenant_id;
  v_ends := now() + make_interval(days => pol.verification_grace_days);
  insert into public.verification_grace (tenant_id, business_id, ends_at) values (b.tenant_id, p_business, v_ends)
  on conflict (business_id) where resolved_at is null do nothing
  returning id into g;
  if g is null then return; end if;                    -- already in a grace period
  perform app.notify_business_or_alert_staff(p_business, 'verification_lapsed',
    jsonb_build_object('grace_id', g, 'business_name', b.name, 'business_slug', b.slug, 'ends_at', v_ends,
                       'grace_days', pol.verification_grace_days, 'placements', app.active_placements_json(p_business)),
    'grace:' || g || ':start');
end $$;

create function app.resolve_verification_grace(p_business uuid, p_resolution text) returns void
language plpgsql security definer set search_path = '' as $$
declare g uuid;
begin
  update public.verification_grace set resolved_at = now(), resolution = p_resolution
   where business_id = p_business and resolved_at is null returning id into g;
  if g is not null then                                 -- drop reminders that no longer apply
    update public.notifications set status = 'cancelled', last_error = 'grace period resolved: ' || p_resolution
     where dedupe_key like 'grace:' || g || ':%' and status in ('queued', 'failed');
  end if;
end $$;

-- Closes grace periods that ran out: ends the business's placements (paid AND comped: verification applies to all).
create function app.end_expired_graces(p_now timestamptz default now()) returns int language plpgsql security definer set search_path = '' as $$
declare g record; n int; total int := 0; b public.businesses; credit int;
begin
  for g in select * from public.verification_grace where resolved_at is null and ends_at <= p_now loop
    select * into b from public.businesses where id = g.business_id;
    credit := app.credit_ended_placements(g.id, p_now);          -- BEFORE the placements are cut short
    update public.placements
       set end_at = case when start_at < p_now then p_now else end_at end,
           status = case when start_at < p_now then status else 'cancelled' end
     where business_id = g.business_id and status = 'active' and end_at > p_now;
    get diagnostics n = row_count;
    update public.verification_grace set resolved_at = p_now, resolution = case when n > 0 then 'ended' else 'nothing_to_end' end where id = g.id;
    update public.notifications set status = 'cancelled', last_error = 'grace period ended'
     where dedupe_key like 'grace:' || g.id || ':r%' and status in ('queued', 'failed');
    if n > 0 then
      perform app.notify_business_or_alert_staff(g.business_id, 'featured_ended_unverified',
        jsonb_build_object('grace_id', g.id, 'business_name', b.name, 'business_slug', b.slug, 'placements_ended', n,
                           'credit_cents', credit),
        'grace:' || g.id || ':ended');
      total := total + 1;
    end if;
  end loop;
  return total;
end $$;

-- Daily job. Idempotent: dedupe keys make a re-run (or a late run) harmless. For every reminder ladder only the
-- step closest to the deadline is sent, so a late run never produces a burst.
create function app.run_daily_maintenance(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; d int; q int; before_n bigint; after_n bigint; ended int; expired int;
begin
  select count(*) into before_n from public.notifications;

  expired := app.expire_verifications();                 -- may start grace periods

  -- 1. grace period running out
  for r in select g.*, p.grace_reminder_days from public.verification_grace g
           join public.tenant_policies p on p.tenant_id = g.tenant_id
           where g.resolved_at is null and g.ends_at > p_now loop
    select min(x) into d from unnest(r.grace_reminder_days) x where r.ends_at - make_interval(days => x) <= p_now;
    if d is not null then
      perform app.notify_business_or_alert_staff(r.business_id, 'featured_grace_reminder',
        jsonb_build_object('grace_id', r.id, 'ends_at', r.ends_at, 'days_left', d,
                           'business_name', (select name from public.businesses where id = r.business_id),
                           'placements', app.active_placements_json(r.business_id)),
        'grace:' || r.id || ':r' || d);
    end if;
  end loop;

  -- 2. grace ran out: end placements
  ended := app.end_expired_graces(p_now);

  -- 3. annual re-verification coming due
  for r in select b.id, b.name, b.reverify_due_at, p.reverify_reminder_days from public.businesses b
           join public.tenant_policies p on p.tenant_id = b.tenant_id
           where b.verification_level <> 'none' and b.reverify_due_at > p_now loop
    select min(x) into d from unnest(r.reverify_reminder_days) x where r.reverify_due_at - make_interval(days => x) <= p_now;
    if d is not null then
      perform app.enqueue_business_notification(r.id, 'verification_reminder',
        jsonb_build_object('business_name', r.name, 'due_at', r.reverify_due_at, 'days_left', d),
        'reverify:' || r.id || ':' || to_char(r.reverify_due_at, 'YYYYMMDD') || ':' || d);
    end if;
  end loop;

  -- 4. renewal reminders: only for fixed-term terms (auto_renews = false); subscriptions renew via Stripe
  for r in select p.id, p.business_id, p.end_at from public.placements p
           join public.tenant_policies t on t.tenant_id = p.tenant_id
           where p.status = 'active' and not p.auto_renews and p.renewal_reminder_sent_at is null and p.end_at > p_now
             and p.end_at - make_interval(days => t.renewal_reminder_days) <= p_now loop
    q := app.enqueue_business_notification(r.business_id, 'placement_renewal_reminder',
        jsonb_build_object('placement_id', r.id, 'ends_at', r.end_at, 'business_name', (select name from public.businesses where id = r.business_id)),
        'placement-renewal:' || r.id || ':' || to_char(r.end_at, 'YYYYMMDDHH24MI'));
    update public.placements set renewal_reminder_sent_at = p_now where id = r.id;
  end loop;
  for r in select l.id, l.business_id, l.ends_at from public.listings l
           join public.tenant_policies t on t.tenant_id = l.tenant_id
           where l.status = 'active' and not l.auto_renews and l.ends_at is not null
             and l.renewal_reminder_sent_at is null and l.ends_at > p_now
             and l.ends_at - make_interval(days => t.renewal_reminder_days) <= p_now loop
    q := app.enqueue_business_notification(r.business_id, 'listing_renewal_reminder',
        jsonb_build_object('listing_id', r.id, 'ends_at', r.ends_at, 'business_name', (select name from public.businesses where id = r.business_id)),
        'listing-renewal:' || r.id || ':' || to_char(r.ends_at, 'YYYYMMDDHH24MI'));
    update public.listings set renewal_reminder_sent_at = p_now where id = r.id;
  end loop;

  select count(*) into after_n from public.notifications;
  return jsonb_build_object('verifications_expired', expired, 'graces_ended', ended, 'notifications_queued', after_n - before_n);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Worker contract (service role only). The worker: claim -> send -> complete | fail.
-- ---------------------------------------------------------------------------------------------
-- Hard bounces and spam complaints block even transactional mail; an unsubscribe does not.
create function app.transactional_blocked(p_tenant uuid, p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.suppressions s where s.tenant_id = p_tenant and lower(s.email) = lower(p_email)
                 and s.reason in ('bounce', 'complaint'))
$$;

create function app.claim_notifications(p_limit int default 20, p_lease interval default interval '5 minutes')
returns setof public.notifications language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications n set status = 'cancelled', last_error = 'suppressed: bounce or complaint'
   where n.status in ('queued', 'sending') and app.transactional_blocked(n.tenant_id, n.recipient_email);
  return query
    with c as (
      select id from public.notifications
       where (status = 'queued' or (status = 'sending' and locked_until < now()))      -- expired lease = crashed worker
         and next_attempt_at <= now() and send_after <= now()
       order by next_attempt_at limit p_limit for update skip locked)
    update public.notifications n
       set status = 'sending', locked_until = now() + p_lease, attempts = n.attempts + 1
      from c where n.id = c.id
    returning n.*;
end $$;

create function app.complete_notification(p_id uuid, p_provider_message_id text default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set status = 'sent', sent_at = now(), locked_until = null, last_error = null,
         provider_message_id = p_provider_message_id where id = p_id
$$;

-- Retries with backoff (1m, 5m, 30m, 2h); after 5 attempts the row stays 'failed' for staff to see.
create function app.fail_notification(p_id uuid, p_error text) returns void language plpgsql security definer set search_path = '' as $$
declare a int;
begin
  select attempts into a from public.notifications where id = p_id;
  if a >= 5 then
    update public.notifications set status = 'failed', locked_until = null, last_error = left(p_error, 500) where id = p_id;
  else
    update public.notifications set status = 'queued', locked_until = null, last_error = left(p_error, 500),
           next_attempt_at = now() + (case a when 1 then interval '1 minute' when 2 then interval '5 minutes'
                                          when 3 then interval '30 minutes' else interval '2 hours' end)
     where id = p_id;
  end if;
end $$;

-- Only the worker/maintenance functions are locked to the service role. Do NOT blanket-revoke the `app` schema:
-- RLS policy expressions call app.is_staff() etc. with the caller's privileges.
revoke execute on function
  app.claim_notifications(int, interval), app.complete_notification(uuid, text), app.fail_notification(uuid, text),
  app.run_daily_maintenance(timestamptz), app.enqueue_business_notification(uuid, public.notification_kind, jsonb, text, timestamptz),
  app.start_verification_grace(uuid), app.resolve_verification_grace(uuid, text), app.end_expired_graces(timestamptz),
  app.transactional_blocked(uuid, text), app.active_placements_json(uuid), app.business_recipients(uuid),
  app.enqueue_staff_alert(uuid, jsonb, text), app.notify_business_or_alert_staff(uuid, public.notification_kind, jsonb, text)
  from public, anon, authenticated;
grant execute on function
  app.claim_notifications(int, interval), app.complete_notification(uuid, text), app.fail_notification(uuid, text),
  app.run_daily_maintenance(timestamptz), app.enqueue_business_notification(uuid, public.notification_kind, jsonb, text, timestamptz),
  app.start_verification_grace(uuid), app.resolve_verification_grace(uuid, text), app.end_expired_graces(timestamptz)
  to service_role;
