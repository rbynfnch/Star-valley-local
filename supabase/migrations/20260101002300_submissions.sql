-- Suggest an Update / Suggest a Business / Submit an Event -> one moderation queue (CLAUDE.md §4, §8).
--
-- submission_create  (service_role only; the server has already verified a Cloudflare Turnstile token): validates the payload
--   per kind against a strict whitelist, caps volume, and inserts a PENDING row. Nothing a visitor submits is published, applied
--   or created as a business until staff approve it.
-- review_submission  (staff): approve / reject / spam. Approving can create a hidden prospect (business), publish an event, or
--   apply suggested field changes (update). Role rules: sales/admin create and edit businesses; editor/admin publish events;
--   every moderator may reject or mark spam.
-- admin_list_submissions (staff): the queue.
--
-- Limits: <=200 submissions per tenant per day; <=5 per email per day; <=10 pending updates per business.
create function public.submission_create(
  p_tenant uuid, p_kind public.submission_kind, p_business uuid, p_payload jsonb,
  p_name text, p_email text, p_phone text, p_user uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  k text; f text; v_payload jsonb; v_fields jsonb; v_id uuid; b public.businesses%rowtype;
  v_name text := left(nullif(btrim(coalesce(p_name, '')), ''), 100);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := left(nullif(btrim(coalesce(p_phone, '')), ''), 40);
  v_start timestamptz; v_end timestamptz; v_site text;
  allowed text[];
  fields_allowed text[] := array['name','address_line1','city','phone','website','hours'];
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid submission' using errcode = '22023'; end if;
  allowed := case p_kind
    when 'update'   then array['fields','note','closed']
    when 'business' then array['name','address_line1','city','phone','website','category_text','category_id','community_id','description','note']
    else                 array['title','description','starts_at','ends_at','all_day','venue_name','address','community_id','url','organizer','note'] end;
  for k in select jsonb_object_keys(p_payload) loop
    if not (k = any (allowed)) then raise exception 'unknown field: %', k using errcode = '22023'; end if;
  end loop;
  if v_email is not null and (v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email) > 254) then raise exception 'that email address does not look right' using errcode = '22023'; end if;

  -- text helper: every text value must be a string (or absent), is trimmed and length-capped; empty becomes absent
  -- (done inline below with left(nullif(btrim(...),''), n))
  if p_kind = 'update' then
    select * into b from public.businesses where id = p_business and tenant_id = p_tenant and status in ('unclaimed', 'claimed');
    if not found then raise exception 'business not found' using errcode = 'P0002'; end if;
    v_fields := coalesce(p_payload -> 'fields', '{}'::jsonb);
    if jsonb_typeof(v_fields) <> 'object' then raise exception 'invalid submission' using errcode = '22023'; end if;
    for f in select jsonb_object_keys(v_fields) loop
      if not (f = any (fields_allowed)) then raise exception 'unknown field: %', f using errcode = '22023'; end if;
    end loop;
    v_site := nullif(btrim(coalesce(v_fields ->> 'website', '')), '');
    if v_site is not null and (v_site !~* '^https?://[^\s]+$' or length(v_site) > 300) then raise exception 'website must be a full http(s) address' using errcode = '22023'; end if;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'fields', jsonb_strip_nulls(jsonb_build_object(
          'name', left(nullif(btrim(coalesce(v_fields ->> 'name', '')), ''), 200),
          'address_line1', left(nullif(btrim(coalesce(v_fields ->> 'address_line1', '')), ''), 200),
          'city', left(nullif(btrim(coalesce(v_fields ->> 'city', '')), ''), 100),
          'phone', left(nullif(btrim(coalesce(v_fields ->> 'phone', '')), ''), 40),
          'website', v_site,
          'hours', left(nullif(btrim(coalesce(v_fields ->> 'hours', '')), ''), 300))),
      'note', left(nullif(btrim(coalesce(p_payload ->> 'note', '')), ''), 1000),
      'closed', case when (p_payload ->> 'closed') = 'true' then true end));
    if (v_payload -> 'fields') = '{}'::jsonb and not (v_payload ? 'note') and not (v_payload ? 'closed') then raise exception 'tell us what to change' using errcode = '22023'; end if;
    if (select count(*) from public.submissions where business_id = p_business and kind = 'update' and status = 'pending') >= 10 then
      raise exception 'there are already several pending suggestions for this business' using errcode = '53400';
    end if;
  elsif p_kind = 'business' then
    p_business := null;
    if nullif(btrim(coalesce(p_payload ->> 'name', '')), '') is null then raise exception 'the business needs a name' using errcode = '22023'; end if;
    if v_email is null then raise exception 'an email address is required so we can follow up' using errcode = '22023'; end if;
    v_site := nullif(btrim(coalesce(p_payload ->> 'website', '')), '');
    if v_site is not null and (v_site !~* '^https?://[^\s]+$' or length(v_site) > 300) then raise exception 'website must be a full http(s) address' using errcode = '22023'; end if;
    if nullif(p_payload ->> 'community_id', '') is not null and not exists (select 1 from public.communities where id = (p_payload ->> 'community_id')::uuid and tenant_id = p_tenant) then raise exception 'unknown community' using errcode = '22023'; end if;
    if nullif(p_payload ->> 'category_id', '') is not null and not exists (select 1 from public.categories where id = (p_payload ->> 'category_id')::uuid and tenant_id = p_tenant) then raise exception 'unknown category' using errcode = '22023'; end if;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'name', left(btrim(p_payload ->> 'name'), 200),
      'address_line1', left(nullif(btrim(coalesce(p_payload ->> 'address_line1', '')), ''), 200),
      'city', left(nullif(btrim(coalesce(p_payload ->> 'city', '')), ''), 100),
      'phone', left(nullif(btrim(coalesce(p_payload ->> 'phone', '')), ''), 40),
      'website', v_site,
      'category_text', left(nullif(btrim(coalesce(p_payload ->> 'category_text', '')), ''), 100),
      'category_id', nullif(p_payload ->> 'category_id', ''),
      'community_id', nullif(p_payload ->> 'community_id', ''),
      'description', left(nullif(btrim(coalesce(p_payload ->> 'description', '')), ''), 500),
      'note', left(nullif(btrim(coalesce(p_payload ->> 'note', '')), ''), 1000)));
  else  -- event
    p_business := null;
    if nullif(btrim(coalesce(p_payload ->> 'title', '')), '') is null then raise exception 'the event needs a title' using errcode = '22023'; end if;
    if v_email is null then raise exception 'an email address is required so we can follow up' using errcode = '22023'; end if;
    begin v_start := (p_payload ->> 'starts_at')::timestamptz; exception when others then raise exception 'the start time is not valid' using errcode = '22023'; end;
    if v_start is null then raise exception 'the event needs a start time' using errcode = '22023'; end if;
    if v_start < now() - interval '1 day' or v_start > now() + interval '2 years' then raise exception 'the start time must be within the next two years' using errcode = '22023'; end if;
    if nullif(p_payload ->> 'ends_at', '') is not null then
      begin v_end := (p_payload ->> 'ends_at')::timestamptz; exception when others then raise exception 'the end time is not valid' using errcode = '22023'; end;
      if v_end < v_start then raise exception 'the event cannot end before it starts' using errcode = '22023'; end if;
    end if;
    v_site := nullif(btrim(coalesce(p_payload ->> 'url', '')), '');
    if v_site is not null and (v_site !~* '^https?://[^\s]+$' or length(v_site) > 300) then raise exception 'the link must be a full http(s) address' using errcode = '22023'; end if;
    if nullif(p_payload ->> 'community_id', '') is not null and not exists (select 1 from public.communities where id = (p_payload ->> 'community_id')::uuid and tenant_id = p_tenant) then raise exception 'unknown community' using errcode = '22023'; end if;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'title', left(btrim(p_payload ->> 'title'), 200),
      'description', left(nullif(btrim(coalesce(p_payload ->> 'description', '')), ''), 2000),
      'starts_at', v_start, 'ends_at', v_end,
      'all_day', case when (p_payload ->> 'all_day') = 'true' then true end,
      'venue_name', left(nullif(btrim(coalesce(p_payload ->> 'venue_name', '')), ''), 200),
      'address', left(nullif(btrim(coalesce(p_payload ->> 'address', '')), ''), 200),
      'community_id', nullif(p_payload ->> 'community_id', ''),
      'url', v_site,
      'organizer', left(nullif(btrim(coalesce(p_payload ->> 'organizer', '')), ''), 200),
      'note', left(nullif(btrim(coalesce(p_payload ->> 'note', '')), ''), 1000)));
  end if;

  if (select count(*) from public.submissions where tenant_id = p_tenant and created_at > now() - interval '1 day') >= 200
     or (v_email is not null and (select count(*) from public.submissions where tenant_id = p_tenant and lower(submitter_email) = v_email and created_at > now() - interval '1 day') >= 5) then
    raise exception 'too many submissions right now; try again later' using errcode = '53400';
  end if;
  insert into public.submissions (tenant_id, kind, business_id, payload, submitter_name, submitter_email, submitter_phone, submitter_user_id)
    values (p_tenant, p_kind, p_business, v_payload, v_name, v_email, v_phone, p_user) returning id into v_id;
  return v_id;
end $$;


-- ---------------------------------------------------------------------------------------------------------------------
create function public.review_submission(p_tenant uuid, p_id uuid, p_action text, p_notes text default null, p_apply boolean default false, p_force boolean default false) returns jsonb
language plpgsql security invoker set search_path = public, extensions as $$
declare
  s public.submissions%rowtype; v_notes text := left(nullif(btrim(coalesce(p_notes, '')), ''), 1000);
  v_status public.submission_status; v_out jsonb := '{}'::jsonb; v_changes jsonb; v_new uuid; v_dup record;
  v_slug text; v_base text; n int; p jsonb; v_title text; v_who text;
begin
  if not app.has_role(p_tenant, '{sales,editor}') then raise exception 'moderators only' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reject', 'spam') then raise exception 'unknown action' using errcode = '22023'; end if;
  select * into s from public.submissions where id = p_id and tenant_id = p_tenant for update;
  if not found then raise exception 'submission not found' using errcode = 'P0002'; end if;
  if s.status <> 'pending' then raise exception 'this submission was already reviewed' using errcode = '22023'; end if;
  p := s.payload;
  v_who := coalesce(nullif(s.submitter_name, ''), 'a visitor') || coalesce(' <' || s.submitter_email || '>', '');

  if p_action = 'approve' then
    if s.kind = 'update' then
      if p_apply then
        if not app.has_role(p_tenant, '{sales}') then raise exception 'only sales staff and admins can change a business' using errcode = '22023'; end if;
        v_changes := coalesce(p -> 'fields', '{}'::jsonb) - 'hours';           -- hours are free text here; the structured hours editor is manual
        if v_changes <> '{}'::jsonb then perform public.update_business_fields(p_tenant, s.business_id, v_changes); end if;
        v_out := jsonb_build_object('applied', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(v_changes) k), '[]'::jsonb));
      end if;
      insert into public.communications (tenant_id, business_id, kind, subject, body, staff_id)
        values (p_tenant, s.business_id, 'note', 'Suggested update ' || case when p_apply then 'applied' else 'approved' end, 'From ' || v_who || '. ' || coalesce(p ->> 'note', ''), (select auth.uid()));
    elsif s.kind = 'business' then
      if not app.has_role(p_tenant, '{sales}') then raise exception 'only sales staff and admins can add a business' using errcode = '22023'; end if;
      select d.business_id, d.reason, b.name into v_dup from app.find_duplicate_businesses(p_tenant, p ->> 'name', p ->> 'phone', p ->> 'address_line1') d
        join public.businesses b on b.id = d.business_id limit 1;
      if v_dup.business_id is not null and not p_force then
        return jsonb_build_object('result', 'duplicate', 'business_id', v_dup.business_id, 'business_name', v_dup.name, 'reason', v_dup.reason);
      end if;
      v_base := coalesce(nullif(btrim(regexp_replace(lower(p ->> 'name'), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'business'); v_base := left(v_base, 80);
      v_slug := v_base; n := 2;
      while exists (select 1 from public.businesses where tenant_id = p_tenant and slug = v_slug) loop v_slug := v_base || '-' || n; n := n + 1; end loop;
      insert into public.businesses (tenant_id, slug, name, status, home_community_id, primary_category_id, address_line1, city, phone, website, description)
        values (p_tenant, v_slug, p ->> 'name', 'prospect', nullif(p ->> 'community_id', '')::uuid, nullif(p ->> 'category_id', '')::uuid,
                p ->> 'address_line1', p ->> 'city', p ->> 'phone', p ->> 'website', p ->> 'description')
        returning id into v_new;
      insert into public.communications (tenant_id, business_id, kind, subject, body, staff_id)
        values (p_tenant, v_new, 'note', 'Suggested through the public form', 'From ' || v_who || coalesce(', phone ' || s.submitter_phone, '') || '. '
               || coalesce('Category they gave: ' || (p ->> 'category_text') || '. ', '') || coalesce(p ->> 'note', ''), (select auth.uid()));
      update public.submissions set business_id = v_new where id = s.id;
      v_out := jsonb_build_object('business_id', v_new);
    else  -- event
      if not app.has_role(p_tenant, '{editor}') then raise exception 'only editors and admins can publish an event' using errcode = '22023'; end if;
      v_title := p ->> 'title';
      v_base := left(coalesce(nullif(btrim(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'event'), 60) || '-' || to_char((p ->> 'starts_at')::timestamptz at time zone 'UTC', 'YYYYMMDD');
      v_slug := v_base; n := 2;
      while exists (select 1 from public.community_events where tenant_id = p_tenant and slug = v_slug) loop v_slug := v_base || '-' || n; n := n + 1; end loop;
      insert into public.community_events (tenant_id, slug, title, description, status, community_id, venue_name, address, starts_at, ends_at, all_day, url, submitted_by_email, created_by)
        values (p_tenant, v_slug, v_title,
                nullif(btrim(coalesce(p ->> 'description', '') || case when p ? 'organizer' then E'\n\nOrganizer: ' || (p ->> 'organizer') else '' end), ''),
                'published', nullif(p ->> 'community_id', '')::uuid, p ->> 'venue_name', p ->> 'address', (p ->> 'starts_at')::timestamptz,
                nullif(p ->> 'ends_at', '')::timestamptz, coalesce((p ->> 'all_day')::boolean, false), p ->> 'url', s.submitter_email, (select auth.uid()))
        returning id into v_new;
      v_out := jsonb_build_object('event_id', v_new, 'slug', v_slug);
    end if;
    v_status := 'approved';
  elsif p_action = 'reject' then v_status := 'rejected';
  else v_status := 'spam';
  end if;

  update public.submissions set status = v_status, reviewed_by = (select auth.uid()), reviewed_at = now(), resolution_notes = v_notes where id = s.id;
  return jsonb_build_object('result', v_status) || v_out;
end $$;

create function public.admin_list_submissions(p_tenant uuid, p_status public.submission_status default 'pending', p_kind public.submission_kind default null, p_limit int default 25, p_offset int default 0) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100); v_offset int := greatest(coalesce(p_offset, 0), 0); v_res jsonb;
begin
  if not app.has_role(p_tenant, '{sales,editor}') then raise exception 'moderators only' using errcode = '42501'; end if;
  select jsonb_build_object(
    'total', (select count(*) from public.submissions s where s.tenant_id = p_tenant and s.status = p_status and (p_kind is null or s.kind = p_kind)),
    'pending_by_kind', (select coalesce(jsonb_object_agg(kind, c), '{}'::jsonb) from (select kind, count(*) c from public.submissions where tenant_id = p_tenant and status = 'pending' group by kind) x),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id) from (
        select s.id, s.kind, s.status, s.payload, s.submitter_name, s.submitter_email, s.submitter_phone, s.created_at, s.reviewed_at, s.resolution_notes, s.business_id,
               b.name as business_name, b.slug as business_slug
          from public.submissions s left join public.businesses b on b.id = s.business_id
         where s.tenant_id = p_tenant and s.status = p_status and (p_kind is null or s.kind = p_kind)
         order by case when p_status = 'pending' then s.created_at end asc, s.created_at desc, s.id limit v_limit offset v_offset) r), '[]'::jsonb)) into v_res;
  return v_res;
end $$;

revoke all on function public.submission_create(uuid, public.submission_kind, uuid, jsonb, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.review_submission(uuid, uuid, text, text, boolean, boolean) from public, anon;
revoke all on function public.admin_list_submissions(uuid, public.submission_status, public.submission_kind, int, int) from public, anon;
grant execute on function public.submission_create(uuid, public.submission_kind, uuid, jsonb, text, text, text, uuid) to service_role;
grant execute on function public.review_submission(uuid, uuid, text, text, boolean, boolean) to authenticated, service_role;
grant execute on function public.admin_list_submissions(uuid, public.submission_status, public.submission_kind, int, int) to authenticated, service_role;
