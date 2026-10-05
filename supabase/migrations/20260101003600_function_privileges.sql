-- Function privileges, made explicit. On a hosted Supabase project every new function in `public` is executable by anon and authenticated BY
-- DEFAULT (default privileges), which the earlier migrations did not need to think about on a plain Postgres. This pins each function to the
-- audience it was written for, and stops new functions from inheriting the broad default:
--   anon-callable   the public directory, profile, article and Hotlist reads
--   signed-in       staff and owner functions (each checks its caller's role itself, as a second gate)
--   service role    everything the server runs on someone's behalf: claims, tracking, email, Hotlist claims, postcard redemption
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

do $$
declare
  r record;
  anon_ok text[] := array['article_category_counts', 'business_profile', 'directory_counts', 'hotlist_category_counts', 'hotlist_detail', 'hotlist_features_public',
                          'hotlist_list', 'list_articles', 'placement_scarcity', 'search_businesses'];
  signed_in text[] := array['activate_listing', 'activate_placement', 'add_business_photo', 'add_communication', 'add_to_waitlist', 'admin_business_activity', 'admin_business_detail',
    'admin_claim_overview', 'admin_dashboard_counts', 'admin_email_queue', 'admin_list_businesses', 'admin_list_submissions', 'admin_placements_overview', 'admin_postcard_overview',
    'business_content', 'clear_content_image', 'delete_article', 'delete_business_photo', 'delete_deal', 'delete_event', 'delete_hotlist_item', 'end_listing', 'end_placement',
    'import_businesses', 'join_waitlist', 'my_staff_role', 'owner_business_activity', 'owner_dashboard', 'postcard_batch_create', 'postcard_void', 'redeem_hotlist_code',
    'reorder_business_photos', 'retry_notification', 'review_hotlist_item', 'review_submission', 'save_article', 'save_deal', 'save_event', 'save_hotlist_item', 'set_business_areas',
    'set_business_faqs', 'set_business_hours', 'set_business_links', 'set_business_services', 'set_business_status', 'set_content_image', 'set_hotlist_features', 'set_lead_stage',
    'submit_hotlist_offer', 'update_business_fields', 'update_business_photo'];
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' loop
    if r.proname = any (anon_ok) then
      execute format('revoke execute on function %s from public', r.sig);
      execute format('grant execute on function %s to anon, authenticated, service_role', r.sig);
    elsif r.proname = any (signed_in) then
      execute format('revoke execute on function %s from public, anon', r.sig);
      execute format('grant execute on function %s to authenticated, service_role', r.sig);
    else
      execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end $$;
