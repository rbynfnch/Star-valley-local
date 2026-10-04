-- Account credits. When a PAID Featured placement is ended early because verification lapsed, the business is
-- credited the unused part of what it paid. Comped placements (no payment) earn nothing.
--
-- Credit = amount paid for the placement x (unused time / total time), rounded to the cent.
--   * a placement that never started is credited in full;
--   * a placement extended by renewals uses the sum of its payments over its whole term;
--   * a paid placement with NO payment record earns nothing (staff can add a manual credit).
-- Credits are a ledger. Staff apply an available credit to the next invoice (or to Stripe customer balance once
-- self-serve billing exists in V2) and mark it applied; they can void or add manual credits. NOT done here:
-- cancelling a recurring Stripe subscription when its placement ends. The backend MUST do that, or the business
-- keeps being charged for a placement that no longer exists (see docs/NOTIFICATIONS.md).

create type public.credit_status as enum ('available', 'applied', 'void');

create table public.account_credits (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  business_id uuid not null,
  amount_cents int not null check (amount_cents > 0),
  currency    text not null default 'usd',
  reason      text not null check (reason in ('verification_lapse', 'manual', 'goodwill')),
  status      public.credit_status not null default 'available',
  placement_id uuid,
  grace_id    uuid,
  notes       text,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  applied_at  timestamptz,
  applied_note text,
  check (status <> 'applied' or applied_at is not null),
  foreign key (business_id, tenant_id)  references public.businesses (id, tenant_id) on delete cascade,
  foreign key (placement_id, tenant_id) references public.placements (id, tenant_id) on delete set null (placement_id),
  foreign key (grace_id, tenant_id)     references public.verification_grace (id, tenant_id) on delete set null (grace_id)
);
create unique index account_credits_once on public.account_credits (grace_id, placement_id) where grace_id is not null and placement_id is not null;
create index account_credits_business on public.account_credits (business_id, status);

-- Called by end_expired_graces() BEFORE it shortens the placements. Returns total cents credited.
create function app.credit_ended_placements(p_grace uuid, p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare g public.verification_grace; p record; paid int; cur text; frac numeric; amt int; total int := 0;
begin
  select * into g from public.verification_grace where id = p_grace;
  for p in select * from public.placements
           where business_id = g.business_id and source = 'paid' and status = 'active' and end_at > p_now loop
    select coalesce(sum(amount_cents), 0), coalesce(max(currency), 'usd') into paid, cur
      from public.payments where placement_id = p.id and status = 'paid';
    continue when paid <= 0;
    frac := case when p.start_at >= p_now then 1
                 else extract(epoch from (p.end_at - p_now)) / extract(epoch from (p.end_at - p.start_at)) end;
    amt := round(paid * frac);
    continue when amt <= 0;
    insert into public.account_credits (tenant_id, business_id, amount_cents, currency, reason, placement_id, grace_id, notes)
    values (g.tenant_id, g.business_id, amt, cur, 'verification_lapse', p.id, g.id,
            'Unused portion of a paid Featured placement ended after verification lapsed')
    on conflict (grace_id, placement_id) where grace_id is not null and placement_id is not null do nothing;
    total := total + amt;
  end loop;
  return total;
end $$;
revoke execute on function app.credit_ended_placements(uuid, timestamptz) from public, anon, authenticated;
grant  execute on function app.credit_ended_placements(uuid, timestamptz) to service_role;

alter table public.account_credits enable row level security;
grant select, update on public.account_credits to authenticated;    -- admin applies/voids via policy; rows created by
                                                                    -- the job or by admin through the service role
create policy credits_read on public.account_credits for select to authenticated
  using (app.has_role(tenant_id, '{sales}') or app.owns_business(business_id));
create policy credits_admin on public.account_credits for update to authenticated
  using (app.has_role(tenant_id, '{}')) with check (app.has_role(tenant_id, '{}'));
create trigger account_credits_tenant_immutable before update on public.account_credits
  for each row execute function app.forbid_tenant_change();

-- Only status/notes may change on an existing credit; the amount is part of the audit trail.
create function app.credits_guard() returns trigger language plpgsql as $$
begin
  if new.amount_cents is distinct from old.amount_cents or new.business_id is distinct from old.business_id
     or new.placement_id is distinct from old.placement_id or new.reason is distinct from old.reason then
    raise exception 'credit amount, business, placement and reason are immutable' using errcode = '42501';
  end if;
  if new.status = 'applied' and old.status <> 'applied' then new.applied_at := coalesce(new.applied_at, now()); end if;
  return new;
end $$;
create trigger account_credits_guard before update on public.account_credits for each row execute function app.credits_guard();
