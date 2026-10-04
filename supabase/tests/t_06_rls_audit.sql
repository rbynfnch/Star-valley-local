-- Structural audit: nothing slips through when a new table is added without RLS/policies.
select test.ok(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
               'every public table has RLS enabled');
select test.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'public' and c.relkind = 'r' and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
                             and c.relname not in ('platform_admins', 'stripe_events')),
               'every public table except service-only ones has at least one policy');
select test.ok(not exists (select 1 from information_schema.role_table_grants
                           where table_schema = 'public' and grantee = 'anon' and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')),
               'anon has no UPDATE/DELETE/TRUNCATE anywhere');
select test.ok(not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and privilege_type = 'INSERT'),
               'anon has no INSERT anywhere (all anonymous writes go through captcha-protected server routes)');
select test.ok(not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' and table_name in ('leads') and privilege_type = 'INSERT'),
               'signed-in users cannot insert leads directly either');
select test.ok(not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and table_name in ('listings', 'placements')),
               'anon cannot read base listings/placements (commercial fields)');
select test.ok(not exists (select 1 from information_schema.role_table_grants
                           where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name in ('platform_admins', 'stripe_events')),
               'service-only tables have no client grants');
select test.ok(not exists (select 1 from information_schema.columns c
                           where c.table_schema = 'public' and c.column_name = 'tenant_id'
                             and not exists (select 1 from pg_trigger t join pg_class k on k.oid = t.tgrelid
                                             where k.relname = c.table_name and t.tgname like '%_tenant_immutable')
                             and c.table_name in (select tablename from pg_tables where schemaname = 'public')),
               'every table with tenant_id has the immutability trigger');
select test.ok(not exists (select 1 from pg_tables t where schemaname = 'public'
                           and not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t.tablename and c.column_name in ('tenant_id', 'id', 'user_id', 'domain', 'business_id'))
                           and t.tablename not in ('tenants', 'profiles', 'stripe_events', 'platform_admins')),
               'tenant data tables carry tenant_id (or are an explicit exception)');
