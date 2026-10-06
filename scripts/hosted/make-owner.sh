#!/usr/bin/env bash
# TEST SITES ONLY. Makes an existing account the verified owner of a business WITHOUT the text-message or email claim step, so the owner
# dashboard can be tried before Twilio and Postmark are set up. It records the same kind of proof the real claim creates (marked as a test).
#   DATABASE_URL=... bash scripts/hosted/make-owner.sh you@example.com sample-valley-plumbing
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
EMAIL="${1:?usage: make-owner.sh <email> <business-slug>}"; SLUG="${2:?usage: make-owner.sh <email> <business-slug>}"
psql -X -q -v ON_ERROR_STOP=1 -v email="$EMAIL" -v slug="$SLUG" -d "$DATABASE_URL" <<'SQL'
with u as (select id from auth.users where lower(email) = lower(:'email')),
     b as (select id, tenant_id from public.businesses where slug = :'slug')
insert into public.business_owners (business_id, tenant_id, user_id)
select b.id, b.tenant_id, u.id from b, u on conflict do nothing;
insert into public.verification_proofs (tenant_id, business_id, kind, evidence)
select b.tenant_id, b.id, 'email_link', '{"test_site": true}'::jsonb from public.businesses b
 where b.slug = :'slug' and exists (select 1 from public.business_owners o where o.business_id = b.id)
   and not exists (select 1 from public.verification_proofs p where p.business_id = b.id and p.kind in ('sms_code', 'email_link') and p.revoked_at is null);
select b.name, b.status, b.verification_level from public.businesses b where b.slug = :'slug';
SQL
