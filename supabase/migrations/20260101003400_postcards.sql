-- Postcard verification (Gold = Green + one extra proof; CLAUDE.md §6, §8 "generate postcard code batch for printing").
-- Staff create a batch for Green-verified businesses; each gets a printed card with a unique code (and a QR to the redeem page). The
-- plaintext code exists only in the batch function's result (shown once for printing); the database keeps a hash. The owner, signed in,
-- enters it; if it matches an unexpired code for a business they own, a `postcard` proof is added and the trigger lifts the listing to Gold.
--   postcard_batch_create   staff (sales): makes the codes
--   postcard_void           staff: voids an issued code (a lost or wrong card), so a new one can be issued
--   admin_postcard_overview staff: batches, code statuses and the businesses that can be sent a card
--   postcard_redeem         service role only: the owner's redemption (the server passes the signed-in user's id)
-- Writes are only through these functions: the tables become read-only for staff.

drop policy postcard_batches_sales on public.postcard_batches;
drop policy postcard_codes_sales on public.postcard_codes;
create policy postcard_batches_read on public.postcard_batches for select to authenticated using (app.has_role(tenant_id, '{sales}'));
create policy postcard_codes_read   on public.postcard_codes   for select to authenticated using (app.has_role(tenant_id, '{sales}'));
revoke insert, update, delete on public.postcard_batches, public.postcard_codes from authenticated;

create table public.postcard_attempts (
  id        bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants on delete cascade,
  user_id   uuid not null references auth.users on delete cascade,
  ok        boolean not null,
  at        timestamptz not null default now()
);
create index postcard_attempts_user on public.postcard_attempts (user_id, at);
alter table public.postcard_attempts enable row level security;
create policy postcard_attempts_none on public.postcard_attempts for select to authenticated using (false);   -- service role only
create trigger postcard_attempts_tenant_immutable before update on public.postcard_attempts for each row execute function app.forbid_tenant_change();

create function app.postcard_hash(p_code text) returns text language sql immutable set search_path = public, extensions as $$
  select encode(digest('postcard:' || upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex')
$$;

-- Businesses that can be sent a card: public, owned, Green (not yet Gold), and with no card still waiting.
create function app.postcard_eligible(p_tenant uuid, p_business uuid) returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from public.businesses b where b.id = p_business and b.tenant_id = p_tenant and b.status = 'claimed' and b.verification_level = 'green')
     and exists (select 1 from public.business_owners o where o.business_id = p_business)
     and not exists (select 1 from public.postcard_codes c where c.business_id = p_business and c.status = 'issued' and c.issued_at > now() - interval '90 days')
$$;

create function public.postcard_batch_create(p_tenant uuid, p_label text, p_businesses uuid[]) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_label text := nullif(btrim(coalesce(p_label, '')), ''); v_batch uuid := gen_random_uuid(); v_ids uuid[] := coalesce(p_businesses, '{}'); b uuid; k int;
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v_bytes bytea; v_code text; v_out jsonb := '[]'::jsonb; r record;
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  if v_label is null then raise exception 'name the batch (for example "October mailing")' using errcode = '22023'; end if;
  if length(v_label) > 80 then raise exception 'the batch name is limited to 80 characters' using errcode = '22023'; end if;
  if cardinality(v_ids) = 0 then raise exception 'choose at least one business' using errcode = '22023'; end if;
  if cardinality(v_ids) > 200 then raise exception 'a batch can have at most 200 cards' using errcode = '22023'; end if;
  if (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then raise exception 'a business can only appear once in a batch' using errcode = '22023'; end if;
  foreach b in array v_ids loop
    if not app.postcard_eligible(p_tenant, b) then
      raise exception 'a business in the list cannot be sent a card (it must be claimed, Green verified, not already Gold, and have no card waiting)' using errcode = '22023';
    end if;
  end loop;
  insert into public.postcard_batches (id, tenant_id, label, created_by) values (v_batch, p_tenant, v_label, (select auth.uid()));
  foreach b in array v_ids loop
    loop
      v_bytes := gen_random_bytes(10); v_code := '';
      for k in 0..9 loop v_code := v_code || substr(v_alpha, (get_byte(v_bytes, k) % 31) + 1, 1); end loop;
      begin
        insert into public.postcard_codes (tenant_id, batch_id, business_id, code_hash) values (p_tenant, v_batch, b, app.postcard_hash(v_code));
        exit;
      exception when unique_violation then null;
      end;
    end loop;
    select name, slug, address_line1, address_line2, city, state, postal_code into r from public.businesses where id = b;
    v_out := v_out || jsonb_build_array(jsonb_build_object('business_id', b, 'name', r.name, 'address_line1', r.address_line1, 'address_line2', r.address_line2, 'city', r.city, 'state', r.state, 'postal_code', r.postal_code, 'code', v_code));
    insert into public.communications (tenant_id, business_id, kind, subject, body, staff_id)
      values (p_tenant, b, 'postcard', 'Verification postcard issued', 'Batch: ' || v_label || '. Valid 90 days.', (select auth.uid()));
  end loop;
  return jsonb_build_object('batch_id', v_batch, 'label', v_label, 'cards', v_out);
end $$;

create function public.postcard_void(p_tenant uuid, p_code uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.postcard_codes%rowtype;
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  select * into c from public.postcard_codes where id = p_code and tenant_id = p_tenant for update;
  if not found then raise exception 'card not found' using errcode = 'P0002'; end if;
  if c.status <> 'issued' then raise exception 'only a card that is still waiting can be voided' using errcode = '22023'; end if;
  update public.postcard_codes set status = 'void' where id = c.id;
  insert into public.communications (tenant_id, business_id, kind, subject, body, staff_id)
    values (p_tenant, c.business_id, 'postcard', 'Verification postcard voided', null, (select auth.uid()));
end $$;

create function public.admin_postcard_overview(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_role(p_tenant, '{sales}') then raise exception 'sales staff only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'eligible', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'city', b.city) order by b.name)
                           from public.businesses b where b.tenant_id = p_tenant and app.postcard_eligible(p_tenant, b.id)), '[]'::jsonb),
    'batches', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'label', x.label, 'created_at', x.created_at,
                  'cards', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'business', bz.name, 'status',
                             case when c.status = 'issued' and c.issued_at <= now() - interval '90 days' then 'expired' else c.status::text end,
                             'issued_at', c.issued_at, 'redeemed_at', c.redeemed_at) order by bz.name)
                         from public.postcard_codes c join public.businesses bz on bz.id = c.business_id where c.batch_id = x.id), '[]'::jsonb)) order by x.created_at desc)
                  from (select * from public.postcard_batches where tenant_id = p_tenant order by created_at desc limit 20) x), '[]'::jsonb));
end $$;

-- The owner redeems a card. Any mismatch gives the same answer ("invalid") so codes cannot be probed; five failures an hour per account lock it out.
create function public.postcard_redeem(p_tenant uuid, p_user uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.postcard_codes%rowtype; v_hash text := app.postcard_hash(p_code); v_len int := length(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); b public.businesses%rowtype; v_fail int; v_email text;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'sign in first' using errcode = '28000'; end if;
  select count(*) into v_fail from public.postcard_attempts where user_id = p_user and not ok and at > now() - interval '1 hour';
  if v_fail >= 5 then raise exception 'too many wrong codes; try again in an hour' using errcode = '53400'; end if;
  if v_len <> 10 then insert into public.postcard_attempts (tenant_id, user_id, ok) values (p_tenant, p_user, false); return jsonb_build_object('result', 'invalid'); end if;
  select * into c from public.postcard_codes where tenant_id = p_tenant and code_hash = v_hash for update;
  if not found or not exists (select 1 from public.business_owners where business_id = c.business_id and user_id = p_user) then
    insert into public.postcard_attempts (tenant_id, user_id, ok) values (p_tenant, p_user, false);
    return jsonb_build_object('result', 'invalid');
  end if;
  select * into b from public.businesses where id = c.business_id;
  if c.status = 'redeemed' then return jsonb_build_object('result', 'already', 'slug', b.slug); end if;
  if c.status = 'void' then insert into public.postcard_attempts (tenant_id, user_id, ok) values (p_tenant, p_user, false); return jsonb_build_object('result', 'invalid'); end if;
  if c.issued_at <= now() - interval '90 days' then return jsonb_build_object('result', 'expired'); end if;
  if b.verification_level = 'none' then return jsonb_build_object('result', 'not_verified'); end if;      -- Gold is Green plus one more proof
  update public.postcard_codes set status = 'redeemed', redeemed_at = now() where id = c.id;
  insert into public.verification_proofs (tenant_id, business_id, kind, verified_by, evidence) values (c.tenant_id, c.business_id, 'postcard', p_user, jsonb_build_object('batch_id', c.batch_id));
  insert into public.postcard_attempts (tenant_id, user_id, ok) values (p_tenant, p_user, true);
  select email into v_email from auth.users where id = p_user;
  insert into public.communications (tenant_id, business_id, kind, subject, body) values (c.tenant_id, c.business_id, 'postcard', 'Postcard code redeemed', 'Confirmed by ' || coalesce(v_email, 'the owner') || '.');
  return jsonb_build_object('result', 'verified', 'level', (select verification_level from public.businesses where id = c.business_id), 'slug', b.slug, 'name', b.name);
end $$;

revoke all on function app.postcard_hash(text), app.postcard_eligible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.postcard_batch_create(uuid, text, uuid[]), public.postcard_void(uuid, uuid), public.admin_postcard_overview(uuid) from public, anon;
grant execute on function public.postcard_batch_create(uuid, text, uuid[]), public.postcard_void(uuid, uuid), public.admin_postcard_overview(uuid) to authenticated, service_role;
revoke all on function public.postcard_redeem(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.postcard_redeem(uuid, uuid, text) to service_role;
