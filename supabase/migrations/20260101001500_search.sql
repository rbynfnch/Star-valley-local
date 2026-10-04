-- Public directory search (CLAUDE.md §3: Postgres full-text). One function so ranking, filters and paging live in
-- the database and are tested there. SECURITY INVOKER: it runs with the caller's rights, so for anon every row is
-- still filtered by RLS (published businesses only; Enhanced-only services and live deals only; no commercial fields).
-- Exposed to the API as /rpc/search_businesses.
--
-- Matching (text): full-text on name/short description/description, OR the name containing the text, OR a fuzzy
-- name match (typos), OR a matching Enhanced service, OR a matching category name.
-- Filters: communities (home OR served), categories (primary OR secondary), verified, live Featured placement,
-- live deal, accepts quote requests (= Enhanced), price range.
-- p_ids: NULL = no restriction; an EMPTY ARRAY = match nothing. A caller that builds the list with a subquery that finds
-- nothing gets NULL (array_agg of zero rows), i.e. NO restriction: always pass an explicit empty array, never NULL.
-- Paid placement NEVER changes organic ranking: Featured businesses get their own labelled strips elsewhere, and
-- `live_placement` here is only a flag for the badge and the "Featured only" filter.

create function public.search_businesses(
  p_tenant uuid,
  p_q text default null,
  p_communities uuid[] default null,
  p_categories uuid[] default null,
  p_verified boolean default false,
  p_featured boolean default false,
  p_with_deals boolean default false,
  p_accepts_quotes boolean default false,
  p_price smallint[] default null,
  p_sort text default 'relevance',
  p_limit int default 12,
  p_offset int default 0,
  p_ids uuid[] default null)          -- restrict to these businesses (used by the Featured strips)
returns table (
  id uuid, slug text, name text, short_description text, home_community_id uuid, primary_category_id uuid,
  phone text, website text, address_line1 text, city text, state text, postal_code text,
  verification_level public.verification_level, price_range smallint,
  live_placement boolean, accepts_quotes boolean, has_live_deal boolean, total_count bigint)
language sql stable security invoker set search_path = public, extensions as $$
  with q as (
    select t.txt,
           case when t.txt is null then null::tsquery else websearch_to_tsquery('english', t.txt) end as tsq
    from (select nullif(trim(left(coalesce(p_q, ''), 100)), '') as txt) t
  ),
  hits as (
    select b.*,
      (q.txt is not null and strpos(lower(b.name), lower(q.txt)) > 0) as name_hit,
      (q.txt is not null and exists (select 1 from public.business_services s where s.business_id = b.id and strpos(lower(s.name), lower(q.txt)) > 0)) as service_hit,
      (q.txt is not null and exists (select 1 from public.categories c where c.id = b.primary_category_id and strpos(lower(c.name), lower(q.txt)) > 0)) as category_hit,
      case when q.txt is null then 0 else greatest(word_similarity(lower(q.txt), lower(b.name)), 0) end as sim,
      case when q.txt is null then 0 else ts_rank_cd(b.search_tsv, q.tsq) end as rank
    from public.businesses b, q
    where b.tenant_id = p_tenant
      and (p_ids is null or b.id = any (p_ids))
      and (p_communities is null or b.home_community_id = any (p_communities)
           or exists (select 1 from public.business_service_areas a where a.business_id = b.id and a.community_id = any (p_communities)))
      and (p_categories is null or b.primary_category_id = any (p_categories)
           or exists (select 1 from public.business_categories bc where bc.business_id = b.id and bc.category_id = any (p_categories)))
      and (not coalesce(p_verified, false) or b.verification_level <> 'none')
      and (p_price is null or b.price_range = any (p_price))
  ),
  filtered as (
    select h.*,
      exists (select 1 from public.public_placements pp where pp.business_id = h.id) as live_placement,
      exists (select 1 from public.public_listings l where l.business_id = h.id and l.tier = 'enhanced') as accepts_quotes,
      exists (select 1 from public.deals d where d.business_id = h.id) as has_live_deal
    from hits h, q
    where (q.txt is null or h.search_tsv @@ q.tsq or h.name_hit or h.service_hit or h.category_hit or h.sim > 0.45)
  ),
  scored as (
    select f.*, (f.rank + f.sim * 0.8 + (case when f.name_hit then 0.5 else 0 end)
                 + (case when f.service_hit then 0.2 else 0 end) + (case when f.category_hit then 0.2 else 0 end)) as score
    from filtered f
    where (not coalesce(p_featured, false) or f.live_placement)
      and (not coalesce(p_with_deals, false) or f.has_live_deal)
      and (not coalesce(p_accepts_quotes, false) or f.accepts_quotes)
  )
  select s.id, s.slug, s.name, s.short_description, s.home_community_id, s.primary_category_id,
         s.phone, s.website, s.address_line1, s.city, s.state, s.postal_code,
         s.verification_level, s.price_range, s.live_placement, s.accepts_quotes, s.has_live_deal,
         count(*) over () as total_count
  from scored s
  order by case when coalesce(p_sort, 'relevance') <> 'name' then s.score end desc nulls last, s.name asc, s.id   -- only 'name' sorts by name; anything else is relevance
  limit greatest(1, least(coalesce(p_limit, 12), 50))
  offset greatest(0, coalesce(p_offset, 0))
$$;

revoke all on function public.search_businesses(uuid, text, uuid[], uuid[], boolean, boolean, boolean, boolean, smallint[], text, int, int, uuid[]) from public;
grant execute on function public.search_businesses(uuid, text, uuid[], uuid[], boolean, boolean, boolean, boolean, smallint[], text, int, int, uuid[]) to anon, authenticated, service_role;

-- How many public businesses fall under each category and community, in ONE call, for the SEO hub pages.
-- A business counts toward a category if it is its primary or a secondary category, and toward that category's PARENT
-- too (a top-level category includes its subcategories); and toward a community if it is based there OR serves it.
-- NULL means "all":  (category, community) = a combination page;  (category, NULL) = a category page;
-- (NULL, community) = a community page;  (NULL, NULL) = every public business.
-- Pages for combinations that never occur here (no row) must 404 instead of existing as thin, empty pages.
create function public.directory_counts(p_tenant uuid)
returns table (category_id uuid, community_id uuid, n bigint)
language sql stable security invoker set search_path = public as $$
  with biz as (
    select b.id, b.home_community_id, b.primary_category_id from public.businesses b where b.tenant_id = p_tenant
  ),
  own as (
    select b.id as business_id, b.primary_category_id as category_id from biz b where b.primary_category_id is not null
    union
    select x.business_id, x.category_id from public.business_categories x join biz b on b.id = x.business_id
  ),
  bc as (
    select o.business_id, o.category_id from own o
    union
    select o.business_id, c.parent_id from own o join public.categories c on c.id = o.category_id where c.parent_id is not null
  ),
  bm as (
    select b.id as business_id, b.home_community_id as community_id from biz b where b.home_community_id is not null
    union
    select a.business_id, a.community_id from public.business_service_areas a join biz b on b.id = a.business_id
  ),
  pairs as (select bc.business_id, bc.category_id, bm.community_id from bc join bm using (business_id))
  select p.category_id, p.community_id, count(distinct p.business_id)::bigint
  from pairs p
  group by grouping sets ((p.category_id, p.community_id), (p.category_id), (p.community_id), ())
  having count(distinct p.business_id) > 0        -- never emit a zero row (an unknown tenant would otherwise get a (NULL, NULL, 0) grand total)
$$;
revoke all on function public.directory_counts(uuid) from public;
grant execute on function public.directory_counts(uuid) to anon, authenticated, service_role;
