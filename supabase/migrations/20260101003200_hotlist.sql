-- Local Hotlist: a curated, editorial franchise that replaces the Deals page. Two kinds of item:
--   deal  an offer with a real saving (original value, Hotlist price, end date, optional quantity, redemption steps)
--   pick  an editorial recommendation with no discount
-- Nothing is auto-published: staff write items (or approve a business's submission), and staff choose what sits in the
-- "hottest right now", "this week" and "Hotlist business" slots. "GET DEAL" is a CLAIM: it reserves a personal code for a signed-in
-- account; nobody pays us (the customer pays the Hotlist price to the business when redeeming), so no payments are involved.
-- The per-business `deals` table stays for the profile's own Deals section; this is a separate, curated layer.

create type public.hotlist_kind     as enum ('deal', 'pick');
create type public.hotlist_category as enum ('places', 'eat_drink', 'things_to_do', 'shop', 'new_notable');
create type public.hotlist_status   as enum ('draft', 'pending', 'published', 'rejected', 'archived');
create type public.hotlist_slot     as enum ('hottest', 'this_week', 'business');
create type public.hotlist_badge    as enum ('hot_deal', 'local_exclusive', 'limited_drop', 'hotlist_pick');

create table public.hotlist_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants on delete cascade,
  business_id   uuid not null,
  kind          public.hotlist_kind not null,
  category      public.hotlist_category not null,
  badge         public.hotlist_badge not null,
  slug          text not null,
  title         text not null,
  summary       text,
  body          text,
  image_media_id uuid,
  status        public.hotlist_status not null default 'draft',
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz,
  original_cents int,
  price_cents   int,
  quantity      int,
  code_prefix   text,
  redemption    text,
  terms         text,
  submitted_by  uuid references auth.users on delete set null,
  reviewed_by   uuid references auth.users on delete set null,
  reviewed_at   timestamptz,
  reject_reason text,
  published_at  timestamptz,
  created_by    uuid references auth.users on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search_tsv    tsvector generated always as (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(body, '')), 'C')) stored,
  unique (tenant_id, slug),
  unique (id, tenant_id),
  foreign key (business_id, tenant_id)     references public.businesses (id, tenant_id) on delete cascade,
  foreign key (image_media_id, tenant_id)  references public.media_assets (id, tenant_id),
  check (ends_at is null or ends_at > starts_at),
  check (kind = 'pick' or (original_cents is not null and price_cents is not null and ends_at is not null and code_prefix is not null and redemption is not null
                           and original_cents > price_cents and price_cents >= 0)),
  check (kind = 'deal' or (original_cents is null and price_cents is null and quantity is null and code_prefix is null)),
  check (quantity is null or quantity > 0),
  check (status <> 'published' or published_at is not null),
  check ((kind = 'deal' and badge <> 'hotlist_pick') or (kind = 'pick' and badge = 'hotlist_pick'))
);
create index hotlist_items_live on public.hotlist_items (tenant_id, status, ends_at);
create index hotlist_items_business on public.hotlist_items (business_id);
create index hotlist_items_search on public.hotlist_items using gin (search_tsv);
create trigger hotlist_items_touch before update on public.hotlist_items for each row execute function app.touch_updated_at();
create trigger hotlist_items_tenant_immutable before update on public.hotlist_items for each row execute function app.forbid_tenant_change();

-- Editorial slots: a short ordered list per slot, replaced as a whole by staff. (A list, not a flag on the item.)
create table public.hotlist_features (
  tenant_id uuid not null,
  item_id   uuid not null,
  slot      public.hotlist_slot not null,
  position  smallint not null check (position between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (item_id, slot),
  unique (tenant_id, slot, position),
  foreign key (item_id, tenant_id) references public.hotlist_items (id, tenant_id) on delete cascade
);
create trigger hotlist_features_tenant_immutable before update on public.hotlist_features for each row execute function app.forbid_tenant_change();

-- A claim is a person's personal code for a deal. Only the service role creates them (hotlist_claim).
create table public.hotlist_claims (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  item_id     uuid not null,
  user_id     uuid not null references auth.users on delete cascade,
  code        text not null,
  created_at  timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users on delete set null,
  unique (item_id, user_id),
  unique (item_id, code),
  foreign key (item_id, tenant_id) references public.hotlist_items (id, tenant_id) on delete cascade
);
create index hotlist_claims_user on public.hotlist_claims (user_id, created_at);
create trigger hotlist_claims_tenant_immutable before update on public.hotlist_claims for each row execute function app.forbid_tenant_change();

alter table public.hotlist_items  enable row level security;
alter table public.hotlist_features enable row level security;
alter table public.hotlist_claims enable row level security;
-- Visitors never read these tables directly; they use the public functions below. Staff and owners read through RLS.
create policy hotlist_items_staff on public.hotlist_items for select to authenticated using (app.has_role(tenant_id, '{editor}'));
create policy hotlist_items_owner_read on public.hotlist_items for select to authenticated using (app.owns_business(business_id));
create policy hotlist_features_staff on public.hotlist_features for select to authenticated using (app.has_role(tenant_id, '{editor}'));
create policy hotlist_claims_read on public.hotlist_claims for select to authenticated
  using (user_id = (select auth.uid()) or app.has_role(tenant_id, '{sales,editor}') or exists (select 1 from public.hotlist_items i where i.id = item_id and app.owns_business(i.business_id)));
-- Read-only for signed-in users: every write goes through the functions below, so the quality rules cannot be bypassed.
grant select on public.hotlist_items, public.hotlist_features to authenticated;
grant select on public.hotlist_claims to authenticated;

-- ----------------------------------------------------------------------------------------------------------- validation
-- One rule set for staff and for business submissions. "No weak offers": a saving of at least $10 or 20%.
create function app.hotlist_clean(p_fields jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_kind text := f->>'kind'; v_title text := nullif(btrim(coalesce(f->>'title', '')), '');
  v_summary text := nullif(btrim(coalesce(f->>'summary', '')), ''); v_body text := nullif(btrim(coalesce(f->>'body', '')), '');
  v_orig int; v_price int; v_qty int; v_prefix text := upper(nullif(btrim(coalesce(f->>'code_prefix', '')), ''));
  v_red text := nullif(btrim(coalesce(f->>'redemption', '')), ''); v_terms text := nullif(btrim(coalesce(f->>'terms', '')), '');
  v_start timestamptz; v_end timestamptz; v_badge text := f->>'badge'; v_cat text := f->>'category';
begin
  if v_kind not in ('deal', 'pick') then raise exception 'choose deal or pick' using errcode = '22023'; end if;
  if v_cat is null or v_cat not in ('places', 'eat_drink', 'things_to_do', 'shop', 'new_notable') then raise exception 'choose a category' using errcode = '22023'; end if;
  if v_title is null or length(v_title) < 3 then raise exception 'the title is too short' using errcode = '22023'; end if;
  if length(v_title) > 90 then raise exception 'the title is limited to 90 characters' using errcode = '22023'; end if;
  if length(coalesce(v_summary, '')) > 180 then raise exception 'the one-line summary is limited to 180 characters' using errcode = '22023'; end if;
  if length(coalesce(v_body, '')) > 4000 then raise exception 'the description is limited to 4000 characters' using errcode = '22023'; end if;
  if length(coalesce(v_terms, '')) > 1000 or length(coalesce(v_red, '')) > 500 then raise exception 'the terms are limited to 1000 characters and the redemption steps to 500' using errcode = '22023'; end if;
  begin v_start := coalesce(nullif(f->>'starts_at', '')::timestamptz, now()); v_end := nullif(f->>'ends_at', '')::timestamptz;
  exception when others then raise exception 'those dates are not valid' using errcode = '22023'; end;
  if v_end is not null and v_end <= v_start then raise exception 'the end must come after the start' using errcode = '22023'; end if;
  if v_kind = 'pick' then
    if v_badge is distinct from 'hotlist_pick' then raise exception 'a pick carries the Hotlist Pick label' using errcode = '22023'; end if;
    if nullif(f->>'original_cents', '') is not null or nullif(f->>'price_cents', '') is not null or nullif(f->>'quantity', '') is not null then raise exception 'a pick has no price' using errcode = '22023'; end if;
    return jsonb_build_object('kind', 'pick', 'category', v_cat, 'badge', 'hotlist_pick', 'title', v_title, 'summary', v_summary, 'body', v_body, 'starts_at', v_start, 'ends_at', v_end, 'terms', v_terms);
  end if;
  if v_badge is null or v_badge not in ('hot_deal', 'local_exclusive', 'limited_drop') then raise exception 'choose the deal label' using errcode = '22023'; end if;
  begin v_orig := (f->>'original_cents')::int; v_price := (f->>'price_cents')::int; v_qty := nullif(f->>'quantity', '')::int;
  exception when others then raise exception 'prices must be whole numbers of cents' using errcode = '22023'; end;
  if v_orig is null or v_price is null then raise exception 'a deal needs the original value and the Hotlist price' using errcode = '22023'; end if;
  if v_orig > 1000000 or v_orig <= 0 or v_price < 0 then raise exception 'those prices are not valid' using errcode = '22023'; end if;
  if v_price >= v_orig then raise exception 'the Hotlist price must be lower than the original value' using errcode = '22023'; end if;
  if (v_orig - v_price) < 1000 and (v_orig - v_price) * 5 < v_orig then raise exception 'a Hotlist deal has to save at least $10 or 20%%' using errcode = '22023'; end if;
  if v_end is null then raise exception 'a deal needs an end date' using errcode = '22023'; end if;
  if v_end > v_start + interval '120 days' then raise exception 'a deal can run for at most 120 days' using errcode = '22023'; end if;
  if v_qty is not null and v_qty not between 1 and 10000 then raise exception 'the quantity must be between 1 and 10,000' using errcode = '22023'; end if;
  if v_prefix is null or v_prefix !~ '^[A-Z0-9]{3,8}$' then raise exception 'the code prefix is 3 to 8 letters or digits' using errcode = '22023'; end if;
  if v_red is null then raise exception 'say how to redeem it' using errcode = '22023'; end if;
  return jsonb_build_object('kind', 'deal', 'category', v_cat, 'badge', v_badge, 'title', v_title, 'summary', v_summary, 'body', v_body, 'starts_at', v_start, 'ends_at', v_end,
    'original_cents', v_orig, 'price_cents', v_price, 'quantity', v_qty, 'code_prefix', v_prefix, 'redemption', v_red, 'terms', v_terms);
end $$;

create function app.hotlist_slug(p_tenant uuid, p_title text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_slug text := app.slugify(p_title); n int := 1;
begin
  while exists (select 1 from public.hotlist_items where tenant_id = p_tenant and slug = case when n = 1 then v_slug else v_slug || '-' || n end) loop n := n + 1; end loop;
  return case when n = 1 then v_slug else v_slug || '-' || n end;
end $$;

-- ------------------------------------------------------------------------------------------------------- staff writes
create function public.save_hotlist_item(p_tenant uuid, p_id uuid, p_business uuid, p_fields jsonb, p_status public.hotlist_status) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c jsonb; v_id uuid := p_id; v_old public.hotlist_items%rowtype; v_has_image boolean;
begin
  perform app.content_guard_editor(p_tenant);
  if p_status not in ('draft', 'pending', 'published', 'archived') then raise exception 'an item is a draft, pending, published or archived' using errcode = '22023'; end if;
  c := app.hotlist_clean(p_fields);
  if not exists (select 1 from public.businesses where id = p_business and tenant_id = p_tenant) then raise exception 'unknown business' using errcode = '22023'; end if;
  if p_status = 'published' and not app.business_is_public(p_business) then raise exception 'only a published business can be on the Hotlist' using errcode = '22023'; end if;
  if v_id is null then
    if p_status = 'published' then raise exception 'save it as a draft, add a photo, then publish' using errcode = '22023'; end if;
    insert into public.hotlist_items (tenant_id, business_id, kind, category, badge, slug, title, summary, body, status, starts_at, ends_at, original_cents, price_cents, quantity, code_prefix, redemption, terms, created_by)
      values (p_tenant, p_business, (c->>'kind')::public.hotlist_kind, (c->>'category')::public.hotlist_category, (c->>'badge')::public.hotlist_badge, app.hotlist_slug(p_tenant, c->>'title'), c->>'title', c->>'summary', c->>'body', p_status,
              (c->>'starts_at')::timestamptz, (c->>'ends_at')::timestamptz, (c->>'original_cents')::int, (c->>'price_cents')::int, (c->>'quantity')::int, c->>'code_prefix', c->>'redemption', c->>'terms', (select auth.uid()))
      returning id into v_id;
  else
    select * into v_old from public.hotlist_items where id = v_id and tenant_id = p_tenant for update;
    if not found then raise exception 'item not found' using errcode = 'P0002'; end if;
    if v_old.status = 'rejected' and p_status <> 'archived' then raise exception 'a rejected submission stays rejected; archive it or create a new item' using errcode = '22023'; end if;
    if exists (select 1 from public.hotlist_claims where item_id = v_id)
       and (v_old.kind::text <> c->>'kind' or v_old.original_cents is distinct from (c->>'original_cents')::int or v_old.price_cents is distinct from (c->>'price_cents')::int
            or v_old.code_prefix is distinct from c->>'code_prefix' or v_old.business_id <> p_business) then
      raise exception 'people have already claimed this deal, so its price, code and business can no longer change' using errcode = '22023';
    end if;
    if exists (select 1 from public.hotlist_claims where item_id = v_id) and (c->>'quantity')::int is not null
       and (c->>'quantity')::int < (select count(*) from public.hotlist_claims where item_id = v_id) then
      raise exception 'the quantity cannot be lower than the number already claimed' using errcode = '22023';
    end if;
    select image_media_id is not null into v_has_image from public.hotlist_items where id = v_id;
    if p_status = 'published' and not v_has_image then raise exception 'add a photo before publishing: the Hotlist is photography-led' using errcode = '22023'; end if;
    update public.hotlist_items set business_id = p_business, kind = (c->>'kind')::public.hotlist_kind, category = (c->>'category')::public.hotlist_category, badge = (c->>'badge')::public.hotlist_badge,
           title = c->>'title', summary = c->>'summary', body = c->>'body', status = p_status, starts_at = (c->>'starts_at')::timestamptz, ends_at = (c->>'ends_at')::timestamptz,
           original_cents = (c->>'original_cents')::int, price_cents = (c->>'price_cents')::int, quantity = (c->>'quantity')::int, code_prefix = c->>'code_prefix', redemption = c->>'redemption', terms = c->>'terms',
           published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end,
           reviewed_by = case when p_status = 'published' and v_old.status = 'pending' then (select auth.uid()) else reviewed_by end,
           reviewed_at = case when p_status = 'published' and v_old.status = 'pending' then now() else reviewed_at end
     where id = v_id and tenant_id = p_tenant;
    if p_status <> 'published' then delete from public.hotlist_features where item_id = v_id; end if;   -- unpublished items leave their slots
  end if;
  return v_id;
end $$;

-- Approve or reject a business's submission (or any pending item). A rejection needs a reason the business can be told.
create function public.review_hotlist_item(p_tenant uuid, p_id uuid, p_decision text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.hotlist_items%rowtype; v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 500);
begin
  perform app.content_guard_editor(p_tenant);
  select * into v from public.hotlist_items where id = p_id and tenant_id = p_tenant for update;
  if not found then raise exception 'item not found' using errcode = 'P0002'; end if;
  if v.status <> 'pending' then raise exception 'only a pending item can be approved or rejected' using errcode = '22023'; end if;
  if p_decision = 'reject' then
    if v_reason is null then raise exception 'say why, so the business knows what to change' using errcode = '22023'; end if;
    update public.hotlist_items set status = 'rejected', reject_reason = v_reason, reviewed_by = (select auth.uid()), reviewed_at = now() where id = p_id;
  elsif p_decision = 'approve' then
    if v.image_media_id is null then raise exception 'add a photo before approving' using errcode = '22023'; end if;
    if not app.business_is_public(v.business_id) then raise exception 'only a published business can be on the Hotlist' using errcode = '22023'; end if;
    if v.ends_at is not null and v.ends_at <= now() then raise exception 'this offer has already ended' using errcode = '22023'; end if;
    update public.hotlist_items set status = 'published', published_at = coalesce(published_at, now()), reject_reason = null, reviewed_by = (select auth.uid()), reviewed_at = now() where id = p_id;
  else raise exception 'approve or reject' using errcode = '22023'; end if;
end $$;

create function public.delete_hotlist_item(p_tenant uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  perform app.content_guard_editor(p_tenant);
  select i.status, i.image_media_id, m.storage_bucket as bucket, m.storage_path as path into v from public.hotlist_items i left join public.media_assets m on m.id = i.image_media_id where i.id = p_id and i.tenant_id = p_tenant;
  if not found then raise exception 'item not found' using errcode = 'P0002'; end if;
  if v.status in ('published', 'pending') then raise exception 'archive a published or pending item instead of deleting it' using errcode = '22023'; end if;
  if exists (select 1 from public.hotlist_claims where item_id = p_id) then raise exception 'people have claimed this deal, so it can only be archived' using errcode = '22023'; end if;
  delete from public.hotlist_items where id = p_id and tenant_id = p_tenant;
  if v.image_media_id is not null then delete from public.media_assets where id = v.image_media_id and tenant_id = p_tenant; end if;
  return jsonb_build_object('bucket', v.bucket, 'path', v.path);
end $$;

-- Replace the items in one editorial slot. Limits: hottest 3, this week 8, Hotlist business 1.
create function public.set_hotlist_features(p_tenant uuid, p_slot public.hotlist_slot, p_items uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_max int := case p_slot when 'hottest' then 3 when 'this_week' then 8 else 1 end; v_items uuid[] := coalesce(p_items, '{}'); v_id uuid; n int := 0;
begin
  perform app.content_guard_editor(p_tenant);
  if cardinality(v_items) > v_max then raise exception 'this slot holds at most % item(s)', v_max using errcode = '22023'; end if;
  if (select count(distinct x) from unnest(v_items) x) <> cardinality(v_items) then raise exception 'an item can only appear once in a slot' using errcode = '22023'; end if;
  foreach v_id in array v_items loop
    if not exists (select 1 from public.hotlist_items where id = v_id and tenant_id = p_tenant and status = 'published' and (ends_at is null or ends_at > now())) then
      raise exception 'only published, current items can be featured' using errcode = '22023';
    end if;
  end loop;
  delete from public.hotlist_features where tenant_id = p_tenant and slot = p_slot;
  foreach v_id in array v_items loop n := n + 1; insert into public.hotlist_features (tenant_id, item_id, slot, position) values (p_tenant, v_id, p_slot, n); end loop;
end $$;

-- A business owner with an Enhanced listing proposes a deal. It sits in the approval queue; nothing is published without staff.
create function public.submit_hotlist_offer(p_tenant uuid, p_business uuid, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c jsonb; v_id uuid;
begin
  if (select auth.uid()) is null or not app.owns_business(p_business) then raise exception 'only the business owner can submit an offer' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_business and tenant_id = p_tenant) then raise exception 'unknown business' using errcode = '22023'; end if;
  if not app.business_is_enhanced(p_business) then raise exception 'Hotlist offers are part of an Enhanced listing' using errcode = '22023'; end if;
  if coalesce(p_fields->>'kind', '') <> 'deal' then raise exception 'businesses submit deals; picks are chosen by our editors' using errcode = '22023'; end if;
  if (select count(*) from public.hotlist_items where business_id = p_business and status = 'pending') >= 3 then raise exception 'you already have three offers waiting for review' using errcode = '53400'; end if;
  c := app.hotlist_clean(p_fields);
  insert into public.hotlist_items (tenant_id, business_id, kind, category, badge, slug, title, summary, body, status, starts_at, ends_at, original_cents, price_cents, quantity, code_prefix, redemption, terms, submitted_by, created_by)
    values (p_tenant, p_business, 'deal', (c->>'category')::public.hotlist_category, (c->>'badge')::public.hotlist_badge, app.hotlist_slug(p_tenant, c->>'title'), c->>'title', c->>'summary', c->>'body', 'pending',
            (c->>'starts_at')::timestamptz, (c->>'ends_at')::timestamptz, (c->>'original_cents')::int, (c->>'price_cents')::int, (c->>'quantity')::int, c->>'code_prefix', c->>'redemption', c->>'terms', (select auth.uid()), (select auth.uid()))
    returning id into v_id;
  return v_id;
end $$;

-- Mark a claim redeemed (staff, e.g. when the business phones in or staff are at the counter).
create function public.redeem_hotlist_code(p_tenant uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(btrim(coalesce(p_code, ''))); c public.hotlist_claims%rowtype; t text;
begin
  if not app.has_role(p_tenant, '{sales,editor}') then raise exception 'staff only' using errcode = '42501'; end if;
  if v_code !~ '^[A-Z0-9]{3,8}-[A-Z0-9]{5}$' then raise exception 'that is not a Hotlist code' using errcode = '22023'; end if;
  select * into c from public.hotlist_claims where tenant_id = p_tenant and code = v_code for update;
  if not found then raise exception 'no claim has that code' using errcode = 'P0002'; end if;
  select title into t from public.hotlist_items where id = c.item_id;
  if c.redeemed_at is not null then return jsonb_build_object('result', 'already_redeemed', 'title', t, 'redeemed_at', c.redeemed_at); end if;
  update public.hotlist_claims set redeemed_at = now(), redeemed_by = (select auth.uid()) where id = c.id;
  return jsonb_build_object('result', 'redeemed', 'title', t);
end $$;

-- ------------------------------------------------------------------------------------------------------ public reads
-- Visitors read through these (security definer, explicit visibility rules): published, started, business public. The list
-- hides ended offers; the detail page still shows them (as Expired) so shared links do not break.
create function public.hotlist_list(p_tenant uuid, p_kind text default null, p_category text default null, p_q text default null, p_community uuid default null,
                                    p_max_price_cents int default null, p_sort text default 'newest', p_limit int default 12, p_offset int default 0)
returns table (id uuid, slug text, kind public.hotlist_kind, category public.hotlist_category, badge public.hotlist_badge, title text, summary text, business_id uuid, business_name text, business_slug text,
               community_id uuid, image_media_id uuid, starts_at timestamptz, ends_at timestamptz, original_cents int, price_cents int, quantity int, claimed_count bigint, published_at timestamptz, total_count bigint)
language sql stable security definer set search_path = public as $$
  with q as (select case when nullif(btrim(coalesce(p_q, '')), '') is null then null else websearch_to_tsquery('english', left(btrim(p_q), 200)) end as t),
  hits as (
    select i.*, b.name as bname, b.slug as bslug, b.home_community_id as comm,
           (select count(*) from public.hotlist_claims c where c.item_id = i.id) as claimed,
           case when (select t from q) is null then 0 else ts_rank(i.search_tsv, (select t from q)) end as rank
      from public.hotlist_items i join public.businesses b on b.id = i.business_id and b.tenant_id = i.tenant_id
     where i.tenant_id = p_tenant and i.status = 'published' and i.starts_at <= now() and (i.ends_at is null or i.ends_at > now())
       and b.status in ('unclaimed', 'claimed')
       and (p_kind is null or i.kind::text = p_kind)
       and (p_category is null or i.category::text = p_category)
       and (p_community is null or b.home_community_id = p_community)
       and (p_max_price_cents is null or (i.kind = 'deal' and i.price_cents <= p_max_price_cents))
       and ((select t from q) is null or i.search_tsv @@ (select t from q)))
  select h.id, h.slug, h.kind, h.category, h.badge, h.title, h.summary, h.business_id, h.bname, h.bslug, h.comm, h.image_media_id, h.starts_at, h.ends_at, h.original_cents, h.price_cents, h.quantity, h.claimed,
         h.published_at, count(*) over () as total_count
    from hits h
   order by case when p_sort = 'ending' then h.ends_at end asc nulls last,
            case when p_sort = 'popular' then h.claimed end desc nulls last,
            case when (select t from q) is not null and p_sort not in ('ending', 'popular', 'newest') then h.rank end desc,
            h.published_at desc, h.id
   limit greatest(1, least(coalesce(p_limit, 12), 50)) offset greatest(0, coalesce(p_offset, 0))
$$;

create function public.hotlist_detail(p_tenant uuid, p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', i.id, 'slug', i.slug, 'kind', i.kind, 'category', i.category, 'badge', i.badge, 'title', i.title, 'summary', i.summary, 'body', i.body,
         'business_id', b.id, 'business_name', b.name, 'business_slug', b.slug, 'community_id', b.home_community_id, 'image_media_id', i.image_media_id,
         'starts_at', i.starts_at, 'ends_at', i.ends_at, 'original_cents', i.original_cents, 'price_cents', i.price_cents, 'quantity', i.quantity,
         'redemption', i.redemption, 'terms', i.terms, 'published_at', i.published_at,
         'claimed_count', (select count(*) from public.hotlist_claims c where c.item_id = i.id))
    from public.hotlist_items i join public.businesses b on b.id = i.business_id and b.tenant_id = i.tenant_id
   where i.tenant_id = p_tenant and i.slug = p_slug and i.status = 'published' and i.starts_at <= now() and b.status in ('unclaimed', 'claimed')
$$;

create function public.hotlist_features_public(p_tenant uuid) returns table (slot public.hotlist_slot, "position" smallint, item_id uuid)
language sql stable security definer set search_path = public as $$
  select f.slot, f.position, f.item_id
    from public.hotlist_features f join public.hotlist_items i on i.id = f.item_id and i.tenant_id = f.tenant_id
    join public.businesses b on b.id = i.business_id
   where f.tenant_id = p_tenant and i.status = 'published' and i.starts_at <= now() and (i.ends_at is null or i.ends_at > now()) and b.status in ('unclaimed', 'claimed')
   order by f.slot, f.position
$$;

create function public.hotlist_category_counts(p_tenant uuid) returns table (category public.hotlist_category, kind public.hotlist_kind, n bigint)
language sql stable security definer set search_path = public as $$
  select i.category, i.kind, count(*) from public.hotlist_items i join public.businesses b on b.id = i.business_id
   where i.tenant_id = p_tenant and i.status = 'published' and i.starts_at <= now() and (i.ends_at is null or i.ends_at > now()) and b.status in ('unclaimed', 'claimed')
   group by i.category, i.kind
$$;

-- ----------------------------------------------------------------------------------------------------- claiming (server only)
create function public.hotlist_claim(p_tenant uuid, p_item uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare i public.hotlist_items%rowtype; c public.hotlist_claims%rowtype; v_code text; v_try int := 0; v_n bigint;
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v_bytes bytea; v_suffix text; k int;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into i from public.hotlist_items where id = p_item and tenant_id = p_tenant for update;
  if not found or i.status <> 'published' or i.kind <> 'deal' or i.starts_at > now() or not app.business_is_public(i.business_id) then raise exception 'deal not found' using errcode = 'P0002'; end if;
  select * into c from public.hotlist_claims where item_id = i.id and user_id = p_user;
  if found then return jsonb_build_object('code', c.code, 'already', true, 'redeemed', c.redeemed_at is not null, 'ends_at', i.ends_at); end if;
  if i.ends_at <= now() then raise exception 'this deal has ended' using errcode = '22023'; end if;
  select count(*) into v_n from public.hotlist_claims where item_id = i.id;
  if i.quantity is not null and v_n >= i.quantity then raise exception 'this deal is sold out' using errcode = '22023'; end if;
  if (select count(*) from public.hotlist_claims where user_id = p_user and created_at > now() - interval '1 day') >= 10 then raise exception 'you have claimed a lot of deals today; try again tomorrow' using errcode = '53400'; end if;
  loop
    v_bytes := gen_random_bytes(5); v_suffix := '';
    for k in 0..4 loop v_suffix := v_suffix || substr(v_alpha, (get_byte(v_bytes, k) % 31) + 1, 1); end loop;
    v_code := i.code_prefix || '-' || v_suffix;
    begin
      insert into public.hotlist_claims (tenant_id, item_id, user_id, code) values (p_tenant, i.id, p_user, v_code);
      exit;
    exception when unique_violation then
      if exists (select 1 from public.hotlist_claims where item_id = i.id and user_id = p_user) then
        select code into v_code from public.hotlist_claims where item_id = i.id and user_id = p_user; exit;
      end if;
      v_try := v_try + 1; if v_try > 6 then raise exception 'could not make a code; try again' using errcode = '53400'; end if;
    end;
  end loop;
  return jsonb_build_object('code', v_code, 'already', false, 'redeemed', false, 'ends_at', i.ends_at);
end $$;

-- The signed-in account's own claim for an item (to show the pass again). Works after the deal ends.
create function public.hotlist_my_claim(p_tenant uuid, p_item uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', c.code, 'redeemed', c.redeemed_at is not null, 'claimed_at', c.created_at)
    from public.hotlist_claims c where c.tenant_id = p_tenant and c.item_id = p_item and c.user_id = p_user
$$;

-- ---------------------------------------------------------------------------------------- images: add the 'hotlist' kind
do $$
declare d text;
begin
  select pg_get_functiondef('public.set_content_image(uuid, text, uuid, text, text, text, int, int, bigint)'::regprocedure) into d;
  d := replace(d, $q$if p_kind not in ('article', 'event') then$q$, $q$if p_kind not in ('article', 'event', 'hotlist') then$q$);
  d := replace(d, $q$  if p_kind = 'article' then select cover_media_id into v_old from public.articles where id = p_id and tenant_id = p_tenant;
  else select image_media_id into v_old from public.community_events where id = p_id and tenant_id = p_tenant; end if;$q$,
    $q$  if p_kind = 'article' then select cover_media_id into v_old from public.articles where id = p_id and tenant_id = p_tenant;
  elsif p_kind = 'hotlist' then select image_media_id into v_old from public.hotlist_items where id = p_id and tenant_id = p_tenant;
  else select image_media_id into v_old from public.community_events where id = p_id and tenant_id = p_tenant; end if;$q$);
  d := replace(d, $q$if p_kind = 'article' then update public.articles set cover_media_id = v_asset where id = p_id and tenant_id = p_tenant; else update$q$,
    $q$if p_kind = 'article' then update public.articles set cover_media_id = v_asset where id = p_id and tenant_id = p_tenant; elsif p_kind = 'hotlist' then update public.hotlist_items set image_media_id = v_asset where id = p_id and tenant_id = p_tenant; else update$q$);
  execute d;
  select pg_get_functiondef('public.clear_content_image(uuid, text, uuid)'::regprocedure) into d;
  d := replace(d, $q$if p_kind not in ('article', 'event') then$q$, $q$if p_kind not in ('article', 'event', 'hotlist') then$q$);
  d := replace(d, $q$  if p_kind = 'article' then select cover_media_id into v_old from public.articles where id = p_id and tenant_id = p_tenant;
  else select image_media_id into v_old from public.community_events where id = p_id and tenant_id = p_tenant; end if;$q$,
    $q$  if p_kind = 'article' then select cover_media_id into v_old from public.articles where id = p_id and tenant_id = p_tenant;
  elsif p_kind = 'hotlist' then select image_media_id into v_old from public.hotlist_items where id = p_id and tenant_id = p_tenant;
  else select image_media_id into v_old from public.community_events where id = p_id and tenant_id = p_tenant; end if;$q$);
  d := replace(d, $q$if p_kind = 'article' then update public.articles set cover_media_id = null where id = p_id and tenant_id = p_tenant; else update$q$,
    $q$if p_kind = 'article' then update public.articles set cover_media_id = null where id = p_id and tenant_id = p_tenant; elsif p_kind = 'hotlist' then update public.hotlist_items set image_media_id = null, status = case when status = 'published' then 'draft' else status end where id = p_id and tenant_id = p_tenant; else update$q$);
  execute d;
end $$;

-- ------------------------------------------------------------------------------------------------------------- grants
revoke all on function app.hotlist_clean(jsonb), app.hotlist_slug(uuid, text) from public, anon, authenticated;
revoke all on function public.save_hotlist_item(uuid, uuid, uuid, jsonb, public.hotlist_status), public.review_hotlist_item(uuid, uuid, text, text), public.delete_hotlist_item(uuid, uuid),
  public.set_hotlist_features(uuid, public.hotlist_slot, uuid[]), public.submit_hotlist_offer(uuid, uuid, jsonb), public.redeem_hotlist_code(uuid, text) from public, anon;
grant execute on function public.save_hotlist_item(uuid, uuid, uuid, jsonb, public.hotlist_status), public.review_hotlist_item(uuid, uuid, text, text), public.delete_hotlist_item(uuid, uuid),
  public.set_hotlist_features(uuid, public.hotlist_slot, uuid[]), public.submit_hotlist_offer(uuid, uuid, jsonb), public.redeem_hotlist_code(uuid, text) to authenticated, service_role;
revoke all on function public.hotlist_list(uuid, text, text, text, uuid, int, text, int, int), public.hotlist_detail(uuid, text), public.hotlist_features_public(uuid), public.hotlist_category_counts(uuid) from public;
grant execute on function public.hotlist_list(uuid, text, text, text, uuid, int, text, int, int), public.hotlist_detail(uuid, text), public.hotlist_features_public(uuid), public.hotlist_category_counts(uuid) to anon, authenticated, service_role;
revoke all on function public.hotlist_claim(uuid, uuid, uuid), public.hotlist_my_claim(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.hotlist_claim(uuid, uuid, uuid), public.hotlist_my_claim(uuid, uuid, uuid) to service_role;
