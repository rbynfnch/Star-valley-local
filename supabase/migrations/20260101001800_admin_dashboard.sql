-- Admin dashboard counts (CLAUDE.md §8). Staff only: anyone else gets an error rather than partial numbers
-- (RLS alone would silently return only the public subset to a non-staff caller).
--   total               businesses that are not archived
--   prospects           status = prospect (imported / suggested, not yet published)
--   verified            Green or Gold, among published businesses
--   enhanced            published businesses with a live Enhanced listing (active, inside its dates)
--   featured            published businesses with a live placement (active, inside its dates)
--   needing_verification published businesses that are unverified, or whose verification is due within 14 days
--   pending_submissions  Suggest an Update / Suggest a Business / Submit an Event waiting for moderation
create function public.admin_dashboard_counts(p_tenant uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if not app.has_role(p_tenant, '{sales,editor}') then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return (
    with pub as (select b.* from public.businesses b where b.tenant_id = p_tenant and b.status in ('unclaimed', 'claimed'))
    select jsonb_build_object(
      'total',      (select count(*) from public.businesses where tenant_id = p_tenant and status <> 'archived'),
      'prospects',  (select count(*) from public.businesses where tenant_id = p_tenant and status = 'prospect'),
      'verified',   (select count(*) from pub where verification_level in ('green', 'gold')),
      'enhanced',   (select count(distinct l.business_id) from public.listings l join pub on pub.id = l.business_id
                      where l.tenant_id = p_tenant and l.tier = 'enhanced' and l.status = 'active'
                        and l.starts_at <= now() and (l.ends_at is null or l.ends_at > now())),
      'featured',   (select count(distinct p.business_id) from public.placements p join pub on pub.id = p.business_id
                      where p.tenant_id = p_tenant and p.status = 'active' and p.start_at <= now() and p.end_at > now()),
      'needing_verification', (select count(*) from pub where verification_level = 'none' or reverify_due_at < now() + interval '14 days'),
      'pending_submissions', (select count(*) from public.submissions where tenant_id = p_tenant and status = 'pending')
    ));
end $$;
revoke all on function public.admin_dashboard_counts(uuid) from public, anon;
grant execute on function public.admin_dashboard_counts(uuid) to authenticated, service_role;

-- The caller's own staff role in a tenant ('admin' | 'sales' | 'editor') or null. Platform admins count as admin.
-- security definer so it can see platform_admins (not exposed to clients); it only ever answers about auth.uid().
create function public.my_staff_role(p_tenant uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r text;
begin
  if (select auth.uid()) is null then return null; end if;
  if exists (select 1 from public.platform_admins where user_id = (select auth.uid())) then return 'admin'; end if;
  select s.role::text into r from public.tenant_staff s where s.tenant_id = p_tenant and s.user_id = (select auth.uid());
  return r;
end $$;
revoke all on function public.my_staff_role(uuid) from public, anon;
grant execute on function public.my_staff_role(uuid) to authenticated, service_role;
