-- RLS for the grace/notification tables, tenant immutability, an admin view, and the daily schedule.

alter table public.tenant_policies    enable row level security;
alter table public.verification_grace enable row level security;
alter table public.notifications      enable row level security;

grant select, update on public.tenant_policies to authenticated;           -- admin edits via policy
grant select on public.verification_grace, public.notifications to authenticated;   -- written only by definer functions

create policy policies_read  on public.tenant_policies for select to authenticated using (app.is_staff(tenant_id));
create policy policies_admin on public.tenant_policies for update to authenticated
  using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));
-- sales see who is at risk (they do the outreach); owners see their own state on their business page
create policy grace_read on public.verification_grace for select to authenticated
  using (app.has_role(tenant_id, '{sales}') or app.owns_business(business_id));
create policy notifications_admin on public.notifications for select to authenticated
  using (app.has_role(tenant_id, '{}'));                                  -- audit trail of what was sent to whom

create trigger tenant_policies_tenant_immutable    before update on public.tenant_policies    for each row execute function app.forbid_tenant_change();
create trigger verification_grace_tenant_immutable before update on public.verification_grace for each row execute function app.forbid_tenant_change();
create trigger notifications_tenant_immutable      before update on public.notifications      for each row execute function app.forbid_tenant_change();

-- Admin dashboard: Featured businesses that lost verification and are counting down. Runs with the CALLER's
-- rights, so RLS on verification_grace/businesses decides who sees what.
create view public.featured_at_risk with (security_invoker = true) as
select g.id as grace_id, g.tenant_id, g.business_id, b.name as business_name, b.slug as business_slug,
       g.started_at, g.ends_at, greatest(ceil(extract(epoch from (g.ends_at - now())) / 86400), 0)::int as days_left
from public.verification_grace g join public.businesses b on b.id = g.business_id
where g.resolved_at is null;
grant select on public.featured_at_risk to authenticated;

-- Daily schedule (07:15 Mountain). pg_cron is available on Supabase; skipped silently where it is not installed
-- (local test harness). The EMAIL SENDING worker is triggered separately (see docs/NOTIFICATIONS.md).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('svl-daily-maintenance', '15 13 * * *', 'select app.run_daily_maintenance()');
  else
    raise notice 'pg_cron not available: schedule app.run_daily_maintenance() daily from your scheduler';
  end if;
end $$;
