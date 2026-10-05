#!/usr/bin/env bash
# Makes an existing account a staff member of the Star Valley tenant.
#   DATABASE_URL=... bash scripts/hosted/make-staff.sh you@example.com [admin|sales|editor]
# Create the account first (the site's /account/sign-up, or Supabase > Authentication > Users > Add user).
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
EMAIL="${1:?usage: make-staff.sh <email> [admin|sales|editor]}"; ROLE="${2:-admin}"
case "$ROLE" in admin|sales|editor) ;; *) echo "role must be admin, sales or editor"; exit 2 ;; esac
psql -X -q -v ON_ERROR_STOP=1 -v email="$EMAIL" -v role="$ROLE" "$DATABASE_URL" <<'SQL'
with u as (select id from auth.users where lower(email) = lower(:'email')),
     t as (select id from public.tenants where slug = 'star-valley')
insert into public.tenant_staff (tenant_id, user_id, role)
select t.id, u.id, :'role'::public.staff_role from t, u
on conflict (tenant_id, user_id) do update set role = excluded.role
returning 'staff: ' || :'role' as result;
SQL
echo "(no row printed above means that email has no account yet)"
