-- Admin claim links ("send a claim link"): staff issue a link for an unclaimed business; the SERVER delivers it to the phone
-- or email already ON FILE for the listing (never to an address staff type), so receiving it is the same proof as the
-- self-serve flow and the result is Green. The link is not tied to an account: whoever holds it (the listing's own inbox or
-- phone) signs in or creates an account and presses Confirm, which binds the claim to that account and verifies it.
--   claim_invite          service role only; the server action checks staff role first and passes the staff id
--   claim_invite_preview  what the landing page may show, only to someone who holds the secret
--   claim_verify_invite   binds an invite to the signed-in account (once the secret matches), then runs claim_verify
--   admin_claim_overview  staff view: masked destinations on file and the recent invites
create function public.claim_invite(p_tenant uuid, p_business uuid, p_staff uuid, p_method public.claim_method) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b public.businesses%rowtype; v_dest text; v_secret text; v_id uuid := gen_random_uuid(); v_ttl interval := interval '7 days';
begin
  if p_method not in ('sms_code', 'email_link') then raise exception 'unsupported claim method' using errcode = '22023'; end if;
  if p_staff is null or not (exists (select 1 from public.tenant_staff where user_id = p_staff and tenant_id = p_tenant and role in ('admin', 'sales'))
                              or exists (select 1 from public.platform_admins where user_id = p_staff)) then
    raise exception 'sales staff only' using errcode = '42501';
  end if;
  select * into b from public.businesses where id = p_business and tenant_id = p_tenant for update;
  if not found or b.status <> 'unclaimed' then raise exception 'only an unclaimed, published business can be sent a claim link' using errcode = '22023'; end if;
  if exists (select 1 from public.business_owners where business_id = b.id) then raise exception 'this business has already been claimed' using errcode = '22023'; end if;
  v_dest := case p_method when 'sms_code' then nullif(regexp_replace(coalesce(b.phone, ''), '\D', '', 'g'), '') else nullif(btrim(coalesce(b.email, '')), '') end;
  if p_method = 'email_link' and v_dest !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then v_dest := null; end if;
  if v_dest is null then raise exception 'there is no % on file for this business', case p_method when 'sms_code' then 'phone number' else 'email address' end using errcode = '22023'; end if;
  if p_method = 'sms_code' and length(v_dest) = 10 then v_dest := '+1' || v_dest;
  elsif p_method = 'sms_code' and length(v_dest) = 11 and left(v_dest, 1) = '1' then v_dest := '+' || v_dest;
  elsif p_method = 'sms_code' then raise exception 'the phone number on file cannot receive text messages' using errcode = '22023'; end if;
  if exists (select 1 from public.claims where business_id = b.id and created_at > now() - interval '60 seconds') then
    raise exception 'a link was just sent; wait a minute before sending another' using errcode = '53400';
  end if;
  if (select count(*) from public.claims where business_id = b.id and created_at > now() - interval '1 day') >= 5
     or (select count(*) from public.claims where tenant_id = p_tenant and created_at > now() - interval '1 day') >= 300 then
    raise exception 'too many links today for this business; try again tomorrow' using errcode = '53400';
  end if;
  -- a new link replaces earlier pending invites for this business (self-serve claims by a signed-in user are left alone)
  update public.claims set status = 'cancelled' where business_id = b.id and claimant_user_id is null and status = 'pending';
  v_secret := encode(gen_random_bytes(32), 'hex');
  insert into public.claims (id, tenant_id, business_id, method, status, claimant_user_id, destination, token_hash, expires_at, created_by)
    values (v_id, p_tenant, b.id, p_method, 'pending', null, v_dest, encode(digest(v_secret || ':' || v_id::text, 'sha256'), 'hex'), now() + v_ttl, p_staff);
  return jsonb_build_object('claim_id', v_id, 'secret', v_secret, 'destination', v_dest, 'method', p_method, 'business_name', b.name, 'expires_at', now() + v_ttl);
end $$;

-- Logged after the server has actually delivered the link, so the log never claims a send that failed.
create function public.claim_invite_sent(p_claim uuid, p_staff uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.claims%rowtype;
begin
  select * into c from public.claims where id = p_claim and created_by = p_staff and claimant_user_id is null;
  if not found then return; end if;
  insert into public.communications (tenant_id, business_id, kind, subject, body, staff_id)
    values (c.tenant_id, c.business_id, case c.method when 'sms_code' then 'sms' else 'email' end::public.comm_kind, 'Claim link sent',
            case c.method when 'sms_code' then 'Text to the number on file ending ' else 'Email to the address on file at ' end ||
            case c.method when 'sms_code' then right(c.destination, 4) else split_part(c.destination, '@', 2) end || '. Valid 7 days.', p_staff);
end $$;

create function public.claim_invite_preview(p_claim uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare c public.claims%rowtype;
begin
  select * into c from public.claims where id = p_claim and claimant_user_id is null and created_by is not null;
  if not found or c.token_hash <> encode(digest(coalesce(btrim(p_secret), '') || ':' || c.id::text, 'sha256'), 'hex') then return null; end if;
  return (select jsonb_build_object('business_name', b.name, 'slug', b.slug, 'status', c.status, 'method', c.method, 'expires_at', c.expires_at, 'expired', c.expires_at <= now(), 'invite', true)
            from public.businesses b where b.id = c.business_id);
end $$;

create function public.claim_verify_invite(p_claim uuid, p_user uuid, p_secret text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.claims%rowtype; v_biz uuid;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'sign in first' using errcode = '28000'; end if;
  select business_id into v_biz from public.claims where id = p_claim;
  if v_biz is not null then perform 1 from public.businesses where id = v_biz for update; end if;   -- same lock order as claim_verify
  select * into c from public.claims where id = p_claim for update;
  if not found then raise exception 'claim not found' using errcode = 'P0002'; end if;
  if c.claimant_user_id is null then
    if c.created_by is null then raise exception 'claim not found' using errcode = 'P0002'; end if;   -- only staff-issued invites can be adopted
    if c.status <> 'pending' then return jsonb_build_object('result', c.status::text); end if;
    if c.expires_at <= now() then update public.claims set status = 'expired' where id = c.id; return jsonb_build_object('result', 'expired'); end if;
    if c.attempts >= 5 then update public.claims set status = 'rejected' where id = c.id; return jsonb_build_object('result', 'rejected'); end if;
    if c.token_hash <> encode(digest(coalesce(btrim(p_secret), '') || ':' || c.id::text, 'sha256'), 'hex') then
      update public.claims set attempts = attempts + 1, status = case when attempts + 1 >= 5 then 'rejected' else status end where id = c.id;
      return jsonb_build_object('result', 'wrong', 'attempts_left', greatest(0, 5 - (c.attempts + 1)));
    end if;
    update public.claims set claimant_user_id = p_user where id = c.id;
  elsif c.claimant_user_id <> p_user then
    raise exception 'claim not found' using errcode = 'P0002';
  end if;
  return public.claim_verify(p_claim, p_user, p_secret);
end $$;

create function public.admin_claim_overview(p_tenant uuid, p_business uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare b public.businesses%rowtype; d text; e text;
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  select * into b from public.businesses where id = p_business and tenant_id = p_tenant;
  if not found then raise exception 'business not found' using errcode = 'P0002'; end if;
  d := regexp_replace(coalesce(b.phone, ''), '\D', '', 'g');
  e := nullif(btrim(coalesce(b.email, '')), '');
  return jsonb_build_object(
    'status', b.status,
    'owned', exists (select 1 from public.business_owners where business_id = b.id),
    'phone_last4', case when length(d) in (10, 11) and (length(d) = 10 or left(d, 1) = '1') then right(d, 4) end,
    'email_hint', case when e ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then left(e, 1) || '•••@' || split_part(e, '@', 2) end,
    'invites', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'status', case when status = 'pending' and expires_at <= now() then 'expired' else status::text end,
                          'created_at', created_at, 'expires_at', expires_at, 'verified_at', verified_at) order by created_at desc)
                          from (select * from public.claims where business_id = b.id and created_by is not null order by created_at desc limit 5) x), '[]'::jsonb));
end $$;

revoke all on function public.claim_invite(uuid, uuid, uuid, public.claim_method), public.claim_invite_sent(uuid, uuid), public.claim_invite_preview(uuid, text), public.claim_verify_invite(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_invite(uuid, uuid, uuid, public.claim_method), public.claim_invite_sent(uuid, uuid), public.claim_invite_preview(uuid, text), public.claim_verify_invite(uuid, uuid, text) to service_role;
revoke all on function public.admin_claim_overview(uuid, uuid) from public, anon;
grant execute on function public.admin_claim_overview(uuid, uuid) to authenticated, service_role;
