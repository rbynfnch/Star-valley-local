-- Email delivery worker: the contract the server job uses (public wrappers, service role only), bounce/complaint intake,
-- and a staff view of the queue. The outbox itself (notifications, claim/complete/fail) is in …1200_grace_notifications.
-- The worker only ever sends TRANSACTIONAL service mail to business owners and staff (about their own account).

-- ---------------------------------------------------------------------------------------------------------------- worker
-- Claims up to p_limit due emails and returns everything a template needs, so the worker makes no other database calls.
create function public.email_claim_batch(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'limit must be 1 to 100' using errcode = '22023'; end if;
  update public.notifications n set status = 'cancelled', last_error = 'business archived'      -- never email about a business that was taken down
   where n.status in ('queued', 'sending') and n.business_id is not null
     and exists (select 1 from public.businesses b where b.id = n.business_id and b.status = 'archived');
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'kind', c.kind, 'recipient_email', c.recipient_email, 'attempts', c.attempts, 'payload', c.payload, 'created_at', c.created_at,
      'tenant', jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'mailing_address', t.mailing_address, 'contact_email', t.contact_email, 'timezone', t.timezone,
                                   'domain', (select d.domain from public.tenant_domains d where d.tenant_id = t.id order by d.is_primary desc, d.domain limit 1)),
      'business', case when b.id is null then null else jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name) end) order by c.created_at), '[]'::jsonb)
    into v
    from app.claim_notifications(p_limit) c
    join public.tenants t on t.id = c.tenant_id
    left join public.businesses b on b.id = c.business_id;
  return v;
end $$;

create function public.email_complete(p_id uuid, p_message_id text default null) returns void
language sql security definer set search_path = '' as $$ select app.complete_notification(p_id, left(p_message_id, 200)) $$;

-- Transient failures retry with backoff (app.fail_notification); a permanent one (bad address, rejected content) fails at once.
create function public.email_fail(p_id uuid, p_error text, p_permanent boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_permanent then
    update public.notifications set status = 'failed', locked_until = null, last_error = left(coalesce(p_error, 'permanent failure'), 500)
     where id = p_id and status = 'sending';
  else
    perform app.fail_notification(p_id, coalesce(p_error, 'unknown error'));
  end if;
end $$;

create function public.email_run_maintenance() returns jsonb
language sql security definer set search_path = '' as $$ select app.run_daily_maintenance(now()) $$;

-- A hard bounce, spam complaint or unsubscribe reported by the provider. p_tenant null = the address is bad everywhere
-- (a bounce is a fact about the address, so every tenant stops mailing it). Idempotent; never downgrades a stronger reason.
create function public.record_email_suppression(p_tenant uuid, p_email text, p_reason text, p_audience public.email_audience default null) returns int
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); t record; n int := 0; v int;
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email) > 254 then raise exception 'not an email address' using errcode = '22023'; end if;
  if p_reason not in ('bounce', 'complaint', 'unsubscribe') then raise exception 'unknown suppression reason' using errcode = '22023'; end if;
  for t in select id from public.tenants where p_tenant is null or id = p_tenant loop
    if p_reason = 'unsubscribe' and p_audience is not null then
      insert into public.suppressions (tenant_id, email, audience, reason) values (t.id, v_email, p_audience, p_reason)
        on conflict (tenant_id, lower(email), audience) where audience is not null do nothing;
    else                                                                  -- bounce, complaint, or an all-mail unsubscribe
      insert into public.suppressions (tenant_id, email, audience, reason) values (t.id, v_email, null, p_reason)
        on conflict (tenant_id, lower(email)) where audience is null
        do update set reason = case when public.suppressions.reason in ('bounce', 'complaint') then public.suppressions.reason else excluded.reason end;
    end if;
    get diagnostics v = row_count; n := n + v;
  end loop;
  if p_reason in ('bounce', 'complaint') then                             -- anything still waiting for this address will not be sent
    update public.notifications set status = 'cancelled', last_error = 'suppressed: ' || p_reason
     where lower(recipient_email) = v_email and status in ('queued', 'sending') and (p_tenant is null or tenant_id = p_tenant);
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------------------------- staff view
create function public.admin_email_queue(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  select jsonb_build_object(
    'counts', (select jsonb_build_object(
        'queued', count(*) filter (where status in ('queued', 'sending')),
        'failed', count(*) filter (where status = 'failed'),
        'sent_7d', count(*) filter (where status = 'sent' and sent_at > now() - interval '7 days'),
        'cancelled_7d', count(*) filter (where status = 'cancelled' and created_at > now() - interval '7 days'))
      from public.notifications where tenant_id = p_tenant),
    'rows', coalesce((select jsonb_agg(r order by r.sort_key, r.created_at desc) from (
        select case when n.status = 'failed' then 0 when n.status in ('queued', 'sending') then 1 else 2 end as sort_key, n.created_at,
               jsonb_build_object('id', n.id, 'kind', n.kind, 'status', n.status, 'recipient_email', n.recipient_email, 'business_id', n.business_id, 'business_name', b.name,
                                  'attempts', n.attempts, 'last_error', n.last_error, 'created_at', n.created_at, 'send_after', n.send_after, 'sent_at', n.sent_at) as r
          from public.notifications n left join public.businesses b on b.id = n.business_id
         where n.tenant_id = p_tenant order by case when n.status = 'failed' then 0 when n.status in ('queued', 'sending') then 1 else 2 end, n.created_at desc limit 50) r), '[]'::jsonb))
    into v;
  return v;
end $$;

create function public.retry_notification(p_tenant uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  update public.notifications set status = 'queued', attempts = 0, next_attempt_at = now(), locked_until = null, last_error = null
   where id = p_id and tenant_id = p_tenant and status = 'failed';
  if not found then raise exception 'only a failed email can be retried' using errcode = '22023'; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['email_claim_batch(int)', 'email_complete(uuid, text)', 'email_fail(uuid, text, boolean)', 'email_run_maintenance()',
                           'record_email_suppression(uuid, text, text, public.email_audience)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['admin_email_queue(uuid)', 'retry_notification(uuid, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
