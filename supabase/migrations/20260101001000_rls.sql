-- Row-level security, grants, and tenant immutability.
--
-- Model
--   * anon / authenticated: may read PUBLIC catalog rows (published businesses, articles, events, deals,
--     active placements). Public data is not tenant-scoped on read: the site filters by its tenant, and
--     the data is public anyway. Everything private is gated by membership.
--   * staff:   rows in tenant_staff (admin | sales | editor) or platform_admins (cross-tenant).
--              'admin' satisfies every role check.
--   * owner:   rows in business_owners; scoped to their own businesses.
--   * service_role bypasses RLS (webhooks, import, claim flow, tracking ingest, subscribe endpoint, and the
--     quote-request / submission routes, which verify a Cloudflare Turnstile token before inserting).
--     Anonymous users have NO insert access to anything: a direct PostgREST insert would skip the captcha.
--   * listings/placements expose commercial fields (source: paid / founding_member...), so the public reads
--     them only through the views in the next migration, never the base tables.
--   * Default deny: a table/command with no matching policy is inaccessible.

-- ---------------------------------------------------------------------------------------------
-- Enable RLS everywhere, revoke Supabase's permissive default grants, then grant deliberately.
-- ---------------------------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

revoke execute on function app.recompute_verification(uuid), app.expire_verifications(), app.rollup_tracking(date)
  from public, anon, authenticated;
grant  execute on function app.recompute_verification(uuid), app.expire_verifications(), app.rollup_tracking(date)
  to service_role;

-- Helper: may the caller see this business row at all?
create function app.can_see_business(p_business uuid, p_tenant uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin return app.business_is_public(p_business) or app.is_staff(p_tenant) or app.owns_business(p_business); end $$;

-- Public readable tables.
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','tenant_domains','regions','communities','categories','article_categories','authors','event_categories',
    'businesses','business_categories','business_service_areas','business_hours','business_services','business_links',
    'business_faqs','business_photos','media_assets','placement_limits','tenant_products',
    'articles','article_items','community_events','deals'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- Signed-in users: DML is granted broadly, policies decide. (No policy => denied.)
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','tenant_domains','tenant_settings','regions','communities','categories','article_categories','authors',
    'event_categories','profiles','tenant_staff','businesses','business_categories','business_service_areas',
    'business_hours','business_services','business_links','business_faqs','business_photos','business_field_sources',
    'media_assets','listings','placements','placement_limits','tenant_products','business_owners','claims',
    'postcard_batches','postcard_codes','verification_proofs','articles','article_items','community_events','deals',
    'saved_items','business_crm','contacts','opportunities','communications','submissions','email_templates',
    'email_subscribers','suppressions','newsletters','campaigns','campaign_targets','campaign_steps',
    'campaign_recipients','message_deliveries','social_posts','billing_accounts','payments'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
grant select on public.tracking_events, public.business_stats_daily to authenticated;   -- no client writes
grant select on public.leads to authenticated;                                          -- inserts: service role only
grant update (status) on public.leads to authenticated;                                 -- owners triage only
-- not granted to any client role: platform_admins, stripe_events (service role only)

-- ---------------------------------------------------------------------------------------------
-- Tenancy & accounts
-- ---------------------------------------------------------------------------------------------
create policy tenants_read   on public.tenants for select to anon, authenticated using (is_active or app.is_staff(id));
create policy tenants_update on public.tenants for update to authenticated using (app.has_role(id, '{}')) with check (app.has_role(id, '{}'));
create policy tenants_platform on public.tenants for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy domains_read  on public.tenant_domains for select to anon, authenticated using (true);
create policy domains_admin on public.tenant_domains for all to authenticated using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));

create policy settings_admin on public.tenant_settings for all to authenticated using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));

create policy regions_read     on public.regions     for select to anon, authenticated using (true);
create policy regions_admin    on public.regions     for all to authenticated using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));
create policy communities_read on public.communities for select to anon, authenticated using (is_active or app.is_staff(tenant_id));
create policy communities_admin on public.communities for all to authenticated using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));
create policy categories_read  on public.categories  for select to anon, authenticated using (is_active or app.is_staff(tenant_id));
create policy categories_admin on public.categories  for all to authenticated using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));

create policy profiles_self_read   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy staff_read  on public.tenant_staff for select to authenticated using (user_id = (select auth.uid()) or app.has_role(tenant_id, '{}'));
create policy staff_admin on public.tenant_staff for all    to authenticated using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));

-- ---------------------------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------------------------
create policy businesses_read on public.businesses for select to anon, authenticated
  using (status in ('unclaimed', 'claimed') or app.is_staff(tenant_id) or app.owns_business(id));
create policy businesses_insert on public.businesses for insert to authenticated
  with check (app.has_role(tenant_id, '{sales}'));
create policy businesses_update on public.businesses for update to authenticated
  using (app.has_role(tenant_id, '{sales}') or app.owns_business(id))
  with check (app.has_role(tenant_id, '{sales}') or app.owns_business(id));
create policy businesses_delete on public.businesses for delete to authenticated using (app.has_role(tenant_id, '{}'));

-- Child tables sharing the "public if business public; staff/owner write" rule.
do $$
declare t text;
begin
  foreach t in array array['business_categories','business_service_areas','business_hours','business_photos'] loop
    execute format('create policy %1$s_read on public.%1$I for select to anon, authenticated using (app.can_see_business(business_id, tenant_id))', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated
                    using (app.has_role(tenant_id, ''{sales}'') or app.owns_business(business_id))
                    with check (app.has_role(tenant_id, ''{sales}'') or app.owns_business(business_id))', t);
  end loop;
  -- Enhanced-only content: hidden from the public (and unwritable by owners) unless the listing is Enhanced.
  foreach t in array array['business_services','business_links','business_faqs'] loop
    execute format('create policy %1$s_read on public.%1$I for select to anon, authenticated
                    using ((app.business_is_public(business_id) and app.business_is_enhanced(business_id))
                           or app.is_staff(tenant_id) or app.owns_business(business_id))', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated
                    using (app.has_role(tenant_id, ''{sales}'') or (app.owns_business(business_id) and app.business_is_enhanced(business_id)))
                    with check (app.has_role(tenant_id, ''{sales}'') or (app.owns_business(business_id) and app.business_is_enhanced(business_id)))', t);
  end loop;
end $$;

create policy field_sources_read on public.business_field_sources for select to authenticated
  using (app.is_staff(tenant_id) or app.owns_business(business_id));       -- written only by triggers

create policy media_read on public.media_assets for select to anon, authenticated
  using (is_public or app.is_staff(tenant_id) or uploaded_by = (select auth.uid())
         or (business_id is not null and app.owns_business(business_id)));
create policy media_insert on public.media_assets for insert to authenticated
  with check (app.is_staff(tenant_id) or (business_id is not null and app.owns_business(business_id)));
create policy media_delete on public.media_assets for delete to authenticated
  using (app.has_role(tenant_id, '{sales}') or uploaded_by = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Listings, placements, billing
-- ---------------------------------------------------------------------------------------------
create policy listings_read on public.listings for select to authenticated
  using (app.is_staff(tenant_id) or app.owns_business(business_id));       -- public reads public_listings
create policy listings_admin on public.listings for all to authenticated
  using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));

create policy placements_read on public.placements for select to authenticated
  using (app.has_role(tenant_id, '{sales}') or app.owns_business(business_id));   -- public reads public_placements
create policy placements_admin on public.placements for all to authenticated
  using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));
create policy placements_owner_request on public.placements for insert to authenticated      -- V2: join a waitlist
  with check (app.owns_business(business_id) and status in ('pending', 'waitlist') and created_by = (select auth.uid()));

create policy limits_read  on public.placement_limits for select to anon, authenticated using (true);
create policy limits_admin on public.placement_limits for all to authenticated using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));
create policy products_read  on public.tenant_products for select to anon, authenticated using (is_active or app.is_staff(tenant_id));
create policy products_admin on public.tenant_products for all to authenticated using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));

create policy billing_read  on public.billing_accounts for select to authenticated using (app.has_role(tenant_id, '{}') or app.owns_business(business_id));
create policy billing_admin on public.billing_accounts for all    to authenticated using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));
create policy payments_read  on public.payments for select to authenticated using (app.has_role(tenant_id, '{}') or app.owns_business(business_id));
create policy payments_admin on public.payments for all    to authenticated using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));

-- ---------------------------------------------------------------------------------------------
-- Ownership & verification
-- ---------------------------------------------------------------------------------------------
create policy owners_read  on public.business_owners for select to authenticated using (user_id = (select auth.uid()) or app.is_staff(tenant_id));
create policy owners_write on public.business_owners for all    to authenticated using (app.has_role(tenant_id, '{sales}')) with check (app.has_role(tenant_id, '{sales}'));

create policy proofs_read  on public.verification_proofs for select to authenticated using (app.is_staff(tenant_id) or app.owns_business(business_id));
create policy proofs_admin on public.verification_proofs for all    to authenticated using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));

-- ---------------------------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------------------------
create policy artcat_read  on public.article_categories for select to anon, authenticated using (is_active or app.is_staff(tenant_id));
create policy artcat_write on public.article_categories for all to authenticated using (app.has_role(tenant_id, '{editor}')) with check (app.has_role(tenant_id, '{editor}'));
create policy authors_read  on public.authors for select to anon, authenticated using (true);
create policy authors_write on public.authors for all to authenticated using (app.has_role(tenant_id, '{editor}')) with check (app.has_role(tenant_id, '{editor}'));
create policy evcat_read  on public.event_categories for select to anon, authenticated using (true);
create policy evcat_write on public.event_categories for all to authenticated using (app.has_role(tenant_id, '{editor}')) with check (app.has_role(tenant_id, '{editor}'));

-- 'scheduled' becomes live by time, so no cron is needed to flip it. audience='business' = Marketing Resources for owners.
create policy articles_read on public.articles for select to anon, authenticated
  using ((status in ('published', 'scheduled') and publish_at <= now()
          and (audience = 'public' or app.owns_any_business(tenant_id)))
         or app.has_role(tenant_id, '{editor}'));
create policy articles_write on public.articles for all to authenticated using (app.has_role(tenant_id, '{editor}')) with check (app.has_role(tenant_id, '{editor}'));
create policy article_items_read on public.article_items for select to anon, authenticated
  using (exists (select 1 from public.articles a where a.id = article_id));       -- inherits articles RLS
create policy article_items_write on public.article_items for all to authenticated using (app.has_role(tenant_id, '{editor}')) with check (app.has_role(tenant_id, '{editor}'));

create policy events_read  on public.community_events for select to anon, authenticated using (status = 'published' or app.has_role(tenant_id, '{sales,editor}'));
create policy events_write on public.community_events for all to authenticated using (app.has_role(tenant_id, '{editor}')) with check (app.has_role(tenant_id, '{editor}'));

create policy deals_read on public.deals for select to anon, authenticated
  using ((status in ('published', 'scheduled') and starts_at <= now() and (ends_at is null or ends_at > now())
          and app.business_is_public(business_id) and app.business_is_enhanced(business_id))
         or app.is_staff(tenant_id) or app.owns_business(business_id));
create policy deals_write on public.deals for all to authenticated
  using (app.has_role(tenant_id, '{sales,editor}') or (app.owns_business(business_id) and app.business_is_enhanced(business_id)))
  with check (app.has_role(tenant_id, '{sales,editor}') or (app.owns_business(business_id) and app.business_is_enhanced(business_id)));

create policy saved_own on public.saved_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- CRM & claim tooling: sales + admin only. Editors and owners never see any of it.
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['business_crm','contacts','opportunities','communications','claims','postcard_batches','postcard_codes'] loop
    execute format('create policy %1$s_sales on public.%1$I for all to authenticated
                    using (app.has_role(tenant_id, ''{sales}'')) with check (app.has_role(tenant_id, ''{sales}''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Consumer-originated rows
-- ---------------------------------------------------------------------------------------------
-- Quote requests and submissions are inserted ONLY by server routes (service role) after a Turnstile check.
-- The rules (Enhanced-only quotes, pending-only submissions) are enforced by triggers in the engagement
-- migration, so they hold for the service role too.
create policy leads_read   on public.leads for select to authenticated using (app.owns_business(business_id) or app.has_role(tenant_id, '{sales}'));
create policy leads_update on public.leads for update to authenticated
  using (app.owns_business(business_id) or app.has_role(tenant_id, '{sales}'))
  with check (app.owns_business(business_id) or app.has_role(tenant_id, '{sales}'));

create policy submissions_staff on public.submissions for all to authenticated
  using (app.has_role(tenant_id, '{sales,editor}')) with check (app.has_role(tenant_id, '{sales,editor}'));

create policy tracking_read on public.tracking_events for select to authenticated
  using (app.has_role(tenant_id, '{sales}') or (business_id is not null and app.owns_business(business_id)));
create policy stats_read on public.business_stats_daily for select to authenticated
  using (app.has_role(tenant_id, '{sales}') or app.owns_business(business_id));

-- ---------------------------------------------------------------------------------------------
-- Marketing (V3). Editors run content/newsletter/social; campaigns need admin to write.
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['email_templates','email_subscribers','newsletters','social_posts'] loop
    execute format('create policy %1$s_editor on public.%1$I for all to authenticated
                    using (app.has_role(tenant_id, ''{editor}'')) with check (app.has_role(tenant_id, ''{editor}''))', t);
  end loop;
  foreach t in array array['campaigns','campaign_targets','campaign_steps','campaign_recipients'] loop
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (app.has_role(tenant_id, ''{sales}''))', t);
    execute format('create policy %1$s_admin on public.%1$I for all to authenticated
                    using (app.has_role(tenant_id, ''{}'')) with check (app.has_role(tenant_id, ''{}''))', t);
  end loop;
end $$;
create policy suppressions_read  on public.suppressions for select to authenticated using (app.has_role(tenant_id, '{editor,sales}'));
create policy suppressions_admin on public.suppressions for all    to authenticated using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));
create policy deliveries_read on public.message_deliveries for select to authenticated using (app.has_role(tenant_id, '{}'));

-- ---------------------------------------------------------------------------------------------
-- tenant_id is immutable on every table that has one.
-- ---------------------------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'tenant_id' and tb.table_type = 'BASE TABLE' loop
    execute format('create trigger %1$s_tenant_immutable before update on public.%1$I
                    for each row execute function app.forbid_tenant_change()', t.table_name);
  end loop;
end $$;
