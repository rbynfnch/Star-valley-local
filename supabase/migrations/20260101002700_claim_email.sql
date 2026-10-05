-- Claim by emailed link: the pieces the server needs around claim_start / claim_verify (service role only).
--   claim_options   what the claim page may offer, as MASKED hints (the listing's email is not public on Free listings)
--   claim_preview   what an emailed link is about to confirm, shown only to the account that asked for it
--   email_is_blocked  hard-bounce / complaint check before the server mails the listing's address
-- The link itself carries claim_start's 256-bit secret; only its hash is stored. Opening the link changes nothing: the
-- landing page asks the signed-in claimant to press a button, which calls claim_verify.

create function public.claim_options(p_tenant uuid, p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b public.businesses%rowtype; d text; e text;
begin
  select * into b from public.businesses where id = p_business and tenant_id = p_tenant;
  if not found or b.status <> 'unclaimed' or exists (select 1 from public.business_owners where business_id = b.id) then return null; end if;
  d := regexp_replace(coalesce(b.phone, ''), '\D', '', 'g');
  e := nullif(btrim(coalesce(b.email, '')), '');
  return jsonb_build_object(
    'phone_last4', case when length(d) in (10, 11) and (length(d) = 10 or left(d, 1) = '1') then right(d, 4) end,
    'email_hint', case when e ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then left(e, 1) || '•••@' || split_part(e, '@', 2) end);
end $$;

create function public.claim_preview(p_claim uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('business_name', b.name, 'slug', b.slug, 'status', c.status, 'method', c.method, 'expires_at', c.expires_at, 'expired', c.expires_at <= now())
    from public.claims c join public.businesses b on b.id = c.business_id
   where c.id = p_claim and c.claimant_user_id = p_user
$$;

create function public.email_is_blocked(p_tenant uuid, p_email text) returns boolean
language sql stable security definer set search_path = public as $$ select app.transactional_blocked(p_tenant, p_email) $$;

revoke all on function public.claim_options(uuid, uuid), public.claim_preview(uuid, uuid), public.email_is_blocked(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_options(uuid, uuid), public.claim_preview(uuid, uuid), public.email_is_blocked(uuid, text) to service_role;
