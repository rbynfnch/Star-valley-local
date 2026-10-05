-- Editorial CRUD for articles and community events (CLAUDE.md §8 "Content"): editors and admins only (the same roles as the
-- articles_write / events_write policies). Validation lives here so every writer gets the same rules.
--   save_event / delete_event, save_article / delete_article, set_content_image / clear_content_image
-- Functions are security definer with an explicit role check so an editor can also manage the cover image rows
-- (media_assets policies are written for sales and owners). Slugs are made from titles and kept unique.

create function app.content_guard_editor(p_tenant uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_role(p_tenant, '{editor}') then raise exception 'editors only' using errcode = '42501'; end if;
end $$;

create function app.slugify(p_text text) returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(left(trim(both '-' from regexp_replace(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g')), 60), ''), 'item')
$$;

-- ----------------------------------------------------------------------------------------------------------------- events
create function public.save_event(
  p_tenant uuid, p_id uuid, p_title text, p_description text, p_community uuid, p_category uuid, p_venue text, p_address text,
  p_starts timestamptz, p_ends timestamptz, p_all_day boolean, p_rrule text, p_until timestamptz, p_url text, p_organizer uuid, p_status public.event_status) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_title text := nullif(btrim(coalesce(p_title, '')), ''); v_id uuid := p_id; v_slug text; n int := 1; v_rrule text := nullif(btrim(coalesce(p_rrule, '')), ''); v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  perform app.content_guard_editor(p_tenant);
  if v_title is null then raise exception 'the event needs a title' using errcode = '22023'; end if;
  if length(v_title) > 150 then raise exception 'the title is limited to 150 characters' using errcode = '22023'; end if;
  if length(coalesce(p_description, '')) > 3000 then raise exception 'the description is limited to 3000 characters' using errcode = '22023'; end if;
  if length(coalesce(p_venue, '')) > 150 or length(coalesce(p_address, '')) > 200 then raise exception 'the venue and address are limited to 150 and 200 characters' using errcode = '22023'; end if;
  if p_starts is null then raise exception 'the event needs a start' using errcode = '22023'; end if;
  if p_ends is not null and p_ends < p_starts then raise exception 'the event cannot end before it starts' using errcode = '22023'; end if;
  if p_status not in ('published', 'cancelled', 'pending') then raise exception 'an event is published, cancelled or pending' using errcode = '22023'; end if;
  if v_rrule is not null and v_rrule !~ '^FREQ=(DAILY|WEEKLY|MONTHLY)(;INTERVAL=[1-9][0-9]{0,2})?(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU)){0,6})?$' then
    raise exception 'that repeat rule is not supported' using errcode = '22023';
  end if;
  if v_rrule like '%BYDAY=%' and v_rrule not like 'FREQ=WEEKLY%' then raise exception 'days of the week only go with weekly repeats' using errcode = '22023'; end if;
  if p_until is not null and (v_rrule is null or p_until < p_starts) then raise exception 'the repeat end date must come after the first date' using errcode = '22023'; end if;
  if v_url is not null and (v_url !~* '^https?://[^\s]+$' or length(v_url) > 300) then raise exception 'the website must be a full address starting with http:// or https://' using errcode = '22023'; end if;
  if p_community is not null and not exists (select 1 from public.communities where id = p_community and tenant_id = p_tenant) then raise exception 'unknown community' using errcode = '22023'; end if;
  if p_category is not null and not exists (select 1 from public.event_categories where id = p_category and tenant_id = p_tenant) then raise exception 'unknown event type' using errcode = '22023'; end if;
  if p_organizer is not null and not exists (select 1 from public.businesses where id = p_organizer and tenant_id = p_tenant) then raise exception 'unknown organizer' using errcode = '22023'; end if;
  if v_id is null then
    v_slug := app.slugify(v_title);
    while exists (select 1 from public.community_events where tenant_id = p_tenant and slug = case when n = 1 then v_slug else v_slug || '-' || n end) loop n := n + 1; end loop;
    if n > 1 then v_slug := v_slug || '-' || n; end if;
    insert into public.community_events (tenant_id, slug, title, description, status, community_id, category_id, venue_name, address, starts_at, ends_at, all_day, rrule, recurrence_until, url, organizer_business_id, created_by)
      values (p_tenant, v_slug, v_title, nullif(btrim(coalesce(p_description, '')), ''), p_status, p_community, p_category, nullif(btrim(coalesce(p_venue, '')), ''), nullif(btrim(coalesce(p_address, '')), ''),
              p_starts, p_ends, coalesce(p_all_day, false), v_rrule, p_until, v_url, p_organizer, (select auth.uid())) returning id into v_id;
  else
    update public.community_events set title = v_title, description = nullif(btrim(coalesce(p_description, '')), ''), status = p_status, community_id = p_community, category_id = p_category,
           venue_name = nullif(btrim(coalesce(p_venue, '')), ''), address = nullif(btrim(coalesce(p_address, '')), ''), starts_at = p_starts, ends_at = p_ends, all_day = coalesce(p_all_day, false),
           rrule = v_rrule, recurrence_until = p_until, url = v_url, organizer_business_id = p_organizer
     where id = p_id and tenant_id = p_tenant;
    if not found then raise exception 'event not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

-- A published event must be cancelled first (its page and calendar links then stop working on purpose, not by accident).
create function public.delete_event(p_tenant uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  perform app.content_guard_editor(p_tenant);
  select e.status, e.image_media_id, m.storage_bucket as bucket, m.storage_path as path into v from public.community_events e left join public.media_assets m on m.id = e.image_media_id where e.id = p_id and e.tenant_id = p_tenant;
  if not found then raise exception 'event not found' using errcode = 'P0002'; end if;
  if v.status = 'published' then raise exception 'cancel a published event before deleting it' using errcode = '22023'; end if;
  delete from public.community_events where id = p_id and tenant_id = p_tenant;
  if v.image_media_id is not null then delete from public.media_assets where id = v.image_media_id and tenant_id = p_tenant; end if;
  return jsonb_build_object('bucket', v.bucket, 'path', v.path);
end $$;

-- --------------------------------------------------------------------------------------------------------------- articles
create function public.save_article(
  p_tenant uuid, p_id uuid, p_title text, p_slug text, p_excerpt text, p_body text, p_category uuid, p_author text, p_status public.content_status,
  p_publish_at timestamptz, p_featured_rank int, p_seo_title text, p_seo_description text, p_spotlight uuid, p_items jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_title text := nullif(btrim(coalesce(p_title, '')), ''); v_id uuid := p_id; v_slug text := nullif(btrim(coalesce(p_slug, '')), ''); n int := 1; v_author uuid;
        v_author_name text := nullif(btrim(coalesce(p_author, '')), ''); v_body text := coalesce(p_body, ''); v_pub timestamptz := p_publish_at; it jsonb; pos int := 0; v_biz uuid; v_bslug text;
begin
  perform app.content_guard_editor(p_tenant);
  if v_title is null then raise exception 'the article needs a title' using errcode = '22023'; end if;
  if length(v_title) > 150 then raise exception 'the title is limited to 150 characters' using errcode = '22023'; end if;
  if length(coalesce(p_excerpt, '')) > 300 then raise exception 'the summary is limited to 300 characters' using errcode = '22023'; end if;
  if length(v_body) > 50000 then raise exception 'the article is limited to 50,000 characters' using errcode = '22023'; end if;
  if length(coalesce(p_seo_title, '')) > 70 or length(coalesce(p_seo_description, '')) > 200 then raise exception 'the search title is limited to 70 characters and the search description to 200' using errcode = '22023'; end if;
  if length(coalesce(v_author_name, '')) > 80 then raise exception 'the author name is limited to 80 characters' using errcode = '22023'; end if;
  if p_status not in ('draft', 'scheduled', 'published', 'archived') then raise exception 'an article is a draft, scheduled, published or archived' using errcode = '22023'; end if;
  if p_featured_rank is not null and p_featured_rank not between 1 and 5 then raise exception 'the featured position is 1 to 5' using errcode = '22023'; end if;
  if p_category is not null and not exists (select 1 from public.article_categories where id = p_category and tenant_id = p_tenant) then raise exception 'unknown category' using errcode = '22023'; end if;
  if p_spotlight is not null and not exists (select 1 from public.businesses where id = p_spotlight and tenant_id = p_tenant) then raise exception 'unknown business' using errcode = '22023'; end if;
  if p_items is not null and (jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 25) then raise exception 'a guide has at most 25 items' using errcode = '22023'; end if;
  if p_status = 'published' and v_pub is null then v_pub := now(); end if;
  if p_status = 'scheduled' and (v_pub is null or v_pub <= now()) then raise exception 'a scheduled article needs a publish time in the future' using errcode = '22023'; end if;
  if p_status = 'published' and v_pub > now() + interval '1 minute' then raise exception 'a published article cannot have a publish time in the future; schedule it instead' using errcode = '22023'; end if;
  if v_author_name is not null then
    select id into v_author from public.authors where tenant_id = p_tenant and lower(name) = lower(v_author_name) limit 1;
    if v_author is null then insert into public.authors (tenant_id, name) values (p_tenant, v_author_name) returning id into v_author; end if;
  end if;
  if v_slug is not null and v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'the web address can only use lowercase letters, numbers and hyphens' using errcode = '22023'; end if;
  if length(coalesce(v_slug, '')) > 80 then raise exception 'the web address is limited to 80 characters' using errcode = '22023'; end if;
  if p_featured_rank is not null then update public.articles set featured_rank = null where tenant_id = p_tenant and featured_rank = p_featured_rank and id is distinct from p_id; end if;

  if v_id is null then
    v_slug := coalesce(v_slug, app.slugify(v_title));
    if exists (select 1 from public.articles where tenant_id = p_tenant and slug = v_slug) then
      if nullif(btrim(coalesce(p_slug, '')), '') is not null then raise exception 'that web address is already used by another article' using errcode = '22023'; end if;
      while exists (select 1 from public.articles where tenant_id = p_tenant and slug = v_slug || '-' || (n + 1)) loop n := n + 1; end loop;
      v_slug := v_slug || '-' || (n + 1);
    end if;
    insert into public.articles (tenant_id, slug, title, excerpt, body_md, status, category_id, author_id, spotlight_business_id, read_minutes, featured_rank, publish_at, seo_title, seo_description, created_by)
      values (p_tenant, v_slug, v_title, nullif(btrim(coalesce(p_excerpt, '')), ''), v_body, p_status, p_category, v_author, p_spotlight, greatest(1, round(array_length(regexp_split_to_array(btrim(v_body), '\s+'), 1)::numeric / 200)::int), p_featured_rank,
              case when p_status in ('draft', 'archived') then v_pub else v_pub end, nullif(btrim(coalesce(p_seo_title, '')), ''), nullif(btrim(coalesce(p_seo_description, '')), ''), (select auth.uid())) returning id into v_id;
  else
    if v_slug is not null and exists (select 1 from public.articles where tenant_id = p_tenant and slug = v_slug and id <> p_id) then raise exception 'that web address is already used by another article' using errcode = '22023'; end if;
    update public.articles set title = v_title, slug = coalesce(v_slug, slug), excerpt = nullif(btrim(coalesce(p_excerpt, '')), ''), body_md = v_body, status = p_status, category_id = p_category, author_id = v_author,
           spotlight_business_id = p_spotlight, read_minutes = greatest(1, round(array_length(regexp_split_to_array(btrim(v_body), '\s+'), 1)::numeric / 200)::int), featured_rank = p_featured_rank, publish_at = v_pub,
           seo_title = nullif(btrim(coalesce(p_seo_title, '')), ''), seo_description = nullif(btrim(coalesce(p_seo_description, '')), '')
     where id = p_id and tenant_id = p_tenant;
    if not found then raise exception 'article not found' using errcode = 'P0002'; end if;
  end if;

  if p_items is not null then                                            -- replace-all guide items
    delete from public.article_items where article_id = v_id and tenant_id = p_tenant;
    for it in select * from jsonb_array_elements(p_items) loop
      if jsonb_typeof(it) <> 'object' or nullif(btrim(coalesce(it ->> 'title', '')), '') is null then raise exception 'every guide item needs a title' using errcode = '22023'; end if;
      if length(it ->> 'title') > 150 or length(coalesce(it ->> 'body', '')) > 2000 then raise exception 'a guide item title is limited to 150 characters and its text to 2000' using errcode = '22023'; end if;
      v_bslug := nullif(btrim(coalesce(it ->> 'business_slug', '')), ''); v_biz := null;
      if v_bslug is not null then
        select id into v_biz from public.businesses where tenant_id = p_tenant and slug = v_bslug;
        if v_biz is null then raise exception 'unknown business "%"', left(v_bslug, 60) using errcode = '22023'; end if;
      end if;
      pos := pos + 1;
      insert into public.article_items (tenant_id, article_id, position, title, body, business_id) values (p_tenant, v_id, pos, btrim(it ->> 'title'), nullif(btrim(coalesce(it ->> 'body', '')), ''), v_biz);
    end loop;
  end if;
  return v_id;
end $$;

create function public.delete_article(p_tenant uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  perform app.content_guard_editor(p_tenant);
  select a.status, m.storage_bucket as bucket, m.storage_path as path, a.cover_media_id into v from public.articles a left join public.media_assets m on m.id = a.cover_media_id where a.id = p_id and a.tenant_id = p_tenant;
  if not found then raise exception 'article not found' using errcode = 'P0002'; end if;
  if v.status not in ('draft', 'archived') then raise exception 'archive a published or scheduled article before deleting it' using errcode = '22023'; end if;
  delete from public.articles where id = p_id and tenant_id = p_tenant;
  if v.cover_media_id is not null then delete from public.media_assets where id = v.cover_media_id and tenant_id = p_tenant; end if;
  return jsonb_build_object('bucket', v.bucket, 'path', v.path);
end $$;

-- ------------------------------------------------------------------------------------------------------------ cover images
-- One image per article or event, stored under <tenant>/articles|events/<id>/. The server stores the file; this records it.
create function public.set_content_image(p_tenant uuid, p_kind text, p_id uuid, p_bucket text, p_path text, p_alt text, p_width int, p_height int, p_bytes bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_alt text := nullif(btrim(coalesce(p_alt, '')), ''); v_old uuid; v_old_row record; v_asset uuid; v_prefix text;
begin
  perform app.content_guard_editor(p_tenant);
  if p_kind not in ('article', 'event') then raise exception 'unknown kind' using errcode = '22023'; end if;
  v_prefix := p_tenant::text || '/' || p_kind || 's/' || p_id::text || '/';
  if p_bucket <> 'media' then raise exception 'unknown storage bucket' using errcode = '22023'; end if;
  if p_path is null or left(p_path, length(v_prefix)) <> v_prefix or p_path ~ '(^|/)\.\.?(/|$)' or p_path !~ '^[A-Za-z0-9._/-]+$' then raise exception 'that file is not stored in this item''s folder' using errcode = '22023'; end if;
  if coalesce(p_width, 0) not between 1 and 10000 or coalesce(p_height, 0) not between 1 and 10000 then raise exception 'the image size is not valid' using errcode = '22023'; end if;
  if coalesce(p_bytes, 0) not between 1 and 5000000 then raise exception 'images can be at most 5 MB' using errcode = '22023'; end if;
  if v_alt is null then raise exception 'describe the image for people who cannot see it (alt text)' using errcode = '22023'; end if;
  if length(v_alt) > 200 then raise exception 'alt text is limited to 200 characters' using errcode = '22023'; end if;
  if p_kind = 'article' then select cover_media_id into v_old from public.articles where id = p_id and tenant_id = p_tenant;
  else select image_media_id into v_old from public.community_events where id = p_id and tenant_id = p_tenant; end if;
  if not found then raise exception '% not found', p_kind using errcode = 'P0002'; end if;
  insert into public.media_assets (tenant_id, storage_bucket, storage_path, alt_text, width, height, bytes, uploaded_by, is_public) values (p_tenant, p_bucket, p_path, v_alt, p_width, p_height, p_bytes, (select auth.uid()), true) returning id into v_asset;
  if p_kind = 'article' then update public.articles set cover_media_id = v_asset where id = p_id and tenant_id = p_tenant; else update public.community_events set image_media_id = v_asset where id = p_id and tenant_id = p_tenant; end if;
  select storage_bucket as bucket, storage_path as path into v_old_row from public.media_assets where id = v_old;
  if v_old is not null then delete from public.media_assets where id = v_old and tenant_id = p_tenant; end if;
  return jsonb_build_object('id', v_asset, 'replaced', case when v_old_row.path is null then null else jsonb_build_object('bucket', v_old_row.bucket, 'path', v_old_row.path) end);
end $$;

create function public.clear_content_image(p_tenant uuid, p_kind text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_old uuid; v_row record;
begin
  perform app.content_guard_editor(p_tenant);
  if p_kind not in ('article', 'event') then raise exception 'unknown kind' using errcode = '22023'; end if;
  if p_kind = 'article' then select cover_media_id into v_old from public.articles where id = p_id and tenant_id = p_tenant;
  else select image_media_id into v_old from public.community_events where id = p_id and tenant_id = p_tenant; end if;
  if not found then raise exception '% not found', p_kind using errcode = 'P0002'; end if;
  if v_old is null then return jsonb_build_object('bucket', null, 'path', null); end if;
  select storage_bucket as bucket, storage_path as path into v_row from public.media_assets where id = v_old;
  if p_kind = 'article' then update public.articles set cover_media_id = null where id = p_id and tenant_id = p_tenant; else update public.community_events set image_media_id = null where id = p_id and tenant_id = p_tenant; end if;
  delete from public.media_assets where id = v_old and tenant_id = p_tenant;
  return jsonb_build_object('bucket', v_row.bucket, 'path', v_row.path);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'save_event(uuid, uuid, text, text, uuid, uuid, text, text, timestamptz, timestamptz, boolean, text, timestamptz, text, uuid, public.event_status)', 'delete_event(uuid, uuid)',
    'save_article(uuid, uuid, text, text, text, text, uuid, text, public.content_status, timestamptz, int, text, text, uuid, jsonb)', 'delete_article(uuid, uuid)',
    'set_content_image(uuid, text, uuid, text, text, text, int, int, bigint)', 'clear_content_image(uuid, text, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
revoke all on function app.content_guard_editor(uuid), app.slugify(text) from public, anon;
grant execute on function app.content_guard_editor(uuid), app.slugify(text) to authenticated, service_role;
