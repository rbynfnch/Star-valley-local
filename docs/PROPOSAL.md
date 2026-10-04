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
