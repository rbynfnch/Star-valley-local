-- CSV import commit. The app plans a import (see src/lib/import/plan.ts) and sends the approved rows here.
-- Rules enforced in the database, not trusted from the client:
--   * rows are written with write source 'import', so owner/admin edits are never overwritten (provenance triggers)
--   * new businesses are ALWAYS prospects: hidden from the public until staff publish them
--   * duplicates are re-checked at write time (the data may have changed since the plan was made)
--   * a slug collision gets a numeric suffix instead of failing the whole batch
--   * one bad row does not abort the batch: each row reports created / updated / skipped_duplicate / error
-- security invoker: only roles that RLS lets insert businesses (sales and up, service_role) can use it.
create function public.import_businesses(p_tenant uuid, p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  r jsonb; i int := 0; out jsonb := '[]'::jsonb;
  v_id uuid; v_slug text; v_base text; n int; v_dup uuid; v_existing uuid;
  v_prev text := current_setting('app.write_source', true);
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be a json array' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'at most 2000 rows per call' using errcode = '22023'; end if;
  perform set_config('app.write_source', 'import', true);
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      if nullif(btrim(r->>'name'), '') is null then
        out := out || jsonb_build_object('index', i, 'result', 'error', 'message', 'no business name'); continue;
      end if;
      v_existing := nullif(r->>'existing_id', '')::uuid;
      if v_existing is not null then
        update public.businesses set
            name = coalesce(nullif(r->>'name', ''), name),
            address_line1 = coalesce(nullif(r->>'address_line1', ''), address_line1),
            city = coalesce(nullif(r->>'city', ''), city),
            postal_code = coalesce(nullif(r->>'postal_code', ''), postal_code),
            phone = coalesce(nullif(r->>'phone', ''), phone),
            website = coalesce(nullif(r->>'website', ''), website),
            email = coalesce(nullif(r->>'email', ''), email),
            short_description = coalesce(nullif(r->>'short_description', ''), short_description)
          where id = v_existing and tenant_id = p_tenant;
        if not found then
          out := out || jsonb_build_object('index', i, 'result', 'error', 'message', 'existing business not found in this tenant');
        else
          out := out || jsonb_build_object('index', i, 'result', 'updated', 'id', v_existing);
        end if;
        continue;
      end if;
      if not coalesce((r->>'force')::boolean, false) then
        select d.business_id into v_dup from app.find_duplicate_businesses(p_tenant, r->>'name', r->>'phone', r->>'address_line1') d limit 1;
        if v_dup is not null then
          out := out || jsonb_build_object('index', i, 'result', 'skipped_duplicate', 'id', v_dup); continue;
        end if;
      end if;
      v_base := coalesce(nullif(regexp_replace(lower(coalesce(r->>'slug', r->>'name')), '[^a-z0-9]+', '-', 'g'), ''), 'business');
      v_base := btrim(left(v_base, 80), '-'); v_slug := v_base; n := 2;
      while exists (select 1 from public.businesses where tenant_id = p_tenant and slug = v_slug) loop
        v_slug := v_base || '-' || n; n := n + 1;
      end loop;
      insert into public.businesses (tenant_id, slug, name, status, home_community_id, primary_category_id,
                                     address_line1, city, postal_code, phone, website, email, short_description)
      values (p_tenant, v_slug, btrim(r->>'name'), 'prospect',
              nullif(r->>'home_community_id', '')::uuid, nullif(r->>'primary_category_id', '')::uuid,
              nullif(r->>'address_line1', ''), nullif(r->>'city', ''), nullif(r->>'postal_code', ''),
              nullif(r->>'phone', ''), nullif(r->>'website', ''), nullif(lower(r->>'email'), ''),
              left(nullif(r->>'short_description', ''), 120))
      returning id into v_id;
      out := out || jsonb_build_object('index', i, 'result', 'created', 'id', v_id, 'slug', v_slug);
    exception when others then
      -- RLS violations are NOT a per-row problem: surface them to the caller
      if sqlstate = '42501' then raise; end if;
      out := out || jsonb_build_object('index', i, 'result', 'error', 'message', sqlerrm);
    end;
  end loop;
  perform set_config('app.write_source', coalesce(v_prev, ''), true);
  return out;
end $$;
revoke all on function public.import_businesses(uuid, jsonb) from public, anon;
grant execute on function public.import_businesses(uuid, jsonb) to authenticated, service_role;
