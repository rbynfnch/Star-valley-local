-- The function privilege map: exactly these functions are callable by visitors, these by signed-in users, and everything else only by the server.
select test.ok((select string_agg(distinct p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute'))
  = 'article_category_counts,business_profile,directory_counts,hotlist_category_counts,hotlist_detail,hotlist_features_public,hotlist_list,list_articles,placement_scarcity,search_businesses',
  'FP1: anonymous visitors can execute exactly the ten public read functions');
select test.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('claim_start', 'claim_verify', 'claim_invite', 'claim_verify_invite', 'record_tracking', 'submission_create',
  'hotlist_claim', 'hotlist_my_claim', 'postcard_redeem', 'email_claim_batch', 'email_complete', 'email_fail', 'email_run_maintenance', 'record_email_suppression', 'claim_options', 'claim_preview', 'email_is_blocked',
  'claim_invite_preview', 'claim_invite_sent') and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  'FP2: the server-only functions (claims, tracking, email, Hotlist claims, postcard redemption) are not executable by signed-in users or visitors');
select test.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and not has_function_privilege('service_role', p.oid, 'execute')), 'FP3: the server role can execute every function');
select test.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname like 'admin\_%' and has_function_privilege('anon', p.oid, 'execute')), 'FP4: no admin function is callable anonymously');
