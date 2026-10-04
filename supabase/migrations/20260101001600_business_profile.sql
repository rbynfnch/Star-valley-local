-- One call for the public business profile page: public.business_profile(tenant, slug) -> jsonb (or NULL).
-- SECURITY INVOKER, so for anon every row is still filtered by RLS (published businesses only; services, links, FAQs and
-- live deals only while the business is Enhanced). On top of RLS, THIS function is the single place that decides what a
-- FREE listing shows versus an ENHANCED one (CLAUDE.md §6), so the page cannot leak Enhanced content by accident:
--
--   FREE     name, category, community, address, phone, website, hours (+ note), short description, price level,
--            verification badge, and at most ONE photo plus the logo.
--   ENHANCED all of that, plus the full description, highlights, public email, every photo, services, social links
--            and FAQs, and live deals.
--
-- Never returned, for anyone: source/created_by/status columns, legal name, coordinates, Google place id, CRM data,
-- ratings or reviews (the platform does not store them), distance or "open now".
-- "tier" comes from public_listings, never from the base listings table (which anon cannot read).

create function public.business_profile(p_tenant uuid, p_slug text)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with b as (
    select * from public.businesses where tenant_id = p_tenant and slug = p_slug
  ),
  t as (
    select exists (select 1 from public.public_listings l join b on b.id = l.business_id where l.tier = 'enhanced') as enhanced
  ),
  ph as (
    select p.role, p.caption, p.sort_order, m.alt_text, m.storage_bucket, m.storage_path, m.width, m.height,
           sum((p.role <> 'logo')::int) over (order by case p.role when 'logo' then 0 when 'cover' then 1 else 2 end, p.sort_order, p.id
                                              rows between unbounded preceding and current row) as nonlogo_no,
           row_number() over (order by case p.role when 'logo' then 0 when 'cover' then 1 else 2 end, p.sort_order, p.id) as ord
    from public.business_photos p
    join public.media_assets m on m.id = p.media_asset_id
    join b on b.id = p.business_id
  )
  select jsonb_build_object(
    'tier', case when t.enhanced then 'enhanced' else 'free' end,
    'business', jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'name', b.name, 'status', b.status,
      'short_description', b.short_description,
      'description', case when t.enhanced then b.description end,
      'highlights', case when t.enhanced then to_jsonb(b.highlights) else '[]'::jsonb end,
      'hours_note', b.hours_note, 'price_range', b.price_range,
      'phone', b.phone, 'website', b.website, 'email', case when t.enhanced then b.email end,
      'address_line1', b.address_line1, 'address_line2', b.address_line2, 'city', b.city, 'state', b.state, 'postal_code', b.postal_code,
      'home_community_id', b.home_community_id, 'primary_category_id', b.primary_category_id,
      'verification_level', b.verification_level, 'verified_at', b.verified_at, 'reverify_due_at', b.reverify_due_at),
    'live_placement', exists (select 1 from public.public_placements pp where pp.business_id = b.id),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('day_of_week', h.day_of_week, 'opens', h.opens, 'closes', h.closes) order by h.day_of_week, h.opens)
                       from public.business_hours h where h.business_id = b.id), '[]'::jsonb),
    'service_area_community_ids', coalesce((select jsonb_agg(a.community_id) from public.business_service_areas a where a.business_id = b.id), '[]'::jsonb),
    'category_ids', coalesce((select jsonb_agg(bc.category_id) from public.business_categories bc where bc.business_id = b.id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('role', ph.role, 'caption', ph.caption, 'alt', ph.alt_text, 'bucket', ph.storage_bucket,
                                                            'path', ph.storage_path, 'width', ph.width, 'height', ph.height) order by ph.ord)
                        from ph where t.enhanced or ph.role = 'logo' or ph.nonlogo_no = 1), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', s.name) order by s.sort_order, s.name) from public.business_services s where s.business_id = b.id), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'url', l.url) order by l.kind) from public.business_links l where l.business_id = b.id), '[]'::jsonb),
    'faqs', coalesce((select jsonb_agg(jsonb_build_object('question', f.question, 'answer', f.answer) order by f.sort_order, f.question) from public.business_faqs f where f.business_id = b.id), '[]'::jsonb),
    'deals', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'description', d.description, 'terms', d.terms, 'discount_type', d.discount_type,
                                                           'discount_value', d.discount_value, 'ends_at', d.ends_at) order by d.ends_at nulls last, d.title)
                       from public.deals d where d.business_id = b.id), '[]'::jsonb)
  )
  from b, t
$$;
revoke all on function public.business_profile(uuid, text) from public;
grant execute on function public.business_profile(uuid, text) to anon, authenticated, service_role;
