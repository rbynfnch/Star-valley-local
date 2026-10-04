-- Staff content editor: everything the Enhanced (and Free) profile displays, edited in validated, transactional operations.
-- Sales staff and admins only (CLAUDE.md §8: staff enter this content on behalf of businesses until the owner dashboard exists).
-- Each section is "replace all": the list you send becomes the list stored, in the order sent. Writes are recorded as source 'admin'.
-- Content that only Enhanced listings display is still writable for a Free business (so staff can prepare it); the public profile
-- function keeps hiding it until the listing is Enhanced.
--
--   business_content        read everything editable for one business, in one document
--   set_business_hours      structured hours (up to 3 ranges a day, no overlaps, closes after opens)
--   set_business_services   a list of services (40 max)
--   set_business_links      social and Google links (host must match the network)
--   set_business_faqs       question and answer pairs (20 max)
--   set_business_areas      extra communities served and secondary categories
--   save_deal / delete_deal one deal at a time (deals are referenced by tracking, so never replaced wholesale)
--   add_business_photo / update_business_photo / delete_business_photo / reorder_business_photos
--     the file itself is stored by the server; these functions record it, and refuse any path outside this business's folder

create function app.content_guard(p_tenant uuid, p_business uuid) returns void
language plpgsql stable security invoker set search_path = public as $$
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_business and tenant_id = p_tenant) then raise exception 'business not found' using errcode = 'P0002'; end if;
end $$;

-- Staff can correct a photo's alt text. (There was no update policy on media_assets, so the update would have matched no rows silently.)
create policy media_update on public.media_assets for update to authenticated
  using (app.has_role(tenant_id, '{sales}')) with check (app.has_role(tenant_id, '{sales}'));

-- ---------------------------------------------------------------------------------------------------------------- read
create function public.business_content(p_tenant uuid, p_business uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v jsonb;
begin
  perform app.content_guard(p_tenant, p_business);
  select jsonb_build_object(
    'enhanced', app.business_is_enhanced(b.id),
    'home_community_id', b.home_community_id, 'primary_category_id', b.primary_category_id,
    'highlights', to_jsonb(b.highlights), 'price_range', b.price_range,
    'hours', coalesce((select jsonb_agg(jsonb_build_object('day', h.day_of_week, 'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI')) order by h.day_of_week, h.opens) from public.business_hours h where h.business_id = b.id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(s.name order by s.sort_order, s.name) from public.business_services s where s.business_id = b.id), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'url', l.url) order by l.kind) from public.business_links l where l.business_id = b.id), '[]'::jsonb),
    'faqs', coalesce((select jsonb_agg(jsonb_build_object('question', f.question, 'answer', f.answer) order by f.sort_order) from public.business_faqs f where f.business_id = b.id), '[]'::jsonb),
    'community_ids', coalesce((select jsonb_agg(a.community_id) from public.business_service_areas a where a.business_id = b.id), '[]'::jsonb),
    'category_ids', coalesce((select jsonb_agg(c.category_id) from public.business_categories c where c.business_id = b.id), '[]'::jsonb),
    'deals', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'description', d.description, 'terms', d.terms, 'discount_type', d.discount_type, 'discount_value', d.discount_value,
                                                         'status', d.status, 'starts_at', d.starts_at, 'ends_at', d.ends_at) order by d.created_at desc) from public.deals d where d.business_id = b.id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'role', p.role, 'caption', p.caption, 'alt', m.alt_text, 'bucket', m.storage_bucket, 'path', m.storage_path, 'width', m.width, 'height', m.height)
                                         order by case p.role when 'logo' then 0 when 'cover' then 1 else 2 end, p.sort_order, p.id)
                          from public.business_photos p join public.media_assets m on m.id = p.media_asset_id where p.business_id = b.id), '[]'::jsonb)
  ) into v from public.businesses b where b.id = p_business and b.tenant_id = p_tenant;
  return v;
end $$;

-- ---------------------------------------------------------------------------------------------------------------- hours
create function public.set_business_hours(p_tenant uuid, p_business uuid, p_rows jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare r jsonb; d int; o time; c time;
begin
  perform app.content_guard(p_tenant, p_business);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'hours must be a list' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 21 then raise exception 'at most 3 time ranges per day' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) <> 'object' or jsonb_typeof(r -> 'day') <> 'number' or (r ->> 'day')::numeric not between 0 and 6 or (r ->> 'day')::numeric <> trunc((r ->> 'day')::numeric) then
      raise exception 'each time range needs a day from 0 (Sunday) to 6 (Saturday)' using errcode = '22023';
    end if;
    d := (r ->> 'day')::int;
    if coalesce(r ->> 'opens', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(r ->> 'closes', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'times must look like 08:30 (24-hour)' using errcode = '22023';
    end if;
    o := (r ->> 'opens')::time; c := (r ->> 'closes')::time;
    if c <= o then raise exception 'closing time must be after opening time (for hours past midnight, end the day at 23:59 and start the next day at 00:00)' using errcode = '22023'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_rows) e group by (e ->> 'day')::int having count(*) > 3) then raise exception 'at most 3 time ranges per day' using errcode = '22023'; end if;
  delete from public.business_hours where business_id = p_business;
  begin
    insert into public.business_hours (tenant_id, business_id, day_of_week, opens, closes, source, updated_by)
      select p_tenant, p_business, (e ->> 'day')::int, (e ->> 'opens')::time, (e ->> 'closes')::time, 'admin', (select auth.uid()) from jsonb_array_elements(p_rows) e;
  exception when exclusion_violation then raise exception 'two time ranges on the same day overlap' using errcode = '22023';
  end;
end $$;

-- ------------------------------------------------------------------------------------------------------------- services
create function public.set_business_services(p_tenant uuid, p_business uuid, p_names jsonb) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  perform app.content_guard(p_tenant, p_business);
  if p_names is null or jsonb_typeof(p_names) <> 'array' then raise exception 'services must be a list' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_names) e where jsonb_typeof(e) <> 'string') then raise exception 'each service must be text' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements_text(p_names) e where length(btrim(e)) > 100) then raise exception 'a service name is limited to 100 characters' using errcode = '22023'; end if;
  delete from public.business_services where business_id = p_business;
  insert into public.business_services (tenant_id, business_id, name, sort_order, source, updated_by)
    select p_tenant, p_business, x.name, row_number() over (order by x.ord) - 1, 'admin', (select auth.uid())
      from (select distinct on (lower(btrim(e))) btrim(e) as name, ord from jsonb_array_elements_text(p_names) with ordinality t(e, ord) where btrim(e) <> '' order by lower(btrim(e)), ord) x;
  get diagnostics n = row_count;
  if n > 40 then raise exception 'at most 40 services' using errcode = '22023'; end if;
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------------------------- links
create function public.set_business_links(p_tenant uuid, p_business uuid, p_items jsonb) returns int
language plpgsql security invoker set search_path = public as $$
declare it jsonb; v_kind public.link_kind; v_url text; v_host text; n int; hosts text[];
begin
  perform app.content_guard(p_tenant, p_business);
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'links must be a list' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) > 12 then raise exception 'too many links' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    begin v_kind := (it ->> 'kind')::public.link_kind; exception when others then raise exception 'unknown link type' using errcode = '22023'; end;
    v_url := btrim(coalesce(it ->> 'url', ''));
    if v_url !~* '^https?://[^\s]+$' or length(v_url) > 300 then raise exception 'each link must be a full web address starting with http:// or https://' using errcode = '22023'; end if;
    v_host := regexp_replace(lower(substring(v_url from '^[a-zA-Z]+://([^/?#:@]+)')), '^(www|m|mobile)\.', '');
    hosts := case v_kind when 'facebook' then array['facebook.com', 'fb.com', 'fb.me'] when 'instagram' then array['instagram.com']
                         when 'x' then array['x.com', 'twitter.com'] when 'youtube' then array['youtube.com', 'youtu.be']
                         when 'linkedin' then array['linkedin.com'] when 'tiktok' then array['tiktok.com'] else null end;
    if hosts is not null and not (v_host = any (hosts)) then raise exception 'that does not look like a % address', replace(v_kind::text, '_', ' ') using errcode = '22023'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_items) e where e ->> 'kind' <> 'other' group by e ->> 'kind' having count(*) > 1) then raise exception 'only one link per type' using errcode = '22023'; end if;
  delete from public.business_links where business_id = p_business;
  insert into public.business_links (tenant_id, business_id, kind, url, source, updated_by)
    select p_tenant, p_business, (e ->> 'kind')::public.link_kind, btrim(e ->> 'url'), 'admin', (select auth.uid()) from jsonb_array_elements(p_items) e;
  get diagnostics n = row_count; return n;
end $$;

-- ----------------------------------------------------------------------------------------------------------------- faqs
create function public.set_business_faqs(p_tenant uuid, p_business uuid, p_items jsonb) returns int
language plpgsql security invoker set search_path = public as $$
declare it jsonb; n int;
begin
  perform app.content_guard(p_tenant, p_business);
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'questions must be a list' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) > 20 then raise exception 'at most 20 questions' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) <> 'object' or coalesce(jsonb_typeof(it -> 'question'), '') <> 'string' or coalesce(jsonb_typeof(it -> 'answer'), '') <> 'string' then raise exception 'each item needs a question and an answer' using errcode = '22023'; end if;
    if (btrim(it ->> 'question') = '') <> (btrim(it ->> 'answer') = '') then raise exception 'every question needs an answer, and every answer a question' using errcode = '22023'; end if;
    if length(btrim(it ->> 'question')) > 200 then raise exception 'a question is limited to 200 characters' using errcode = '22023'; end if;
    if length(btrim(it ->> 'answer')) > 1000 then raise exception 'an answer is limited to 1000 characters' using errcode = '22023'; end if;
  end loop;
  delete from public.business_faqs where business_id = p_business;
  insert into public.business_faqs (tenant_id, business_id, question, answer, sort_order, source, updated_by)
    select p_tenant, p_business, btrim(e ->> 'question'), btrim(e ->> 'answer'), ord - 1, 'admin', (select auth.uid())
      from jsonb_array_elements(p_items) with ordinality t(e, ord) where btrim(e ->> 'question') <> '';
  get diagnostics n = row_count; return n;
end $$;

-- ----------------------------------------------------------------------------------------------------------------- areas
create function public.set_business_areas(p_tenant uuid, p_business uuid, p_community_ids jsonb, p_category_ids jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare b public.businesses%rowtype; c uuid; k uuid;
begin
  perform app.content_guard(p_tenant, p_business);
  select * into b from public.businesses where id = p_business;
  if jsonb_typeof(p_community_ids) <> 'array' or jsonb_typeof(p_category_ids) <> 'array' then raise exception 'choose from the lists' using errcode = '22023'; end if;
  if jsonb_array_length(p_community_ids) > 20 then raise exception 'at most 20 communities' using errcode = '22023'; end if;
  if jsonb_array_length(p_category_ids) > 5 then raise exception 'at most 5 extra categories' using errcode = '22023'; end if;
  begin
    for c in select distinct (e)::uuid from jsonb_array_elements_text(p_community_ids) e loop
      if not exists (select 1 from public.communities where id = c and tenant_id = p_tenant) then raise exception 'unknown community' using errcode = '22023'; end if;
    end loop;
    for k in select distinct (e)::uuid from jsonb_array_elements_text(p_category_ids) e loop
      if not exists (select 1 from public.categories where id = k and tenant_id = p_tenant) then raise exception 'unknown category' using errcode = '22023'; end if;
    end loop;
  exception when invalid_text_representation then raise exception 'choose from the lists' using errcode = '22023';
  end;
  delete from public.business_service_areas where business_id = p_business;
  delete from public.business_categories where business_id = p_business;
  insert into public.business_service_areas (business_id, community_id, tenant_id)
    select p_business, x, p_tenant from (select distinct (e)::uuid x from jsonb_array_elements_text(p_community_ids) e) q where x is distinct from b.home_community_id;     -- the home community is implicit
  insert into public.business_categories (business_id, category_id, tenant_id)
    select p_business, x, p_tenant from (select distinct (e)::uuid x from jsonb_array_elements_text(p_category_ids) e) q where x is distinct from b.primary_category_id;      -- so is the primary category
end $$;

-- ----------------------------------------------------------------------------------------------------------------- deals
create function public.save_deal(
  p_tenant uuid, p_business uuid, p_id uuid, p_title text, p_description text, p_terms text,
  p_discount_type public.discount_type, p_discount_value numeric, p_status public.content_status,
  p_starts_at timestamptz, p_ends_at timestamptz) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_title text := nullif(btrim(coalesce(p_title, '')), ''); v_start timestamptz := coalesce(p_starts_at, now());
begin
  perform app.content_guard(p_tenant, p_business);
  if v_title is null then raise exception 'the deal needs a title' using errcode = '22023'; end if;
  if length(v_title) > 120 then raise exception 'the title is limited to 120 characters' using errcode = '22023'; end if;
  if length(coalesce(p_description, '')) > 500 or length(coalesce(p_terms, '')) > 500 then raise exception 'description and terms are limited to 500 characters each' using errcode = '22023'; end if;
  if p_status not in ('draft', 'published', 'archived') then raise exception 'a deal is a draft, published or archived' using errcode = '22023'; end if;
  if p_discount_type = 'percent' and (p_discount_value is null or p_discount_value <= 0 or p_discount_value > 100) then raise exception 'a percent discount must be between 0 and 100' using errcode = '22023'; end if;
  if p_discount_type = 'amount' and (p_discount_value is null or p_discount_value <= 0 or p_discount_value > 100000) then raise exception 'a dollar discount must be more than 0' using errcode = '22023'; end if;
  if p_discount_type in ('bogo', 'other') and p_discount_value is not null then raise exception 'this kind of deal has no amount' using errcode = '22023'; end if;
  if p_ends_at is not null and p_ends_at <= v_start then raise exception 'the deal must end after it starts' using errcode = '22023'; end if;
  if p_id is null then
    if p_status <> 'archived' and (select count(*) from public.deals where business_id = p_business and status <> 'archived') >= 25 then raise exception 'a business can have at most 25 deals at a time; archive an old one first' using errcode = '22023'; end if;
    insert into public.deals (tenant_id, business_id, title, description, terms, discount_type, discount_value, status, starts_at, ends_at)
      values (p_tenant, p_business, v_title, nullif(btrim(coalesce(p_description, '')), ''), nullif(btrim(coalesce(p_terms, '')), ''), p_discount_type, p_discount_value, p_status, v_start, p_ends_at) returning id into v_id;
  else
    update public.deals set title = v_title, description = nullif(btrim(coalesce(p_description, '')), ''), terms = nullif(btrim(coalesce(p_terms, '')), ''), discount_type = p_discount_type,
           discount_value = p_discount_value, status = p_status, starts_at = v_start, ends_at = p_ends_at
     where id = p_id and business_id = p_business and tenant_id = p_tenant returning id into v_id;
    if v_id is null then raise exception 'deal not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create function public.delete_deal(p_tenant uuid, p_business uuid, p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform app.content_guard(p_tenant, p_business);
  delete from public.deals where id = p_id and business_id = p_business and tenant_id = p_tenant;
  if not found then raise exception 'deal not found' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------- photos
create function public.add_business_photo(
  p_tenant uuid, p_business uuid, p_bucket text, p_path text, p_alt text, p_width int, p_height int, p_bytes bigint,
  p_role public.photo_role default 'gallery', p_caption text default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_alt text := nullif(btrim(coalesce(p_alt, '')), ''); v_asset uuid; v_id uuid; v_old record; v_name text; v_sort int; v_replaced jsonb := null;
begin
  perform app.content_guard(p_tenant, p_business);
  if p_bucket <> 'media' then raise exception 'unknown storage bucket' using errcode = '22023'; end if;
  if p_path is null or p_path not like p_tenant::text || '/' || p_business::text || '/%' or p_path ~ '(^|/)\.\.?(/|$)' or p_path !~ '^[A-Za-z0-9._/-]+$' then
    raise exception 'that file is not stored in this business''s folder' using errcode = '22023';
  end if;
  if coalesce(p_width, 0) not between 1 and 10000 or coalesce(p_height, 0) not between 1 and 10000 then raise exception 'the image size is not valid' using errcode = '22023'; end if;
  if coalesce(p_bytes, 0) not between 1 and 5000000 then raise exception 'photos can be at most 5 MB' using errcode = '22023'; end if;
  if length(coalesce(p_caption, '')) > 150 then raise exception 'a caption is limited to 150 characters' using errcode = '22023'; end if;
  if v_alt is null and p_role = 'logo' then select name into v_name from public.businesses where id = p_business; v_alt := v_name || ' logo'; end if;
  if v_alt is null then raise exception 'describe the photo for people who cannot see it (alt text)' using errcode = '22023'; end if;
  if length(v_alt) > 200 then raise exception 'alt text is limited to 200 characters' using errcode = '22023'; end if;
  if (select count(*) from public.business_photos where business_id = p_business) >= 30 then raise exception 'a business can have at most 30 photos' using errcode = '22023'; end if;
  if p_role in ('logo', 'cover') then                                    -- one logo and one cover: the new one replaces the old
    select p.id as photo_id, m.id as asset_id, m.storage_bucket, m.storage_path into v_old
      from public.business_photos p join public.media_assets m on m.id = p.media_asset_id where p.business_id = p_business and p.role = p_role;
    if found then
      delete from public.media_assets where id = v_old.asset_id;          -- cascades to the photo row
      v_replaced := jsonb_build_object('bucket', v_old.storage_bucket, 'path', v_old.storage_path);
    end if;
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_sort from public.business_photos where business_id = p_business;
  insert into public.media_assets (tenant_id, business_id, storage_bucket, storage_path, alt_text, width, height, bytes, uploaded_by, is_public)
    values (p_tenant, p_business, p_bucket, p_path, v_alt, p_width, p_height, p_bytes, (select auth.uid()), true) returning id into v_asset;
  insert into public.business_photos (tenant_id, business_id, media_asset_id, role, caption, sort_order, source, updated_by)
    values (p_tenant, p_business, v_asset, p_role, nullif(btrim(coalesce(p_caption, '')), ''), v_sort, 'admin', (select auth.uid())) returning id into v_id;
  return jsonb_build_object('id', v_id, 'replaced', v_replaced);
end $$;

create function public.update_business_photo(p_tenant uuid, p_business uuid, p_photo uuid, p_alt text, p_caption text, p_role public.photo_role) returns void
language plpgsql security invoker set search_path = public as $$
declare ph public.business_photos%rowtype; v_alt text := nullif(btrim(coalesce(p_alt, '')), '');
begin
  perform app.content_guard(p_tenant, p_business);
  select * into ph from public.business_photos where id = p_photo and business_id = p_business and tenant_id = p_tenant for update;
  if not found then raise exception 'photo not found' using errcode = 'P0002'; end if;
  if v_alt is null then raise exception 'describe the photo for people who cannot see it (alt text)' using errcode = '22023'; end if;
  if length(v_alt) > 200 then raise exception 'alt text is limited to 200 characters' using errcode = '22023'; end if;
  if length(coalesce(p_caption, '')) > 150 then raise exception 'a caption is limited to 150 characters' using errcode = '22023'; end if;
  if p_role <> ph.role and p_role in ('logo', 'cover') then
    update public.business_photos set role = 'gallery' where business_id = p_business and role = p_role and id <> ph.id;      -- the previous holder becomes a gallery photo
  end if;
  update public.business_photos set role = p_role, caption = nullif(btrim(coalesce(p_caption, '')), ''), source = 'admin', updated_by = (select auth.uid()) where id = ph.id;
  update public.media_assets set alt_text = v_alt where id = ph.media_asset_id;
end $$;

create function public.delete_business_photo(p_tenant uuid, p_business uuid, p_photo uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v record;
begin
  perform app.content_guard(p_tenant, p_business);
  select m.id as asset_id, m.storage_bucket as bucket, m.storage_path as path into v
    from public.business_photos p join public.media_assets m on m.id = p.media_asset_id where p.id = p_photo and p.business_id = p_business and p.tenant_id = p_tenant;
  if not found then raise exception 'photo not found' using errcode = 'P0002'; end if;
  delete from public.media_assets where id = v.asset_id;                  -- cascades to the photo row; the server then removes the stored file
  return jsonb_build_object('bucket', v.bucket, 'path', v.path);
end $$;

create function public.reorder_business_photos(p_tenant uuid, p_business uuid, p_ids jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare i int := 0; e text;
begin
  perform app.content_guard(p_tenant, p_business);
  if jsonb_typeof(p_ids) <> 'array' then raise exception 'photos must be a list' using errcode = '22023'; end if;
  begin
    for e in select jsonb_array_elements_text(p_ids) loop
      update public.business_photos set sort_order = i where id = e::uuid and business_id = p_business and tenant_id = p_tenant and role = 'gallery';
      if not found then raise exception 'photo not found' using errcode = 'P0002'; end if;
      i := i + 1;
    end loop;
  exception when invalid_text_representation then raise exception 'photo not found' using errcode = 'P0002';
  end;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'business_content(uuid, uuid)', 'set_business_hours(uuid, uuid, jsonb)', 'set_business_services(uuid, uuid, jsonb)', 'set_business_links(uuid, uuid, jsonb)',
    'set_business_faqs(uuid, uuid, jsonb)', 'set_business_areas(uuid, uuid, jsonb, jsonb)',
    'save_deal(uuid, uuid, uuid, text, text, text, public.discount_type, numeric, public.content_status, timestamptz, timestamptz)', 'delete_deal(uuid, uuid, uuid)',
    'add_business_photo(uuid, uuid, text, text, text, int, int, bigint, public.photo_role, text)', 'update_business_photo(uuid, uuid, uuid, text, text, public.photo_role)',
    'delete_business_photo(uuid, uuid, uuid)', 'reorder_business_photos(uuid, uuid, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- The public storage bucket the photos live in. Reads are public; every write goes through the server (service role), which checks
-- the signed-in staff member first. Guarded so the local test database (which has no storage schema) still builds.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('media', 'media', true, 5000000, array['image/jpeg', 'image/png', 'image/webp']) on conflict (id) do nothing;
  end if;
end $$;
