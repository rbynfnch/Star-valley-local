-- Claim + verify (CLAUDE.md §6): unclaimed -> claimed -> Green. Called ONLY by trusted server code (service_role): the
-- server has already authenticated the user and passes their id. No browser role can execute these, so a code can never
-- be fetched from the database by a client.
--
-- claim_start   creates a pending claim and returns the secret ONCE (the server texts / emails it; only its hash is stored).
--               The destination is taken from the business record, never from the caller.
-- claim_verify  checks the secret; on success links the user as owner and records the proof. Green is then derived by the
--               existing triggers (never set here).
--
-- Limits (all enforced here): only an unclaimed, published business can be claimed; <=3 starts per business per hour;
-- <=5 per user per day; <=300 per tenant per day (SMS-pumping guard); one new code per 60 s per business; a text code lasts
-- 10 minutes (an emailed link 1 hour) and allows 5 wrong attempts (the 5th wrong attempt rejects the claim).
create function public.claim_start(p_tenant uuid, p_business uuid, p_user uuid, p_method public.claim_method default 'sms_code') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  b public.businesses%rowtype; v_dest text; v_secret text; v_id uuid := gen_random_uuid();
  v_ttl interval;
begin
  v_ttl := case p_method when 'email_link' then interval '1 hour' else interval '10 minutes' end;     -- email can be slow; a text code is read at once
  if p_method not in ('sms_code', 'email_link') then raise exception 'unsupported claim method' using errcode = '22023'; end if;
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into b from public.businesses where id = p_business and tenant_id = p_tenant for update;
  if not found or b.status not in ('unclaimed', 'claimed') then raise exception 'business not found' using errcode = 'P0002'; end if;
  if b.status = 'claimed' or exists (select 1 from public.business_owners where business_id = b.id) then
    raise exception 'this business has already been claimed' using errcode = '22023';
  end if;
  v_dest := case p_method when 'sms_code' then nullif(regexp_replace(coalesce(b.phone, ''), '\D', '', 'g'), '') else nullif(btrim(coalesce(b.email, '')), '') end;
  if p_method = 'email_link' and v_dest !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then v_dest := null; end if;      -- a malformed address counts as none
  if v_dest is null then raise exception 'there is no % on file for this business', case p_method when 'sms_code' then 'phone number' else 'email address' end using errcode = '22023'; end if;
  if p_method = 'sms_code' and length(v_dest) = 10 then v_dest := '+1' || v_dest;
  elsif p_method = 'sms_code' and length(v_dest) = 11 and left(v_dest, 1) = '1' then v_dest := '+' || v_dest;
  elsif p_method = 'sms_code' then raise exception 'the phone number on file cannot receive text messages' using errcode = '22023'; end if;

  if exists (select 1 from public.claims where business_id = b.id and created_at > now() - interval '60 seconds') then
    raise exception 'a code was just sent; wait a minute before asking for another' using errcode = '53400';
  end if;
  if (select count(*) from public.claims where business_id = b.id and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.claims where claimant_user_id = p_user and created_at > now() - interval '1 day') >= 5
     or (select count(*) from public.claims where tenant_id = p_tenant and created_at > now() - interval '1 day') >= 300 then
    raise exception 'too many attempts; try again later' using errcode = '53400';
  end if;

  -- a new request replaces the user's earlier pending ones for this business
  update public.claims set status = 'cancelled' where business_id = b.id and claimant_user_id = p_user and status = 'pending';

  v_secret := case p_method
                when 'sms_code' then lpad((abs((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::int)::bigint) % 1000000)::text, 6, '0')
                else encode(gen_random_bytes(32), 'hex') end;
  insert into public.claims (id, tenant_id, business_id, method, status, claimant_user_id, destination, token_hash, expires_at)
    values (v_id, p_tenant, b.id, p_method, 'pending', p_user, v_dest, encode(digest(v_secret || ':' || v_id::text, 'sha256'), 'hex'), now() + v_ttl);
  return jsonb_build_object('claim_id', v_id, 'secret', v_secret, 'destination', v_dest, 'method', p_method, 'expires_at', now() + v_ttl);
end $$;

create function public.claim_verify(p_claim uuid, p_user uuid, p_secret text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.claims%rowtype; ok boolean; v_level public.verification_level; v_email text; v_biz uuid;
begin
  -- Lock order is always business first, then claim: two people verifying the same business at once queue up here
  -- (the loser is told it is taken) instead of both becoming owners or deadlocking.
  select business_id into v_biz from public.claims where id = p_claim;
  if v_biz is not null then perform 1 from public.businesses where id = v_biz for update; end if;
  select * into c from public.claims where id = p_claim for update;
  if not found or c.claimant_user_id is distinct from p_user then raise exception 'claim not found' using errcode = 'P0002'; end if;
  if c.status = 'verified' then return jsonb_build_object('result', 'verified', 'already', true); end if;
  if c.status <> 'pending' then return jsonb_build_object('result', c.status::text); end if;
  if c.expires_at <= now() then update public.claims set status = 'expired' where id = c.id; return jsonb_build_object('result', 'expired'); end if;
  if c.attempts >= 5 then update public.claims set status = 'rejected' where id = c.id; return jsonb_build_object('result', 'rejected'); end if;

  ok := c.token_hash = encode(digest(coalesce(btrim(p_secret), '') || ':' || c.id::text, 'sha256'), 'hex');
  update public.claims set attempts = attempts + 1 where id = c.id;
  if not ok then
    if c.attempts + 1 >= 5 then update public.claims set status = 'rejected' where id = c.id; return jsonb_build_object('result', 'rejected'); end if;
    return jsonb_build_object('result', 'wrong', 'attempts_left', 5 - (c.attempts + 1));
  end if;

  -- somebody else may have claimed it while this code was in flight
  if exists (select 1 from public.business_owners where business_id = c.business_id)
     or not exists (select 1 from public.businesses where id = c.business_id and status = 'unclaimed') then
    update public.claims set status = 'cancelled' where id = c.id;
    return jsonb_build_object('result', 'already_claimed');
  end if;

  update public.claims set status = 'verified', verified_at = now() where id = c.id;
  insert into public.business_owners (business_id, user_id, tenant_id, role) values (c.business_id, p_user, c.tenant_id, 'owner');
  insert into public.verification_proofs (tenant_id, business_id, kind, claim_id, evidence)
    values (c.tenant_id, c.business_id, c.method::text::public.proof_kind, c.id, jsonb_build_object('destination_last4', right(c.destination, 4)));
  -- any other pending claims on this business are void now
  update public.claims set status = 'cancelled' where business_id = c.business_id and status = 'pending' and id <> c.id;
  select email into v_email from auth.users where id = p_user;
  insert into public.communications (tenant_id, business_id, kind, subject, body)
    values (c.tenant_id, c.business_id, 'note', 'Claimed by the owner', 'Verified by ' || case c.method when 'sms_code' then 'text message code' else 'emailed link' end || ' (' || coalesce(v_email, 'unknown') || ')');
  select verification_level into v_level from public.businesses where id = c.business_id;
  return jsonb_build_object('result', 'verified', 'level', v_level, 'business_id', c.business_id);
end $$;

-- Housekeeping for the daily job: expire stale pending claims.
create function app.expire_claims() returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin update public.claims set status = 'expired' where status = 'pending' and expires_at <= now(); get diagnostics n = row_count; return n; end $$;

revoke all on function app.expire_claims() from public, anon, authenticated;
revoke all on function public.claim_start(uuid, uuid, uuid, public.claim_method) from public, anon, authenticated;
revoke all on function public.claim_verify(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_start(uuid, uuid, uuid, public.claim_method) to service_role;
grant execute on function public.claim_verify(uuid, uuid, text) to service_role;
