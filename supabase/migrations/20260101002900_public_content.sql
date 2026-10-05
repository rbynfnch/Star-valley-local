-- Public reads for the articles pages. Row visibility is the articles RLS policy (published, publish_at passed, public audience for
-- anonymous readers); these functions add search, paging and counts, and never return the article body (list views do not need it).

create function public.list_articles(p_tenant uuid, p_q text default null, p_category uuid default null, p_featured boolean default false, p_limit int default 12, p_offset int default 0)
returns table (id uuid, slug text, title text, excerpt text, category_id uuid, author_id uuid, cover_media_id uuid, read_minutes smallint, featured_rank smallint, publish_at timestamptz, total_count bigint)
language sql stable security invoker set search_path = public as $$
  with q as (select case when nullif(btrim(coalesce(p_q, '')), '') is null then null else websearch_to_tsquery('english', left(btrim(p_q), 200)) end as t),
  hits as (
    select a.*, case when (select t from q) is null then 0 else ts_rank(a.search_tsv, (select t from q)) end as rank
      from public.articles a
     where a.tenant_id = p_tenant and a.audience = 'public' and a.status in ('published', 'scheduled') and a.publish_at <= now()
       and (p_category is null or a.category_id = p_category)
       and (not coalesce(p_featured, false) or a.featured_rank is not null)
       and ((select t from q) is null or a.search_tsv @@ (select t from q)))
  select h.id, h.slug, h.title, h.excerpt, h.category_id, h.author_id, h.cover_media_id, h.read_minutes, h.featured_rank, h.publish_at, count(*) over () as total_count
    from hits h
   order by case when coalesce(p_featured, false) then h.featured_rank end asc nulls last, h.rank desc, h.publish_at desc, h.id
   limit greatest(1, least(coalesce(p_limit, 12), 50)) offset greatest(0, coalesce(p_offset, 0))
$$;

create function public.article_category_counts(p_tenant uuid) returns table (category_id uuid, n bigint)
language sql stable security invoker set search_path = public as $$
  select a.category_id, count(*) from public.articles a
   where a.tenant_id = p_tenant and a.audience = 'public' and a.status in ('published', 'scheduled') and a.publish_at <= now()
   group by a.category_id
$$;

revoke all on function public.list_articles(uuid, text, uuid, boolean, int, int), public.article_category_counts(uuid) from public;
grant execute on function public.list_articles(uuid, text, uuid, boolean, int, int), public.article_category_counts(uuid) to anon, authenticated, service_role;
