# Star Valley Local — Proposal for review: repo structure, schema, RLS

Status: **proposal, no UI written. Rounds 1 and 2 of decisions applied (see §7); only item 4 is still open.** The schema and RLS are real migrations that apply cleanly on
Postgres 16 and pass the test suites described in §5. Nothing here has been run against a real
Supabase project yet (see "What is not verified").

Sources: `CLAUDE.md` and the four mockups in `/design` (public UI, owner dashboard, admin, articles).
Where mockups conflict with `CLAUDE.md`, `CLAUDE.md` won (listed in §6).

---

## 1. Repo structure

Only `supabase/` and `docs/` exist today. The rest is what I propose to add as the slices land.

```
star-valley-local/
├─ CLAUDE.md
├─ design/                      mockups (source of truth for layout and tokens)
├─ docs/
│  └─ PROPOSAL.md               this file
├─ supabase/
│  ├─ config.toml               (added with the Supabase CLI setup)
│  ├─ migrations/               ordered SQL; never edit an applied migration after launch
│  ├─ seed.sql                  dev/demo seed: 11 communities, 7 categories (+22 subcategories), 30 fictional businesses
│  └─ tests/                    plain-SQL suites + run.sh (see §5)
├─ src/                         (slice 2+)
│  ├─ app/
│  │  ├─ (public)/              home, directory, [category], [community], [category]/[community],
│  │  │                         business/[slug], events, deals, things-to-do, articles/[slug]
│  │  ├─ (owner)/dashboard/…    V2 owner dashboard
│  │  ├─ (admin)/admin/…        CRM, placements manager, moderation, content, field-visit mode
│  │  └─ api/                   track, claim, quote, submit, stripe/webhook (service-role routes)
│  ├─ lib/
│  │  ├─ supabase/              server / browser / service clients
│  │  ├─ tenant/                host -> tenant resolution, theme tokens
│  │  ├─ seo/                   JSON-LD builders, sitemap helpers
│  │  └─ domain/                tier, placements, verification helpers (thin wrappers over SQL)
│  ├─ components/               ui/ (tokens-driven), directory/, admin/
│  └─ styles/tokens.css         CSS variables extracted from the mockups, per-tenant overridable
├─ tailwind.config.ts           reads the CSS variables
├─ .env.example                 every variable the app will need; server-only ones marked
└─ package.json                 Next.js + Tailwind + Supabase + Stripe only (§3 of CLAUDE.md)
```

Notes:
- **Tenant resolution** is by host: `tenant_domains.domain -> tenant_id`. Theme tokens come from `tenants.theme`.
- **Service-role routes** (`/api/track`, claim, subscribe, Stripe webhook, CSV import) are the only code
  that bypasses RLS. They must live server-side only; `.env.example` will mark the key as server-only.
- No new dependencies beyond `CLAUDE.md` §3 without asking.

---

## 2. Schema overview (57 tables + 2 public views, migrations in `supabase/migrations/`)

| Migration | Contents |
|---|---|
| `…0000_extensions_types` | `btree_gist`, `pg_trgm`, `app` schema (internal, not API-exposed), all enums |
| `…0100_tenancy_accounts` | `tenants`, `tenant_domains`, `tenant_settings`, `regions`, `communities`, `profiles`, `tenant_staff`, `platform_admins`, auth helper functions |
| `…0200_catalog` | `categories`, `businesses`, `business_categories`, `business_service_areas`, `business_hours`, `business_services`, `business_links`, `business_faqs`, `business_photos`, `media_assets`, `business_field_sources`, provenance triggers, duplicate finder |
| `…0300_listings_placements` | `listings`, `placements`, `placement_limits`, inventory enforcement, `placement_availability()` |
| `…0400_verification` | `business_owners`, `claims`, `verification_proofs`, `postcard_batches`, `postcard_codes`, `recompute_verification()` |
| `…0500_content` | `articles`, `article_categories`, `authors`, `article_items`, `community_events`, `event_categories`, `deals`, `saved_items` |
| `…0600_crm` | `business_crm`, `contacts`, `opportunities`, `communications` |
| `…0700_engagement` | `leads`, `submissions`, `tracking_events`, `business_stats_daily` |
| `…0800_marketing` | `campaigns` (+targets/steps/recipients), `newsletters`, `email_subscribers`, `suppressions`, `email_templates`, `message_deliveries`, `social_posts` |
| `…0900_billing` | `tenant_products`, `billing_accounts`, `payments`, `stripe_events` |
| `…1000_rls` | RLS on every table, grants, tenant-immutability triggers |
| `…1100_public_views` | `public_listings`, `public_placements`: the only way the public reads tier and Featured (no commercial fields) |

### Decisions that implement `CLAUDE.md`

- **Tenant isolation is structural, not just policy.** Every child row has `tenant_id` and a *composite*
  FK `(parent_id, tenant_id)`. A row in tenant A cannot reference a business, community, category or
  article in tenant B even if a policy were wrong. `tenant_id` is immutable via trigger on every table.
- **Business ≠ Listing.** `businesses.status` is `prospect | unclaimed | claimed | archived`.
  Prospects (imports, Suggest-a-Business) are invisible to the public until staff publish them.
  `listings` rows exist only for paid/comped Enhanced; **Free = absence of an active Enhanced listing**.
  One active listing per business at a time (exclusion constraint).
- **Featured is a placement.** No `is_featured` column anywhere (a test asserts this). Rules enforced in a
  trigger when a placement is `active`: business is public and verified (Green or Gold); **paid**
  placements also need an active Enhanced listing (comped sources `founding_member | campaign | manual`
  are exempt); and concurrent active placements never exceed the tenant limit **at any instant of
  the window**. When an Enhanced listing is cancelled, expires, or has its end shortened, the business's
  **paid** placements end at that moment (running ones are clamped, future ones cancelled) and the slot
  frees immediately; renewals that extend the listing do nothing, and a successor listing that covers the
  lapse prevents the clamp. An advisory lock serializes concurrent activations. Limits live in `placement_limits`
  (seeded 6/3/4/6 per tenant, editable). Waitlist = rows with `status='waitlist'` ordered by `created_at`.
  Expiry is automatic because "live" means `now()` inside `[start_at, end_at)`.
- **Verification is derived, never set.** Level comes from owners + proofs via `recompute_verification()`:
  Green = owner linked + valid `sms_code|email_link` proof (< 1 year); Gold = Green + `postcard |
  google_business_profile | business_license`. Direct writes to the verification columns are rejected for
  everyone, including superuser. `expire_verifications()` is the daily downgrade job.
- **Field-level provenance** for `businesses` columns lives in `business_field_sources`, maintained by
  trigger. An `import` write can never overwrite a field last written by `owner` or `admin`; the trigger
  reverts it. Child tables (hours, services, links, FAQs, photos) carry `source/updated_by/updated_at`
  columns, but **bulk-replace protection for those is the import tool's job** (see open question 6).
- **CRM data is kept out of `businesses`** (which is publicly readable): lead stage, services interest,
  and next action live in `business_crm`, staff-only.
- **Tracking** is an append-only `tracking_events` table (update/delete blocked by trigger), inserted only
  by the service role after bot/admin filtering at ingest. `business_stats_daily` is the rollup for
  analytics ("212 views, 14 calls").
- **V2/V3 tables exist now**: placements, leads, articles, newsletters, campaigns, social posts, etc.

### Deviations from `CLAUDE.md` wording (please confirm)

1. **`placements.scope_id`** is a generated column over two real FKs, `category_id` and `community_id`.
   A polymorphic `scope_id` has no foreign key and can silently point at the wrong table.
   `scope_id = coalesce(category_id, community_id)` still exists for queries.
2. **Tracking table is `tracking_events`, not `events`**, to avoid colliding with community `events`
   (`community_events`).
3. **`placement_status`** is `pending | waitlist | active | cancelled` — "expired" is derived from dates, so no
   cron job is needed to flip a status.
4. Added **`article_view`** to tracking types to power "Popular Right Now" on the articles mockup.

---

## 3. RLS policy matrix

Model: public rows are readable by anyone; everything private is gated by **staff role** or **business
ownership**; `service_role` bypasses RLS for the narrow server routes. Default deny: no policy, no access.
Roles: `admin` satisfies every check; `sales`; `editor`. `platform_admins` are cross-tenant (Elevartemis).

| Data | anon | consumer (signed in) | business owner (own biz) | editor | sales | admin |
|---|---|---|---|---|---|---|
| Published businesses, hours, categories, communities, events, deals (live), articles (live), active placements | read | read | read | read | read | read |
| Prospects / archived businesses | – | – | own only | read | read/write | read/write |
| Business profile fields | – | – | **edit own** (not status, slug, community, category, place ID, verification) | – | write | write |
| Enhanced-only content (services, social links, FAQs, deals) | read **only if Enhanced** | same | write **only if Enhanced** | – | write | write |
| Listings | tier only, via `public_listings` | same | own (base table) | – | read | write |
| Placements | live only, via `public_placements` | same | own; may *request* (pending/waitlist) | – | read | write |
| Verification proofs / claims / postcards | – | – | own proofs: read | – | claims + postcards: write; proofs: read | write proofs |
| CRM (`business_crm`, contacts, opportunities, communications) | – | – | – | – | read/write | read/write |
| Quote requests (`leads`) | **server route only** (Turnstile), Enhanced listings only | same | read + change `status` only | – | read | read |
| Submissions (suggest update/business, submit event) | **server route only** (Turnstile), always `pending` | same | – | read/write | read/write | read/write |
| Articles (`audience='business'` = owner resources) | – | – | read | write | – | write |
| Tracking events / daily stats | – | – | own business: read | – | read | read |
| Newsletter / templates / subscribers / social | – | – | – | write | – | write |
| Campaigns and recipients | – | – | – | – | read | write |
| Payments, billing, tenant settings, staff | – | – | own payments: read | – | – | write |
| Saved items | – | own | own | – | – | – |
| `stripe_events`, `platform_admins` | service role only | | | | | |

**Anonymous users have no INSERT access to any table.** Quote requests, submissions and newsletter signups go
through server routes that verify a Cloudflare Turnstile token and then insert with the service role. If
anon could insert directly, anyone could post to the database API with the public key and skip the captcha.
The business rules still live in the database: a trigger rejects a quote request to any business that is not a
public Enhanced listing (even for the service role) and forces new quote requests to `new` and new
submissions to `pending`.

Boundary guarantees, all asserted by tests: a request to a Free listing's Request-a-Quote is rejected by
the database, not just hidden in the UI; owners cannot self-verify or change status; staff of one tenant
cannot read or write another's rows; anon cannot forge analytics.

---

## 4. Mockup-driven schema changes

- **Articles mockup:** `article_categories` (Local News, Things to Do, Guides & Resources, Business
  Spotlights, Seasonal, Community), `authors` (bylines for people without logins), `featured_rank` for the
  editorial "Featured Articles" slot, `read_minutes`, `spotlight_business_id`, `article_items` for numbered
  "10 Things" guides, `article_view` tracking for "Popular Right Now". Newsletter signup = server route
  inserting `email_subscribers`.
- **Admin mockup:** campaign manager (focus area, dates, slots filled/remaining, auto-fill) -> `campaigns`
  family; two newsletter audiences -> `email_audience`; social media, content calendar, media library,
  business tiers and email templates in settings -> `social_posts`, `articles.publish_at`, `media_assets`,
  `tenant_products`, `email_templates`; "Next Action" and marketing opportunity flags -> `business_crm`.
- **Owner dashboard mockup:** leads inbox statuses (New/Contacted/In Progress/Converted), deals tabs
  (Active/Scheduled/Past, derived from dates), analytics, listing health score (**computed in the app**,
  not stored), FAQs -> covered by `leads`, `deals`, `business_stats_daily`, `business_faqs`.

## 5. Tests

`supabase/tests/run.sh` creates a fresh database, loads a tiny Supabase stub (`auth.uid()`, roles),
applies every migration, then runs the suites. **228 assertions, all pass on Postgres 16.14.**

| Suite | Covers |
|---|---|
| `t_01_tenant_isolation` | anon/consumer/owner/editor/sales/admin boundaries, cross-tenant writes, composite FKs, tenant immutability |
| `t_02_verification` | Green/Gold transitions, revocation, owner loss, 1-year expiry, expiry job, no direct writes |
| `t_03_placements` | default limits, eligibility, per-scope inventory, time windows, waitlist promotion, configurable limits, listing overlap |
| `concurrency.sh` | two sessions race for the last slot: exactly one wins. **Mutation-checked:** with the lock removed, both win (limit breached) and the test fails |
| `t_04_provenance` | import never overwrites owner/admin fields, import flag in staff session, dedupe helper |
| `t_05_enhanced_content_leads` | Enhanced gating, quote-request rule, article/deal visibility, append-only tracking, hours, rules like "no `is_featured`/ratings/distance/Premium" |
| `t_07_comped_and_lapse` | comped placements exempt from Enhanced (still need verified), paid still needs Enhanced, lapse/shorten/cancel ends paid placements and frees the slot, renewal and successor listing leave them alone. Mutation-checked: removing the trigger fails the suite |
| `t_08_public_views` | public views hide `source`/`created_by`/`status`, show only live rows of public businesses; base tables unreadable by anon and consumers. Mutation-checked |
| `seed_check.sh` | loads `seed.sql` into a fresh database and asserts what anon, sales, editor and owners see (38 assertions) |
| `t_06_rls_audit` | every table has RLS + a policy, anon grants are minimal, tenant-immutability trigger everywhere |

Bugs the tests caught while writing this: (1) my verification guard used trigger depth and would have
blocked the daily expiry job; replaced with a transaction-local flag. Everything else that failed was
test setup.

### What is not verified
- **Not run on real Supabase.** The stub imitates `auth.uid()` and roles; real Supabase differs in
  details (extensions schema, `postgres` role privileges, PostgREST `select=*` behavior). First step after
  approval: `supabase db reset` and rerun the suites against it.
- **Storage bucket policies** are not written yet (migrations cover metadata only).
- No load or query-plan testing; indexes are first-pass.
- RLS performance of `app.*` helper functions at scale is unmeasured.

## 6. Where I followed `CLAUDE.md` over the mockups
No `Reviews` tab or ratings, no distance or "Open now", no Premium ($99) tier, one verification ladder
(Green/Gold), Request a Quote only on Enhanced, Featured only on verified Enhanced. The schema contains
none of these concepts, and a test asserts the absence of rating/distance/open-now/`is_featured`
columns and the Premium tier.

---

## 7. Decisions and open questions

### Decided (round 1)
1. **Imports are hidden until staff publish.** Imported records and Suggest-a-Business submissions are
   `prospect` rows, invisible to the public until staff move them to `unclaimed`. *(Already how the schema
   worked; unchanged.)*
2. **Comped placements are exempt from "needs Enhanced".** Implemented as: any placement whose `source` is
   not `paid` (`founding_member`, `campaign`, `manual`). They still require a verified, public business.
   If you meant only `founding_member`, it is a one-line change.
3. **A lapsing Enhanced listing ends its paid Featured placements.** Implemented as described in §2.
   Comped placements are independent of listings.

### Decided (round 2)
5. **Commercial fields are hidden behind views.** Base `listings` and `placements` are readable only by staff
   and the owning business. The public reads `public_listings` and `public_placements`, which expose tier
   and live Featured slots but not `source` (paid / founding_member...), `created_by` or `status`.
   *Not hidden:* the `created_by` / `updated_by` / `uploaded_by` UUID columns on the other public tables
   (businesses, media, hours/services/links/FAQs/photos, articles, events). They are random auth IDs of staff
   with no name or email attached, and hiding them would break `select *` for every public query. Say so if
   you want them hidden anyway; the way to do it is more views.
6. **Cloudflare Turnstile approved** for quote requests, submissions and newsletter signup. It only works if
   the route is the only way in, so anonymous inserts were removed from the database (see §3). Env vars are
   in `.env.example`. This is the one new third-party service beyond `CLAUDE.md` §3.
7. **Import protection for hours/services/links/FAQs/photos** will be implemented in the CSV import tool
   (skip businesses whose rows were edited by owner/admin), not by trigger.
8. **Newsletter signup** is a server route with double opt-in; there is no anonymous insert on
   `email_subscribers`.
9. **Seed data** is clearly fictional: "Sample …" names, reserved 555-01xx phones, `.example` websites.

### Still open
4. **Verification lapse vs. Featured** (needs your decision). Today, if a Featured business's verification
   expires (1 year) or its owner is removed, it drops to unverified but its placement keeps running and
   stays public until `end_at`. The check "must be verified" only runs when a placement is activated.
   Options: (1) end the placement immediately, same as the Enhanced-lapse rule; (2) a grace period
   (suggest 14 days) then end it; (3) leave it. I recommend 2. Not implemented.

## 8. Next steps

1. Your call on item 4; I implement it with tests.
2. Run the migrations, seed and suites against a real Supabase project (`supabase db reset`). Not yet done:
   this container has no Supabase CLI.
3. Scaffold Next.js, extract design tokens from the mockups (`tenants.theme` is intentionally empty until
   then), and build slice 2 (public directory).
