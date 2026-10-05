-- Owner dashboard (V2). Owners already had row-level rights to their own business rows and (for Enhanced listings) their services, links,
-- FAQs and deals; the staff content functions were simply closed to them. This opens the SAME functions to the business's own owners,
-- with the rules that make sense for an owner:
--   * the functions still run as the caller, so row-level security stays the real gate (Enhanced-only content is unwritable on Free);
--   * owners cannot change legal name, community or category (staff only) and, on a Free listing, not the Enhanced-only fields;
--   * photos: a Free listing may hold two (logo and cover), an Enhanced one thirty, enforced by a trigger so direct table writes obey it too;
--   * uploaded files must sit in the business's own storage folder (policy), and provenance records the owner as the source.
--   owner_dashboard           the businesses the caller owns, with plan, verification and new-lead counts
--   owner_business_activity   the 30-day performance numbers for an owned business (same payload staff see)

create or replace function app.content_guard(p_tenant uuid, p_business uuid) returns void
language plpgsql stable security invoker set search_path = public as $$
begin
  if not (app.has_role(p_tenant, '{sales}') or app.owns_business(p_business)) then raise exception 'sales staff or the business owner only' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_business and tenant_id = p_tenant) then raise exception 'business not found' using errcode = 'P0002'; end if;
end $$;

do $$
declare d text;
begin
  -- update_business_fields: open to owners, with the owner rules
  select pg_get_functiondef('public.update_business_fields(uuid, uuid, jsonb)'::regprocedure) into d;
  d := replace(d, $q$  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;$q$,
$q$  if not app.has_role(p_tenant, '{sales}') then
    if not app.owns_business(p_business) then raise exception 'sales staff or the business owner only' using errcode = '42501'; end if;
    if p_fields ?| array['legal_name', 'home_community_id', 'primary_category_id'] then raise exception 'ask us to change the legal name, community or category' using errcode = '22023'; end if;
    if not app.business_is_enhanced(p_business) and p_fields ?| array['description', 'highlights', 'email'] then
      raise exception 'the long description, highlights and public email are part of an Enhanced listing' using errcode = '22023';
    end if;
  end if;$q$);
  execute d;

  -- add_business_photo: the owner's photo limit, and the right provenance
  select pg_get_functiondef('public.add_business_photo(uuid, uuid, text, text, text, int, int, bigint, public.photo_role, text)'::regprocedure) into d;
  d := replace(d, $q$  if (select count(*) from public.business_photos where business_id = p_business) >= 30 then raise exception 'a business can have at most 30 photos' using errcode = '22023'; end if;$q$,
$q$  if (select count(*) from public.business_photos where business_id = p_business and (p_role not in ('logo', 'cover') or role <> p_role))
       >= (case when app.has_role(p_tenant, '{sales}') or app.business_is_enhanced(p_business) then 30 else 2 end) then
    raise exception 'a Free listing holds a logo and a cover photo; more photos are part of Enhanced' using errcode = '22023';
  end if;$q$);
  d := replace(d, $q$(select auth.uid())) returning id into v_id;$q$, $q$(select auth.uid())) returning id into v_id;$q$);
  d := replace(d, $q$nullif(btrim(coalesce(p_caption, '')), ''), v_sort, 'admin', (select auth.uid()))$q$, $q$nullif(btrim(coalesce(p_caption, '')), ''), v_sort, app.write_source(p_tenant, p_business), (select auth.uid()))$q$);
  execute d;

  -- owner_business_activity: the staff activity function, for the owner of that business
  select pg_get_functiondef('public.admin_business_activity(uuid, uuid, int)'::regprocedure) into d;
  d := replace(d, 'public.admin_business_activity', 'public.owner_business_activity');
  d := replace(d, $q$if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;$q$,
                   $q$if not (app.has_role(p_tenant, '{sales}') or app.owns_business(p_business)) then raise exception 'owners and sales staff only' using errcode = '42501'; end if;$q$);
  execute d;
end $$;

-- Free listings: at most two photos even when rows are written straight to the table. Staff are exempt.
create function app.photos_limit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.is_staff(new.tenant_id) or (select auth.uid()) is null or pg_trigger_depth() >= 2 then return new; end if;
  if (select count(*) from public.business_photos where business_id = new.business_id) >= (case when app.business_is_enhanced(new.business_id) then 30 else 2 end) then
    raise exception 'a Free listing holds a logo and a cover photo; more photos are part of Enhanced' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger business_photos_limit before insert on public.business_photos for each row execute function app.photos_limit();

-- Uploaded files must sit in the business's own folder of the media bucket.
drop policy media_insert on public.media_assets;
create policy media_insert on public.media_assets for insert to authenticated
  with check (app.is_staff(tenant_id) or (business_id is not null and app.owns_business(business_id) and storage_bucket = 'media'
                                          and storage_path like tenant_id::text || '/' || business_id::text || '/%' and storage_path !~ '(^|/)\.\.?(/|$)'));

create function public.owner_dashboard(p_tenant uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if (select auth.uid()) is null then raise exception 'sign in first' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'name', b.name, 'status', b.status, 'verification_level', b.verification_level, 'verified_at', b.verified_at, 'reverify_due_at', b.reverify_due_at,
      'city', b.city, 'community_id', b.home_community_id,
      'tier', case when app.business_is_enhanced(b.id) then 'enhanced' else 'free' end,
      'listing_ends_at', (select l.ends_at from public.listings l where l.business_id = b.id and l.status = 'active' order by l.starts_at desc limit 1),
      'new_leads', (select count(*) from public.leads x where x.business_id = b.id and x.status = 'new'),
      'has_postcard_pending', exists (select 1 from public.postcard_codes c where c.business_id = b.id and c.status = 'issued' and c.issued_at > now() - interval '90 days')
    ) order by b.name)
    from public.businesses b where b.tenant_id = p_tenant and app.owns_business(b.id)), '[]'::jsonb);
end $$;

revoke all on function public.owner_dashboard(uuid), public.owner_business_activity(uuid, uuid, int) from public, anon;
grant execute on function public.owner_dashboard(uuid), public.owner_business_activity(uuid, uuid, int) to authenticated, service_role;
