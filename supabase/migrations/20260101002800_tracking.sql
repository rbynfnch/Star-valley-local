-- Event tracking ingest (CLAUDE.md §9): profile views, website / phone / directions clicks, search appearances (with the query),
-- deal and article views, quote requests. Append-only table already exists (…0700_engagement).
--
--   record_tracking   service role only, called by /api/track after bot filtering. Validates every event, drops what it
--                     cannot trust (unknown or non-public business, quote_request from the browser, staff and owners
--                     viewing their own pages), de-duplicates refreshes, caps a session's volume. Never raises for a bad
--                     EVENT (browsers send noise); raises only for a malformed request.
--   leads trigger     a quote request is recorded by the database when the lead is created, so it cannot be forged or missed.
--   admin_business_activity   staff view: totals for the last N days, the previous N for comparison, visitors, top searches.
-- No IP addresses are stored; session_hash is salted and rotates daily (computed by the server).

create function public.record_tracking(p_tenant uuid, p_events jsonb, p_session text, p_referrer text default null, p_user uuid default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  e jsonb; v_type public.tracking_type; v_biz uuid; v_deal uuid; v_art uuid; v_comm uuid; v_cat uuid; v_q text; v_surface text; v_ref text; n int := 0;
  v_dedupe interval;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then raise exception 'events must be a list' using errcode = '22023'; end if;
  if jsonb_array_length(p_events) > 50 then raise exception 'at most 50 events per request' using errcode = '22023'; end if;
  if p_session is null or p_session !~ '^[0-9a-f]{8,64}$' then raise exception 'bad session' using errcode = '22023'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant and is_active) then raise exception 'unknown tenant' using errcode = '22023'; end if;
  if p_user is not null and (exists (select 1 from public.tenant_staff where tenant_id = p_tenant and user_id = p_user)
                             or exists (select 1 from public.platform_admins where user_id = p_user)) then return 0; end if;     -- admin traffic is never counted
  if (select count(*) from public.tracking_events where session_hash = p_session and occurred_at > now() - interval '1 hour') >= 300 then return 0; end if;
  v_ref := case when lower(btrim(coalesce(p_referrer, ''))) ~ '^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$' then lower(btrim(p_referrer)) end;

  for e in select * from jsonb_array_elements(p_events) loop
    begin
      continue when jsonb_typeof(e) <> 'object';
      v_type := (e ->> 'type')::public.tracking_type;
    exception when others then continue;                                    -- unknown type: noise
    end;
    continue when v_type is null or v_type = 'quote_request';                                 -- only the database records these (leads trigger)
    v_biz := null; v_deal := null; v_art := null; v_comm := null; v_cat := null; v_q := null;
    begin
      v_biz := nullif(e ->> 'business_id', '')::uuid; v_deal := nullif(e ->> 'deal_id', '')::uuid; v_art := nullif(e ->> 'article_id', '')::uuid;
      v_comm := nullif(e ->> 'community_id', '')::uuid; v_cat := nullif(e ->> 'category_id', '')::uuid;
    exception when others then continue;
    end;
    if v_type in ('profile_view', 'website_click', 'phone_click', 'directions_click', 'search_appearance', 'deal_view') then
      continue when v_biz is null
        or not exists (select 1 from public.businesses b where b.id = v_biz and b.tenant_id = p_tenant and b.status in ('unclaimed', 'claimed'));
      continue when p_user is not null and exists (select 1 from public.business_owners o where o.business_id = v_biz and o.user_id = p_user);   -- owners do not inflate their own numbers
    end if;
    if v_type = 'deal_view' then
      continue when v_deal is null or not exists (select 1 from public.deals d where d.id = v_deal and d.business_id = v_biz and d.tenant_id = p_tenant);
    else v_deal := null; end if;
    if v_type = 'article_view' then
      continue when v_art is null or not exists (select 1 from public.articles a where a.id = v_art and a.tenant_id = p_tenant);
    else v_art := null; end if;
    if v_type not in ('profile_view', 'website_click', 'phone_click', 'directions_click', 'search_appearance', 'deal_view') then v_biz := null; end if;
    if v_comm is not null and not exists (select 1 from public.communities c where c.id = v_comm and c.tenant_id = p_tenant) then v_comm := null; end if;
    if v_cat is not null and not exists (select 1 from public.categories c where c.id = v_cat and c.tenant_id = p_tenant) then v_cat := null; end if;
    if v_type = 'search_appearance' then
      v_q := nullif(left(regexp_replace(btrim(coalesce(e ->> 'query', '')), '[\s\u0000-\u001f]+', ' ', 'g'), 200), '');
    end if;
    v_surface := case when (e ->> 'surface') in ('home', 'search', 'category', 'community', 'category_community', 'profile', 'things_to_do', 'deals') then e ->> 'surface' end;

    -- a refresh or a double click is one event
    v_dedupe := case when v_type in ('website_click', 'phone_click', 'directions_click') then interval '5 seconds' else interval '30 minutes' end;
    continue when exists (select 1 from public.tracking_events t
                           where t.session_hash = p_session and t.event_type = v_type and t.tenant_id = p_tenant and t.occurred_at > now() - v_dedupe
                             and t.business_id is not distinct from v_biz and t.deal_id is not distinct from v_deal and t.article_id is not distinct from v_art
                             and t.search_query is not distinct from v_q and t.surface is not distinct from v_surface);
    insert into public.tracking_events (tenant_id, event_type, business_id, deal_id, article_id, community_id, category_id, search_query, surface, session_hash, referrer_host)
      values (p_tenant, v_type, v_biz, v_deal, v_art, v_comm, v_cat, v_q, v_surface, p_session, v_ref);
    n := n + 1;
  end loop;
  return n;
end $$;

-- A quote request is recorded by the database the moment the lead exists.
create function app.leads_track() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tracking_events (tenant_id, event_type, business_id, surface) values (new.tenant_id, 'quote_request', new.business_id, 'profile');
  return new;
end $$;
create trigger leads_track after insert on public.leads for each row execute function app.leads_track();

-- Staff view: what a business got in the last p_days days (and the p_days before, to compare).
create function public.admin_business_activity(p_tenant uuid, p_business uuid, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  if p_days is null or p_days not between 1 and 365 then raise exception 'days must be 1 to 365' using errcode = '22023'; end if;
  if not exists (select 1 from public.businesses where id = p_business and tenant_id = p_tenant) then raise exception 'business not found' using errcode = 'P0002'; end if;
  select jsonb_build_object(
    'days', p_days,
    'current', (select coalesce(jsonb_object_agg(event_type, n), '{}'::jsonb) from (
        select event_type, count(*) n from public.tracking_events where business_id = p_business and tenant_id = p_tenant and occurred_at >= now() - make_interval(days => p_days) group by 1) c),
    'previous', (select coalesce(jsonb_object_agg(event_type, n), '{}'::jsonb) from (
        select event_type, count(*) n from public.tracking_events where business_id = p_business and tenant_id = p_tenant
           and occurred_at >= now() - make_interval(days => 2 * p_days) and occurred_at < now() - make_interval(days => p_days) group by 1) c),
    'visitors', (select count(distinct session_hash) from public.tracking_events where business_id = p_business and tenant_id = p_tenant and event_type = 'profile_view' and occurred_at >= now() - make_interval(days => p_days)),
    'top_searches', coalesce((select jsonb_agg(jsonb_build_object('query', q, 'n', n) order by n desc, q) from (
        select search_query q, count(*) n from public.tracking_events where business_id = p_business and tenant_id = p_tenant and event_type = 'search_appearance'
           and search_query is not null and occurred_at >= now() - make_interval(days => p_days) group by 1 order by 2 desc, 1 limit 5) s), '[]'::jsonb),
    'first_event_at', (select min(occurred_at) from public.tracking_events where business_id = p_business and tenant_id = p_tenant)
  ) into v;
  return v;
end $$;

revoke all on function public.record_tracking(uuid, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_tracking(uuid, jsonb, text, text, uuid) to service_role;
revoke all on function public.admin_business_activity(uuid, uuid, int) from public, anon;
grant execute on function public.admin_business_activity(uuid, uuid, int) to authenticated, service_role;
