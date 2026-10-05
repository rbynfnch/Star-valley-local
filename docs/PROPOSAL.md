# Star Valley Local — Proposal for review: repo structure, schema, RLS

Status: **proposal, no UI written. All open decisions from rounds 1 to 3 are applied (see §7).** The schema and RLS are real migrations that apply cleanly on
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
│  └─ styles/tokens.ts          design tokens (source of truth) -> tokens.generated.css; see docs/DESIGN_TOKENS.md
├─ (Tailwind v4 is CSS-first: no tailwind.config.ts; src/app/globals.css imports the generated tokens)
├─ .env.example                 every variable the app will need; server-only ones marked
└─ package.json                 Next.js + Tailwind + Supabase + Stripe only (§3 of CLAUDE.md)
```

Notes:
- **Tenant resolution** is by host: `tenant_domains.domain -> tenant_id`. Theme tokens come from `tenants.theme`.
- **Service-role routes** (`/api/track`, claim, subscribe, Stripe webhook, CSV import) are the only code
  that bypasses RLS. They must live server-side only; `.env.example` will mark the key as server-only.
- No new dependencies beyond `CLAUDE.md` §3 without asking.

---

## 2. Schema overview (61 tables + 3 views, migrations in `supabase/migrations/`)

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
| `…1200_grace_notifications` | `tenant_policies`, `verification_grace`, `notifications` (email outbox), daily maintenance job, worker functions. See `docs/NOTIFICATIONS.md` |
| `…1300_grace_rls_cron` | RLS for those tables, `featured_at_risk` admin view, `pg_cron` schedule |
| `…1400_credits` | `account_credits` ledger and pro-rata crediting when a paid placement is ended by a verification lapse |
| `…1500_search` | `search_businesses()` (ranked full-text + fuzzy search, filters, paging, optional id list) and `directory_counts()` (businesses per category x community, for the SEO hubs); both security invoker, callable by anon, still bound by RLS |
| `…1600_business_profile` | `business_profile(tenant, slug)` returns one jsonb document and is the single place that decides Free vs Enhanced: Free gets logo + ONE photo, short description only, no email/services/links/FAQs/deals; Enhanced gets everything. security invoker, callable by anon, bound by RLS |
| `…1700_import_businesses` | `import_businesses(tenant, rows)`: commits an approved CSV import. Always creates **prospects** (hidden), writes with source `import` so owner/admin edits survive re-imports, re-checks duplicates at write time, suffixes colliding slugs, and reports per row (created / updated / skipped_duplicate / error). security invoker: sales staff and service_role only |
| `…1800_admin_dashboard` | `admin_dashboard_counts(tenant)` (the six CLAUDE.md §8 counts; staff only, errors for anyone else) and `my_staff_role(tenant)` (the caller's own role; platform admins are admin) |
| `…1900_admin_business_list` | `admin_list_businesses(...)`: staff list with filters (status, community, category, tier, lead stage, verified), name/phone search with literal `%`/`_`, stable paging. Sales and admin only (editors are refused: CRM data). Missing CRM row = stage `new`; tier is `enhanced` only while a listing is live |
| `…2000_admin_business_detail` | `admin_business_detail()` (one document: fields + per-field provenance, CRM, listing, placements, proofs without their evidence, contacts, opportunities, communications, marketing indicators), `set_lead_stage()` (upsert + audit note) and `add_communication()` (staff id is always the caller). Sales and admin only |
| `…2100_admin_edit_status` | `update_business_fields()` (whitelisted keys, only present keys change, `''` clears, validated; staff writes are recorded as `admin` provenance so imports never overwrite them) and `set_business_status()` (publish prospect → unclaimed/claimed, archive, restore; archive refused while a paid listing or placement is live; every change logged) |
| `…2200_claim_flow` | `claim_start()` / `claim_verify()` (service role only): texts or emails a one-time secret, stores only its hash, enforces the limits, and on success links the owner and records the proof (Green is derived by the existing triggers). `app.expire_claims()` for the daily job |
| `…2300_submissions` | `submission_create()` (service role only: strict per-kind whitelist, caps, always `pending`), `review_submission()` (approve / reject / spam; approving creates a hidden prospect, publishes an event, or applies suggested field changes) and `admin_list_submissions()` (the queue) |
| `…2400_placements_manager` | `placement_scarcity()` (public, aggregates only), `admin_placements_overview()`, `activate_listing()` / `activate_placement()` (mark paid or comp; create the payment record atomically; extend a running listing; a full slot answers `full`, never an error), `end_listing()` / `end_placement()`, `add_to_waitlist()` and `join_waitlist()` (a verified owner with an Enhanced listing, only when the slot is actually full) |
| `…2500_content_editor` | staff-only (sales/admin) `business_content()`, replace-all `set_business_hours/services/links/faqs/areas()`, `save_deal()`/`delete_deal()`, photo records (`add/update/delete/reorder_business_photo(s)`), a staff `media_assets` update policy, and the public `media` storage bucket; `update_business_fields` now also takes `highlights` and `price_range` |
| `…2600_email_worker` | service-role worker contract over the existing outbox: `email_claim_batch()` (leased, with tenant and business details; cancels mail about archived businesses), `email_complete()`, `email_fail()` (retry with backoff, or permanent), `email_run_maintenance()`, `record_email_suppression()` (hard bounce / complaint / unsubscribe, idempotent, cancels queued mail); staff `admin_email_queue()` and `retry_notification()` |
| `…2700_claim_email` | service-role helpers for claiming by emailed link: `claim_options()` (masked hints of what can be offered), `claim_preview()` (what a link confirms, claimant only), `email_is_blocked()`; `claim_start` now gives an emailed link 1 hour (a text code stays 10 minutes) and treats a malformed email on file as none |
| `…2800_tracking` | `record_tracking()` (service role: validates, drops untrusted events, excludes staff and a business's own owners, de-duplicates refreshes, caps a session at 300 events/hour), a trigger that records every quote request, staff `admin_business_activity()`; the daily maintenance job now rolls up `business_stats_daily` |
| `…2900_public_content` | `list_articles()` (anonymous: published and live-scheduled public-audience articles only, full-text search, category, featured-only, paging capped at 50, no body) and `article_category_counts()` |
| `…3000_content_admin` | editor/admin `save_event`, `delete_event`, `save_article` (slug from title, unique; author by name; featured position held by one article; guide items replace-all), `delete_article`, `set_content_image` / `clear_content_image` (cover images confined to `<tenant>/articles|events/<id>/`) |

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
- **Verification lapse has a 14-day grace period.** If a business holding an active Featured placement drops
  to unverified (annual expiry, revoked proof, owner removed), a grace period opens (length per tenant in
  `tenant_policies`). The placement stays live; the owner is emailed immediately and again at 7 and 1 days.
  Re-verifying closes the grace period and cancels queued emails; if it runs out, all the business's
  placements (paid and comped) end, the owner gets a final email, and **paid** placements credit the business the
  unused part (`account_credits`). If nobody can be emailed, admin and sales are alerted instead. A daily job (`run_daily_maintenance`)
  also queues re-verification reminders (30/14/7 days before the date) and the 14-day renewal reminders.
  The database only queues email in an outbox with retries, leases and dedupe keys; a backend worker sends it
  (contract in `docs/NOTIFICATIONS.md`).
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

### Public URL scheme (decided while building slice 2)

| Path | Page |
|---|---|
| `/` | home |
| `/businesses` | directory and search (`q`, `community`, `category`) |
| `/categories/[category]` | category page ("Plumbers") |
| `/communities/[community]` | community page ("Thayne") |
| `/categories/[category]/[community]` | category x community ("Plumbers in Thayne") |
| `/business/[slug]` | business profile |
| `/events`, `/events/[slug]` | events |
| `/deals`, `/things-to-do` | deals, weekend guide |
| `/articles`, `/articles/[slug]` | articles |
| `/list-your-business` | claim / suggest a business |

The home page already links to these. Only `/` exists so far; the rest 404 until their slices.

### Slice 2 status

Done: tenant resolution (host to tenant), tenant theme, header/footer, **home page**, **directory and search**
(`/businesses`), **SEO hub pages** (category, community, category x community), **sitemap.xml and robots.txt**.
Not yet: business profile, events, deals, articles, Things to Do.

SEO hub decisions: a hub page exists only if it has businesses (a category x community pair with none is a 404, decided
from `directory_counts()`, which a test proves always equals what the search returns). A hub is **indexed and listed in
the sitemap only with at least 2 listings** (`MIN_INDEXABLE_LISTINGS`): otherwise one valley-wide business would appear
on ten near-identical "Plumbers in <town>" pages, which search engines treat as doorway pages. Thin hubs still work for
visitors and are `noindex`. Hubs show a Featured strip on page 1 only (category slot on category and combination
pages, community slot on community pages), labelled as paid placements, with `rel="sponsored"` links. The sitemap is
per tenant, and robots.txt deliberately does NOT block search URLs (crawlers must fetch them to see their `noindex`).
Pagination keeps one URL per page (`?page=N`, self-canonical), and unknown query parameters never create new URLs.

Directory decisions: ranking and filtering live in one database function (`search_businesses`), tested in SQL as the
anonymous role. **Paid placement never changes organic ranking** (a test compares result order with and without
live placements); Featured businesses get their own labelled strips on the home, category and community pages.
Matching: full-text, name contains, fuzzy name (typos), Enhanced-only service names, category names. A
community filter includes businesses that *serve* that community, not only those based there. Only the bare
directory and plain pagination are indexable; any search or filter URL is `noindex` and canonical to `/businesses`
(the category and community pages are the ones meant to rank). Known limit: "plumber" finds "Plumbing" through
fuzzy name matching, but synonyms (for example "AC repair" for HVAC) would need a synonyms list per category.

How the public site reads data: `src/lib/directory/queries.ts` lists every table and column it reads, flat
selects only (no relationship embedding). A test runs each one **as the anonymous database role** against a
seeded database, so a permission gap fails the test instead of failing in production. The Supabase API layer
itself (PostgREST) could not be run in the build environment, so the first run against a real project is still
outstanding (see §5).

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
| Grace periods / `featured_at_risk` view | – | – | own business: read | – | read | read |
| Account credits | – | – | own: read | – | read | read, apply, void (amount immutable) |
| Email outbox (`notifications`) | – | – | – | – | – | read (audit); written only by the database and the worker |
| Tenant policies (grace days, reminder schedule) | – | – | – | – | read | write |
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
applies every migration, then runs the suites. **352 assertions, all pass on Postgres 16.14.**

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
| `t_09_grace_notifications` | grace start/stop, reminder ladder (one email per step, late run sends one), end-of-grace ends paid and comped placements, owner-removed fallback recipient, 1-year expiry end to end, renewal reminders, outbox claim/retry/lease/dedupe/suppression, and who can see or call what. Mutation-checked |
| `t_10_staff_alerts_credits` | staff alerts when nobody can be emailed, credits (pro-rata, unstarted, renewed, comped/unpaid/no-record earn none, listing-cancel earns none), credit visibility and immutability. Mutation-checked |
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

### Decided (round 3)
4. **Verification lapse: 14-day grace period, with automated email reminders from the backend.** Implemented as
   described in §2 and `docs/NOTIFICATIONS.md`. Applies to paid and comped placements alike, since verification
   is required for both. The grace length and reminder schedule are per-tenant settings.

### Decided (round 4)
11. **Staff are alerted when a lapse has nobody to email.** Admin and sales get an email at each grace step
    (start, 7-day, 1-day, end). Implemented.
12. **Renewal reminders only for fixed-term purchases** (recommended and implemented). New `auto_renews` flag on
    listings and placements: recurring Stripe subscriptions get no reminder from us (Stripe's built-in renewal
    emails cover annual plans). The Stripe webhook and "mark as paid" must set the flag.
13. **Credit the business** when a paid placement ends early because verification lapsed: pro-rata for the
    unused time, as an `account_credits` ledger staff apply by hand in V1. Implemented.

### Decided (round 5)
10. **Email provider: Postmark.** Two servers on two sending subdomains: business (transactional stream, service
    notices and staff alerts) and consumer (broadcast stream, opt-in newsletter). Webhooks feed `suppressions`.
14. **Cold B2B outreach runs through a different provider, on a separate domain.** Postmark's policy forbids
    emailing people who have not opted in, and a suspension would stop the service notices. `CLAUDE.md` §11 is
    amended accordingly: cold B2B is legal, but not on the service-email provider. Requirements for that future
    integration are in `docs/NOTIFICATIONS.md`. The provider itself is chosen before V3 (new paid service: I
    ask first). `message_deliveries.provider` and the provider-agnostic `suppressions` table support this.

### Still open
15. **Recurring Featured subscriptions need cancelling when a placement ends early.** The database ends the
    placement and credits the business, but cannot cancel the Stripe subscription. The backend (or staff) must,
    or the customer keeps being billed. Needs an owner: backend job, or a staff checklist item in V1?

## 8. Next steps

1. Decide item 15 (who cancels recurring Stripe subscriptions when a placement ends early). Doesn't block the next slice.
2. Run the migrations, seed and suites against a real Supabase project (`supabase db reset`). Not yet done:
   this container has no Supabase CLI. This also confirms `pg_cron` scheduling, which the local harness skips.
3. Scaffold Next.js, extract design tokens from the mockups (`tenants.theme` is intentionally empty until
   then), and build slice 2 (public directory).
4. Slice 4 builds the email worker against `docs/NOTIFICATIONS.md`.

## Business profile slice (decisions to confirm)
- **Request a Quote is intentionally not rendered yet.** CLAUDE.md: never show a form whose submissions the owner won't receive. It ships with the lead route, Turnstile and the owner notification email.
- **Free tier photos** = logo + one photo; Free hides the long description, highlights and public email (Enhanced-only). This is my reading of CLAUDE.md §6; please confirm.
- Free vs Enhanced is enforced twice: in SQL (`business_profile`) and again in `buildProfileView`.
- Verification dates show only when verified. No ratings, reviews, distance or "open now".
- Links still pointing at pages not built yet: `/list-your-business?claim=`, `/suggest-update?business=`.

## CSV import (admin slice, part 1)
- `src/lib/import/` plans an import without writing (parse, map columns, normalise, dedupe, classify rows); `import_businesses()` commits it.
- Known limitation: the duplicate helper compares street addresses by trigram similarity, so "1 Pine St" and "2 Pine St" look alike. Same name + near address is flagged as a duplicate. The cost is a skipped real neighbour, not a duplicate listing; the review step is where an admin overrides it (`force`).

## Admin auth (admin slice, part 2)
- Email + password via Supabase Auth, cookie sessions through `@supabase/ssr` (approved dependency). No public sign-up.
- Not verified against a real Supabase project: only against a mock (`npm run smoke:admin`) and the SQL tests. First thing to do once a project exists: sign in for real.
- Login has no CAPTCHA or app-level rate limit yet (Supabase Auth applies its own limits); add Turnstile before launch.

## Admin business list (admin slice, part 3)
- `/admin/businesses`: GET filter form, table on desktop and cards on mobile (field sales), tap-to-call phones, 25 per page. Names are not links yet: business detail is the next page.
- Filters come from the URL and are validated (`src/lib/admin/list-params.ts`); anything unrecognised is dropped before it reaches the database.

## Business detail (admin slice, part 4)
- `/admin/businesses/[id]`: profile data with who-last-wrote-it beside each value, verification and listing, placements, marketing opportunity indicators, contacts, opportunities, activity log, plus two forms: lead stage and "add to the log" (note, call, visit with outcome, DM, email, SMS, meeting, postcard; optional follow-up date, shown as 9:00 AM tenant time).
- Not built yet from CLAUDE.md §8: editing profile fields, contacts and opportunities CRUD, services checklist editing, **photo on a field visit**, claim tools, placement actions, publish/archive.
- A failed save keeps what was typed (bad signal in the field); browsers send CRLF newlines, stored as LF.

## Edit and publish (admin slice, part 5)
- `/admin/businesses/[id]/edit`: the profile form, with a "Visibility" card on the detail page (Publish / Archive / Restore). Forms submit via `onSubmit` so a failed save never wipes what was typed.
- Publishing is the only way a prospect (CSV import, suggested business) reaches the public site. Archive is blocked while the business has a paid listing or placement: end those first (the placements manager will own that).
- Still not editable: hours (structured), photos, services, links, FAQs, secondary categories and service areas. Those need their own editors.

## Claim and verify (slice 4, part 1)
- **Flow:** `/list-your-business?claim=<slug>` (the profile page's "Claim this business" link) → sign in or create an account (`/account/sign-in`, `/account/sign-up`) → "Text me a code" → 6-digit code → owner linked, `sms_code` proof recorded, business becomes `claimed` and **Green**. The destination is always the phone number on the listing, never typed by the visitor.
- **Rules (all in the database, see `…2200_claim_flow`):** only an unclaimed, published business; a code lasts 10 minutes and allows 5 wrong attempts (the 5th rejects the claim); at most 3 codes per business per hour, 5 per user per day, 300 per tenant per day (SMS-pumping guard) and one per 60 seconds; the secret is stored only as a salted SHA-256; two people verifying at once cannot both win (business row lock; a 15-round two-session test proves it, and removing the lock makes 14 of 15 rounds deadlock).
- **Who calls what:** the functions are executable by `service_role` only. The server authenticates the user (`getUser()`), then calls them with the service key (`src/lib/supabase/service.ts`) and texts the secret through Twilio's plain Messages API (`src/lib/sms/twilio.ts`, no SDK). No browser role can read a code.
- **Decision recorded:** we generate and check the codes ourselves instead of using Twilio Verify: cheaper per message, the rules are SQL-testable, and `claims` was already built for hashed secrets.
- **Email link** is implemented in the database (same mechanism, 256-bit token) but has no UI: it needs the email delivery worker.
- **Before this works in production:** a Twilio account with a sender registered for **US A2P 10DLC** (carriers block unregistered business texting), `TWILIO_FROM_NUMBER`, Turnstile keys, and `SUPABASE_SERVICE_ROLE_KEY` as a server-only secret. Schedule `app.expire_claims()` with the other daily jobs.
- **Not verified against real services:** Twilio and Supabase Auth were exercised only through mocks; Turnstile's server check is unit-tested but not exercised by the browser test (it needs a real secret).
- **Not built:** admin claim tools (send a claim text on someone's behalf, postcard code batches for Gold), the email-link UI, owner dashboard, transferring or disputing a claim.

## Suggest an Update / Suggest a Business / Submit an Event (slice 4, part 2)
- **Public pages:** `/suggest-update?business=<slug>` (linked from every profile), `/suggest-business`, `/submit-event` (both linked from the footer and `/list-your-business`). Cloudflare Turnstile on each; the server action calls the service-role-only `submission_create`, so no browser role can insert a submission.
- **Nothing is published or changed by a visitor.** Every submission is a `pending` row. Rules in the database: unknown fields are refused; text is trimmed and length-capped; websites must be http(s); events must start within the next two years and not end before they start; at most 200 submissions per tenant per day, 5 per email per day, 10 pending updates per business. A suggested business and an event require an email (so we can follow up); an update does not.
- **Moderation** (`/admin/moderation`, sales + editors + admin; dashboard shows "Waiting for review"): approve, reject or mark spam with a note. Approving
  - an **update** marks it approved, and, if sales/admin tick "apply", writes phone / website / name / address / city to the business as a staff edit (hours are free text and never applied automatically);
  - a **business** creates a **hidden prospect** (never public until published), after a duplicate check that offers "Add it anyway"; the CRM log keeps who suggested it;
  - an **event** publishes it (editors and admin only; sales cannot).
- **Decision recorded:** the prospect for a suggested business is created at approval, not on submission, so spam never reaches the CRM.
- **Not built:** claim requests as a moderation type (claims are automatic today), emailing the submitter a decision, merging a duplicate into the existing business, editing a submission before approving, structured hours from an update.
- **Not verified against real services:** Supabase and Turnstile through mocks only.

## CSV import screen (admin slice, part 6)
- `/admin/import` (sales + admin): choose a CSV, match the columns (guessed from the headers; one column may feed several fields, e.g. Town = city + community), **check** the file, decide, then import. Imported businesses are always **hidden prospects**; nothing goes public until staff publish them (see Edit and publish).
- **The browser never supplies rows.** The check and the commit both re-read the uploaded file and re-plan it on the server (`src/lib/import/plan.ts`), then send only the chosen lines to `import_businesses()`. A forged selection cannot add an invalid row, an in-file duplicate, or anything outside the file.
- **Row numbers match the spreadsheet:** blank lines are kept in the numbering and skipped, so "row 7" is row 7 in Excel.
- **Decisions on the check screen:** rows that need review (unrecognised category or community, or a similar name with no matching phone or address) are off by default and can be added with "Add this business anyway"; a business already in the directory can optionally be updated from the row (fills empty fields only; owner and staff edits are never overwritten, by the database).
- **Limits:** 1 MB and 2,000 rows per import (the function's limit); duplicate detection reads every existing business in 1,000-row pages (an e2e test puts the match beyond the first page).
- **Not built:** saving a column mapping for next time, a dry-run report download, importing categories or hours, import history.

## Placements manager, pricing and Payment Links (slice 6)
- **Selling flow today (Payment Links first):** the owner opens `/pricing?business=<slug>` while signed in as that business's owner; the Enhanced / Featured buttons are the Stripe **Payment Link** for that product with `client_reference_id=<business id>` (and their email prefilled), so every payment in Stripe names the business. After payment, an **admin** opens the business and uses **Plan and placements**: *Mark paid and activate* (choose a product to fill in the price and term; add the Stripe reference in the notes). Comps (founding member, campaign, other) record a $0 `comp` payment. There is no webhook yet, so activation is manual by design (CLAUDE.md §4).
- **Payment Link URLs** live in `tenant_products.payment_link_url` (https only). There is no admin screen for them yet; set them in the Supabase dashboard or SQL. Until set, the pricing page says "Online checkout is not open yet".
- **Rules** (database): paid Featured needs an active Enhanced listing; any Featured needs a verified, published business; inventory per slot is enforced under an advisory lock. Activation functions return `full` instead of failing; the admin can then add the business to the waitlist. Ending an Enhanced listing ends its paid placements (comped ones continue).
- **Waitlist:** staff add or promote (promotion turns the same row active); a verified Enhanced owner can join from the pricing page, only when the spot is full, at most 5 waitlists per business.
- **Admin-only writes** (matches the table policies); sales can read `/admin/placements`.
- **Honesty on the pricing page:** it lists what exists today. The Request a Quote button and leads inbox are marked "coming soon" because they are not built.
- **Known gap to close before selling Enhanced widely:** there is **no editor yet for the Enhanced content itself** (services, photos, links, FAQs, deals, long description, highlights) in the admin, and no owner dashboard. The public profile renders all of it, but today only the seed data can fill it. A staff-side Enhanced content editor is the next thing a paying customer needs.
- **Not built:** Stripe webhook (auto-record and auto-activate), renewal and expiry emails (need the email worker; reminders are already queued by `run_daily_maintenance`), cancelling a recurring Stripe subscription when a placement ends early (the backend must do this; see `docs/NOTIFICATIONS.md`), credits on manual early end, an admin screen for products and Payment Link URLs.

## Enhanced content editor (slice 7, part 1)
`/admin/businesses/[id]/content` (sales and admin) edits everything an Enhanced listing shows: highlights and price level, structured hours (up to 3 ranges a day), services, social and other links (each network's host is checked), FAQs, extra service communities and categories, deals, and photos. Each section saves on its own and replaces the whole section; staff writes are recorded as source `admin`, so a re-import never overwrites them. A Free business can be filled in too; the page says Enhanced-only content stays hidden publicly until an Enhanced listing is active.

- **Photos:** the server (service role) stores the file at `<tenant>/<business>/<random>.<ext>` in the public `media` bucket. The extension and type come from the file's bytes (PNG, JPEG, WebP only; SVG and GIF refused; 5 MB; at least 200 px), never the filename. The database function records it and refuses any path outside that folder. A failed record deletes the just-uploaded file; replaced or deleted photos are removed from storage only after the database has let go of them. One logo and one cover per business; a new one replaces the old. Alt text is required (a logo defaults to "<name> logo"). `serverActions.bodySizeLimit` is raised to 6 MB for the upload.
- **Tests:** 134 SQL assertions (`t_19`), mutation-checked; unit tests for the parsers and image sniffer; a browser e2e including real uploads and failure cleanup.
- **Not built / limits:** the real Supabase Storage API has only been exercised against the mock (bucket creation is guarded in the migration and should be confirmed in the dashboard); no image resizing or cropping (photos are served as uploaded); no drag-and-drop reorder (move earlier/later buttons); orphaned files are possible if a storage delete fails after the record is gone; owners cannot yet edit their own content (V2 dashboard).

## Email delivery worker (slice 8, part 1)
Delivers the notifications the database already queues: re-verification reminders, grace-period notices, Featured/Enhanced renewal reminders, and staff alerts when a business has nobody to email. **Transactional service mail only**, from the business Postmark server and sender (separate from any consumer mail, per `CLAUDE.md` §11).

- **Job:** `GET/POST /api/cron/email` (Bearer `CRON_SECRET`, fails closed if unset; scheduler every ~5 minutes). It queues the day's reminders (idempotent), then claims, sends and settles batches. The database does the locking (leases, `skip locked`), so overlapping runs and crashed workers are safe. Transient failures retry with backoff (1m, 5m, 30m, 2h); after five attempts, or at once for an invalid or inactive recipient, a row is `failed` and shows in **Admin → Email** with a Retry button.
- **Suppression:** `POST /api/webhooks/postmark` (Basic auth) records hard bounces and spam complaints, which block all further mail to that address, and unsubscribes, which do not block service notices. Queued mail to a newly suppressed address is cancelled.
- **Content:** plain, friendly text plus a simple HTML part, dates in the tenant's timezone, a link to that business's claim page (re-verify), pricing, or the admin page for staff alerts, and the tenant's mailing address in the footer. No open or link tracking.
- **Tests:** SQL `t_20` (mutation-checked), unit tests for templates, Postmark classification, worker, auth and webhook parsing, and a browser/HTTP e2e (mutation-checked).
- **Not built / limits:** nothing has been sent through real Postmark (token, verified sender signature and DKIM for the business subdomain are still to set up); the scheduler itself is yours to configure; **claim links by email** (`email_link` claims, the admin "send claim link" tool) and the **owner-facing unsubscribe/preferences page** are not built; Postmark's per-message delivery webhooks (delivered, opened) are ignored; consumer newsletters and cold outreach are V3.

## Claim by emailed link (slice 4, part 3)
On a business's claim page the owner can choose **text a code** or **email a link** (whichever contact details are on the listing; each is shown masked, e.g. `o•••@alpha.example`). The link goes only to the address already on the listing, never one the visitor types.

- **Flow:** `claim_start` (email method) makes a 256-bit secret, stores only its hash, and the server emails it once, straight through Postmark's business server (not the outbox, so the secret is never stored). The link opens `/list-your-business/confirm?c=<claim>&t=<token>`. **Opening it changes nothing**: the signed-in claimant must press a button, which calls `claim_verify` (mail scanners open links, so a GET must never verify). Only the account that asked can use it; any other account sees "not for this account" and learns nothing about the business. The result is the same as the text flow: Green, an `email_link` proof, the CRM log entry.
- **Safety:** the page is `noindex` with `Referrer-Policy: no-referrer`; the token is 64 hex characters and nothing else reaches the database; five wrong attempts reject the claim; the existing per-business, per-user and per-tenant limits and the 60-second cooldown apply; a hard-bounced or complained-about address is not emailed (the claim is cancelled); a failed send cancels the claim.
- **Tests:** SQL `t_21` (mutation-checked), unit tests for the token/method/mask helpers and the email text, and a browser e2e (mutation-checked) covering both choices, the unauthenticated, wrong-account, malformed, wrong-token and expired cases, a blocked address and a failing send.
- **Not built / limits:** the link base is the request host (production resolves it against the known tenant domains first); nothing has been sent through real Postmark; the **admin "send a claim link"** tool (a link for an owner who has no account yet) and the **postcard code batch** are still to do; there is no "resend" cooldown message beyond the existing 60-second rule.

## Event tracking and SEO markup (slice 5)
**Tracking (CLAUDE.md §9).** Profile views, website / phone / directions taps, search appearances (with the query), deal views and quote requests are written to the append-only `tracking_events` table.

- **How:** public pages send a beacon (`navigator.sendBeacon`) to `POST /api/track`: one page-level event list (a profile view, plus a deal view per deal shown; the businesses a search, hub or the home page's Featured strip displayed) and one delegated click listener for every Call / Website / Directions link (`data-track`). Quote requests are recorded by a database trigger when the lead is created, so the browser can never forge or skip one.
- **Excluded:** bots and headless browsers (user-agent filter), Do Not Track and Global Privacy Control, cross-site beacons, signed-in **staff and platform admins**, and a business's **own owners** viewing their listing. Refreshes within 30 minutes count once (double-taps within 5 seconds), and a session is capped at 300 events an hour.
- **Privacy:** no cookies and no IP address stored. The visitor id is a salted hash of (day, tenant, IP, browser), so it cannot be linked across days; only the referring host (not path or query) is kept. In production tracking stays off until `TRACKING_SALT` is set. The route always answers 204 and never says why something was not recorded. (Whether a notice is needed for your audience is a question for counsel; nothing here identifies a person.)
- **Staff:** the business page has a **Listing performance (30 days)** card: views, call and website taps, directions, quote requests, appearances, distinct visitors, change against the previous 30 days, the searches that surfaced it, and a one-line summary for the pitch ("In the last 30 days this listing got 212 views, 14 call taps and 31 website clicks."). The V2 owner dashboard will read the same data.
- **Tests:** SQL `t_22` (mutation-checked), unit tests for the bot filter, visitor hash, body parser and card model, and a browser/HTTP e2e (mutation-checked).

**SEO markup.** The structural work was already in place from the directory slices: server-rendered pages, canonical URLs, `noindex` for search and filter URLs and thin hubs, sitemap and robots, schema.org `LocalBusiness` (+ `FAQPage` for Enhanced), `BreadcrumbList`, `ItemList`, `WebSite` and `Organization`, with no ratings, reviews or "open now". This slice adds Open Graph and Twitter cards (page title, description, canonical URL and the logo or first photo) on profiles and hubs, site-wide defaults, and `/pricing` in the sitemap.

- **Not built / limits:** `Event` and `Article` JSON-LD and sitemap entries come with the events, deals and article pages (slice 7); the `deal_view` and `article_view` events are accepted but only deal views on a profile are sent today; no `lastmod` in the sitemap; no social image for pages without a logo or photo; tracking data is not pruned (a retention rule is a decision for you); the owner-facing analytics screen is V2; real browsers other than the headless one used here have not been tried.

## Events, deals and article pages (slice 7)
**Public pages** (all server-rendered, canonical, with schema.org markup and in the sitemap):

- **/events:** upcoming events, recurring ones expanded into dated occurrences (same local time across daylight saving), filters for When (today, this weekend = Friday 5 PM to Monday 12 AM, this month), community, type and search, 12 per page. Filtered lists are `noindex`. **/events/[slug]:** details, upcoming dates, "Repeats every Saturday" in words, host business, `Event` JSON-LD with the next date, **Add to calendar** (`/events/[slug]/calendar.ics`, with escaped, folded text), and a notice (and `noindex`) once an event has ended.
- **/deals:** live deals only (the database applies: published, in date, public and Enhanced business), category tabs, soonest-ending first, "Ends soon", valid-through date; each card links to the business. Deal views are tracked.
- **/articles:** featured article, category chips with counts, full-text search (the database function), 9 per page. **/articles/[slug]:** the body from a small built-in **safe Markdown renderer** (all text escaped first, fixed tag set, http(s)/mailto/same-site links only), numbered guide items linking to businesses, related articles, `Article` JSON-LD, share cards. Articles meant for business owners (`audience = business`) never appear.
- **/things-to-do:** this weekend's events, the latest guides from the Things to Do category, and the **Featured places** slot (rotated, labelled as paid), which is the product the six Things to Do placements sell. Together with events and deals this is the weekend guide / retention content.
- A deal's "valid through" date now shows the last valid day (the editor stores "through that day" as the next day's start); the business profile uses the same rule.

**Admin** (**Content**, editors and admins): articles (draft, scheduled, published, archived; slug; summary; Markdown text; category; byline; featured position 1 to 5; publish time in Mountain time; search title and description; business spotlight; **guide items** with optional business links; cover image), events (all-day or timed, repeat daily/weekly on chosen days/monthly with an interval and end date, venue, address, community, type, website, host business, published/cancelled/pending, image), and a **deals** list across all businesses (deals themselves are edited with the business). Deleting is deliberate: a published article must be archived and a published event cancelled first. Events sent in through the public form still go through Moderation.

- **Tests:** SQL `t_23` (public list, mutation-checked) and `t_24` (editor CRUD, mutation-checked), unit tests for the Markdown renderer, event windows and recurrence text, ICS, JSON-LD, deal and article models and the form parsers, a smoke test of every public page, and a browser e2e of the admin (mutation-checked).
- **Not built / limits:** the events list reads up to 100 upcoming events and expands them in the app (fine for a valley; a very large calendar would want a database function); event images are shown on the event page only (not on list cards); no `lastmod` in the sitemap; the featured article is also left in the Latest grid when it is among the newest; no drag-and-drop for guide items; rich-text editing is Markdown typed by hand; `deal_view` is counted on /deals and profiles, not on a per-deal page (deals have none); consumer saves (favorites) and the newsletter are V3.

## Brand migration and admin claim links
**Brand.** The site now uses the style-guide palette (white plus the locked brand colours, one derived Stone tone for muted text on Cream), **Bricolage Grotesque** for headlines and prominent numbers and **Inter** for everything else (both self-hosted variable fonts with their OFL licences in `src/app/fonts/`), the supplied mountain mark and lockup (cropped, background removed, in `public/brand/`, used for the header, favicon, app icon and share image), and sentence case instead of all-caps. Contrast pairings are tested against WCAG AA.
- **Limits:** the logos are raster (an SVG and a Cream reverse version would be sharper on navy; the footer currently puts the mark on a Cream tile); the Local Hotlist artwork is orange, which is not a palette colour (the guide says Hotlist is Navy and Mustard), so it is held until the Hotlist slice.

**Admin claim link** (business detail page, **Claim link** card; sales staff and admins). Staff choose Email or Text; the **server** picks the destination, which is always the phone or email already on the listing, and shows it masked. Receiving the link there is the proof, so the result is Green Verified exactly like a self-serve claim, and staff can never aim a claim at an address they typed. The link lasts 7 days, a new one replaces the last, there are per-business and per-tenant limits, bounced or opted-out addresses are refused, and the send is written to the communications log only after delivery succeeds.
- **Owner side:** the same confirm page. Before signing in it shows the business name to someone holding the secret; signing in or creating an account returns to the link; pressing Confirm binds the claim to that account and verifies it. A staff-issued link can be used once; a self-serve claim cannot be taken over with `claim_verify_invite`.
- **Tests:** SQL `t_25` (who may issue, destination, hashing, adoption, one winner, lockout, expiry, log, overview, grants), unit tests, and a browser e2e with the mocks.
- **Not built / limits:** nothing sent through real Postmark or Twilio; a link copied and handed over in person is deliberately not offered, because that would weaken the proof (use the field-visit "claimed together" note and have the owner open the link on their phone); the postcard code batch (Gold) is still to do.
