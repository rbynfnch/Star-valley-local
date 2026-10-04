-- Admin business list (CLAUDE.md §8): filter by community, category, status, tier, lead stage; search; paging.
-- Sales staff and up only (the CRM data inside is not for editors). Raises for anyone else instead of returning a subset.
-- No business_crm row means lead stage 'new'. Tier is 'enhanced' only while an Enhanced listing is live (active, inside its dates).
-- Returns {total, rows[]}; order is stable (name, id) so paging never repeats or skips a row.
create function public.admin_list_businesses(
  p_tenant uuid,
  p_q text default null,
  p_status public.business_status[] default null,
  p_community uuid default null,
  p_category uuid default null,
  p_tier public.listing_tier default null,
  p_stage public.lead_stage default null,
  p_verified boolean default null,           -- true = Green/Gold only, false = unverified only
  p_limit int default 25,
  p_offset int default 0
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100); v_offset int := greatest(coalesce(p_offset, 0), 0);
        q text := nullif(btrim(coalesce(p_q, '')), '');
        qd text := nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '');
        v_res jsonb;
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  with base as (
      select b.id, b.slug, b.name, b.status, b.phone, b.verification_level, b.updated_at,
             co.name as community, ca.name as category,
             coalesce(c.lead_stage, 'new'::public.lead_stage) as lead_stage,
             case when exists (select 1 from public.listings l where l.business_id = b.id and l.tier = 'enhanced' and l.status = 'active'
                                 and l.starts_at <= now() and (l.ends_at is null or l.ends_at > now()))
                  then 'enhanced'::public.listing_tier else 'free'::public.listing_tier end as tier,
             exists (select 1 from public.placements p where p.business_id = b.id and p.status = 'active' and p.start_at <= now() and p.end_at > now()) as featured
      from public.businesses b
      left join public.communities co on co.id = b.home_community_id
      left join public.categories ca on ca.id = b.primary_category_id
      left join public.business_crm c on c.business_id = b.id
      where b.tenant_id = p_tenant
        and (p_status is null and b.status <> 'archived' or b.status = any (p_status))
        and (p_community is null or b.home_community_id = p_community)
        and (p_category is null or b.primary_category_id = p_category
             or exists (select 1 from public.business_categories bc where bc.business_id = b.id and bc.category_id = p_category))
        and (p_verified is null or (b.verification_level <> 'none') = p_verified)
        and (q is null or lower(b.name) like '%' || lower(replace(replace(replace(q, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_')) || '%'
             or (qd is not null and length(qd) >= 3 and b.phone_digits like '%' || qd || '%'))
    ), filtered as (
      select * from base where (p_tier is null or tier = p_tier) and (p_stage is null or lead_stage = p_stage)
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.name, x.id)
                          from (select * from filtered order by name, id limit v_limit offset v_offset) x), '[]'::jsonb)) into v_res;
  return v_res;
end $$;
revoke all on function public.admin_list_businesses(uuid, text, public.business_status[], uuid, uuid, public.listing_tier, public.lead_stage, boolean, int, int) from public, anon;
grant execute on function public.admin_list_businesses(uuid, text, public.business_status[], uuid, uuid, public.listing_tier, public.lead_stage, boolean, int, int) to authenticated, service_role;
