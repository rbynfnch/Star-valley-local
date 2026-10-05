-- Private business columns are not readable through the public API. Before this, the table-wide SELECT grant let anyone holding the
-- public anon key read every published business's email (the sales lead list), legal name, Google place id and creator through
-- PostgREST, whatever the pages showed.
--   anon           column-level SELECT on everything except the private columns (the directory pages read a subset of those, see
--                  src/lib/directory/queries.ts and anon-access.test.ts)
--   authenticated  keeps full column access, but the row policy no longer lets a signed-in stranger read other businesses' rows:
--                  only staff and the business's own owners can. (The public site never sends a user session to these tables.)
--   Enhanced-only text (description, highlights) is hidden from the raw table too: Free listings must not leak it through the API. The
--   profile function reads it through app.business_enhanced_fields, which only returns it for public, Enhanced businesses.
--   private: email, legal_name, google_place_id, created_by, description, highlights
revoke select on public.businesses from anon;

create function app.business_enhanced_fields(p_business uuid) returns table (description text, highlights text[], email text)
language sql stable security definer set search_path = '' as $$
  select b.description::text, b.highlights, b.email from public.businesses b
   where b.id = p_business and b.status in ('unclaimed', 'claimed') and app.business_is_enhanced(b.id)
$$;
revoke all on function app.business_enhanced_fields(uuid) from public;
grant execute on function app.business_enhanced_fields(uuid) to anon, authenticated, service_role;

do $$
declare cols text; d text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols from information_schema.columns
   where table_schema = 'public' and table_name = 'businesses' and column_name not in ('email', 'legal_name', 'google_place_id', 'created_by', 'description', 'highlights');
  execute format('grant select (%s) on public.businesses to anon', cols);
  -- search_businesses runs as the caller (anon): list the public columns instead of b.*
  select string_agg('b.' || quote_ident(column_name), ', ' order by ordinal_position) into cols from information_schema.columns
   where table_schema = 'public' and table_name = 'businesses' and column_name not in ('email', 'legal_name', 'google_place_id', 'created_by', 'description', 'highlights');
  for d in select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'search_businesses' loop
    execute replace(d, 'select b.*', 'select ' || cols);
  end loop;
  -- business_profile: explicit public columns, and the Enhanced-only text through the helper
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols from information_schema.columns
   where table_schema = 'public' and table_name = 'businesses' and column_name not in ('email', 'legal_name', 'google_place_id', 'created_by', 'description', 'highlights');
  for d in select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'business_profile' loop
    d := replace(d, 'select * from public.businesses where tenant_id = p_tenant and slug = p_slug', 'select ' || cols || ' from public.businesses where tenant_id = p_tenant and slug = p_slug');
    d := replace(d, 'b.description', '(select e.description from app.business_enhanced_fields(b.id) e)');
    d := replace(d, 'to_jsonb(b.highlights)', 'to_jsonb((select e.highlights from app.business_enhanced_fields(b.id) e))');
    d := replace(d, 'b.email', '(select e.email from app.business_enhanced_fields(b.id) e)');
    execute d;
  end loop;
end $$;

drop policy businesses_read on public.businesses;
create policy businesses_read_public on public.businesses for select to anon using (status in ('unclaimed', 'claimed'));
create policy businesses_read on public.businesses for select to authenticated using (app.is_staff(tenant_id) or app.owns_business(id));

-- Who uploaded a photo and who created an event are staff facts, not public ones.
revoke select on public.media_assets, public.community_events from anon;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols from information_schema.columns where table_schema = 'public' and table_name = 'media_assets' and column_name <> 'uploaded_by';
  execute format('grant select (%s) on public.media_assets to anon', cols);
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols from information_schema.columns where table_schema = 'public' and table_name = 'community_events' and column_name <> 'created_by';
  execute format('grant select (%s) on public.community_events to anon', cols);
end $$;
