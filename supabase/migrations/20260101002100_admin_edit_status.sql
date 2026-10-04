-- Staff edits to a business, and the publish / archive / restore lifecycle. Sales and admin only.
--
-- update_business_fields: whitelisted keys only; only keys PRESENT in p_fields change; '' clears an optional field.
--   Staff writes are recorded as source 'admin' by the provenance trigger (unchanged values leave provenance alone),
--   so later imports can never overwrite them.
-- set_business_status: prospect -> published (unclaimed, or claimed if it already has an owner), published -> archived,
--   archived -> prospect (restore, hidden). Archiving is refused while a paid listing or placement is live: end those first.
create function public.update_business_fields(p_tenant uuid, p_business uuid, p_fields jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  k text; b public.businesses%rowtype; v text;
  allowed text[] := array['name','legal_name','address_line1','address_line2','city','postal_code','phone','website','email',
                          'short_description','description','hours_note','home_community_id','primary_category_id','highlights','price_range'];
  published boolean;
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then raise exception 'fields must be an object' using errcode = '22023'; end if;
  select * into b from public.businesses where id = p_business and tenant_id = p_tenant;
  if not found then raise exception 'business not found' using errcode = 'P0002'; end if;
  for k in select jsonb_object_keys(p_fields) loop
    if not (k = any (allowed)) then raise exception 'unknown field: %', k using errcode = '22023'; end if;
    if k = 'highlights' then
      if jsonb_typeof(p_fields -> k) not in ('array', 'null') then raise exception 'highlights must be a list' using errcode = '22023'; end if;
    elsif k = 'price_range' then
      if jsonb_typeof(p_fields -> k) not in ('number', 'null') then raise exception 'price level must be a number from 0 to 3' using errcode = '22023'; end if;
    elsif jsonb_typeof(p_fields -> k) not in ('string', 'null') then raise exception 'field % must be text', k using errcode = '22023'; end if;
  end loop;
  published := b.status in ('unclaimed', 'claimed');
  if p_fields ? 'name' and nullif(btrim(coalesce(p_fields->>'name', '')), '') is null then raise exception 'name cannot be empty' using errcode = '22023'; end if;
  if published and ((p_fields ? 'home_community_id' and nullif(p_fields->>'home_community_id', '') is null)
                 or (p_fields ? 'primary_category_id' and nullif(p_fields->>'primary_category_id', '') is null)) then
    raise exception 'a published business needs a community and a category' using errcode = '22023';
  end if;
  v := nullif(btrim(coalesce(p_fields->>'website', '')), '');
  if v is not null and (v !~* '^https?://[^\s]+$' or length(v) > 300) then raise exception 'website must be a full http(s) address' using errcode = '22023'; end if;
  v := nullif(btrim(coalesce(p_fields->>'email', '')), '');
  if v is not null and (v !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v) > 254) then raise exception 'email is not valid' using errcode = '22023'; end if;
  if length(coalesce(p_fields->>'short_description', '')) > 120 then raise exception 'short description is limited to 120 characters' using errcode = '22001'; end if;
  if length(coalesce(p_fields->>'description', '')) > 1500 then raise exception 'description is limited to 1500 characters' using errcode = '22001'; end if;
  if length(coalesce(p_fields->>'name', '')) > 200 or length(coalesce(p_fields->>'phone', '')) > 40 then raise exception 'name or phone is too long' using errcode = '22001'; end if;

  if p_fields ? 'highlights' and jsonb_typeof(p_fields -> 'highlights') = 'array' then
    if jsonb_array_length(p_fields -> 'highlights') > 8 then raise exception 'at most 8 highlights' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements(p_fields -> 'highlights') e where jsonb_typeof(e) <> 'string' or length(btrim(e #>> '{}')) > 40) then
      raise exception 'each highlight must be text of at most 40 characters' using errcode = '22023';
    end if;
  end if;
  if p_fields ? 'price_range' and jsonb_typeof(p_fields -> 'price_range') = 'number' and ((p_fields ->> 'price_range')::numeric not in (0, 1, 2, 3)) then
    raise exception 'price level must be 0, 1, 2 or 3' using errcode = '22023';
  end if;

  update public.businesses set
    name              = case when p_fields ? 'name' then btrim(p_fields->>'name') else name end,
    legal_name        = case when p_fields ? 'legal_name' then nullif(btrim(coalesce(p_fields->>'legal_name', '')), '') else legal_name end,
    address_line1     = case when p_fields ? 'address_line1' then nullif(btrim(coalesce(p_fields->>'address_line1', '')), '') else address_line1 end,
    address_line2     = case when p_fields ? 'address_line2' then nullif(btrim(coalesce(p_fields->>'address_line2', '')), '') else address_line2 end,
    city              = case when p_fields ? 'city' then nullif(btrim(coalesce(p_fields->>'city', '')), '') else city end,
    postal_code       = case when p_fields ? 'postal_code' then nullif(btrim(coalesce(p_fields->>'postal_code', '')), '') else postal_code end,
    phone             = case when p_fields ? 'phone' then nullif(btrim(coalesce(p_fields->>'phone', '')), '') else phone end,
    website           = case when p_fields ? 'website' then nullif(btrim(coalesce(p_fields->>'website', '')), '') else website end,
    email             = case when p_fields ? 'email' then nullif(lower(btrim(coalesce(p_fields->>'email', ''))), '') else email end,
    short_description = case when p_fields ? 'short_description' then nullif(btrim(coalesce(p_fields->>'short_description', '')), '') else short_description end,
    description       = case when p_fields ? 'description' then nullif(btrim(coalesce(p_fields->>'description', '')), '') else description end,
    hours_note        = case when p_fields ? 'hours_note' then nullif(btrim(coalesce(p_fields->>'hours_note', '')), '') else hours_note end,
    home_community_id = case when p_fields ? 'home_community_id' then nullif(p_fields->>'home_community_id', '')::uuid else home_community_id end,
    primary_category_id = case when p_fields ? 'primary_category_id' then nullif(p_fields->>'primary_category_id', '')::uuid else primary_category_id end,
    highlights        = case when p_fields ? 'highlights' then coalesce((select array_agg(btrim(e) order by ord) from jsonb_array_elements_text(case when jsonb_typeof(p_fields -> 'highlights') = 'array' then p_fields -> 'highlights' else '[]'::jsonb end) with ordinality t(e, ord) where btrim(e) <> ''), '{}'::text[]) else highlights end,
    price_range       = case when p_fields ? 'price_range' then (case when jsonb_typeof(p_fields -> 'price_range') = 'number' then (p_fields ->> 'price_range')::smallint end) else price_range end
  where id = p_business and tenant_id = p_tenant;
end $$;

create function public.set_business_status(p_tenant uuid, p_business uuid, p_status public.business_status) returns public.business_status
language plpgsql security invoker set search_path = public as $$
declare b public.businesses%rowtype; v_new public.business_status;
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  select * into b from public.businesses where id = p_business and tenant_id = p_tenant for update;
  if not found then raise exception 'business not found' using errcode = 'P0002'; end if;
  if b.status = p_status or (b.status in ('unclaimed','claimed') and p_status in ('unclaimed','claimed') and b.status = (case when exists (select 1 from public.business_owners o where o.business_id = b.id) then 'claimed' else 'unclaimed' end)::public.business_status) then
    return b.status;                                   -- nothing to do
  end if;
  if p_status in ('unclaimed', 'claimed') then          -- publish
    if b.status <> 'prospect' then raise exception 'only a prospect can be published (restore an archived business first)' using errcode = '22023'; end if;
    if b.home_community_id is null or b.primary_category_id is null then raise exception 'choose a community and a category before publishing' using errcode = '22023'; end if;
    v_new := case when exists (select 1 from public.business_owners o where o.business_id = b.id) then 'claimed' else 'unclaimed' end;
  elsif p_status = 'archived' then
    if b.status not in ('unclaimed', 'claimed') then raise exception 'only a published business can be archived' using errcode = '22023'; end if;
    if exists (select 1 from public.listings l where l.business_id = b.id and l.status = 'active' and l.starts_at <= now() and (l.ends_at is null or l.ends_at > now()))
       or exists (select 1 from public.placements p where p.business_id = b.id and p.status = 'active' and p.end_at > now()) then
      raise exception 'end its paid listing and placements before archiving' using errcode = '22023';
    end if;
    v_new := 'archived';
  else                                                 -- p_status = 'prospect': restore
    if b.status <> 'archived' then raise exception 'only an archived business can be restored' using errcode = '22023'; end if;
    v_new := 'prospect';
  end if;
  update public.businesses set status = v_new where id = b.id;
  insert into public.communications (tenant_id, business_id, kind, subject, staff_id)
    values (p_tenant, b.id, 'note', 'Status: ' || b.status || ' → ' || v_new, (select auth.uid()));
  return v_new;
end $$;

revoke all on function public.update_business_fields(uuid, uuid, jsonb) from public, anon;
revoke all on function public.set_business_status(uuid, uuid, public.business_status) from public, anon;
grant execute on function public.update_business_fields(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.set_business_status(uuid, uuid, public.business_status) to authenticated, service_role;
