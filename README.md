# Star Valley Local

A local business directory and community resource for Star Valley, Wyoming, built as a multi-tenant platform
(Star Valley is tenant #1). Operated by Elevartemis. Read `CLAUDE.md` first: it is the build directive.

## Docs
- `docs/PROPOSAL.md`: repo structure, schema, RLS matrix, decisions
- `docs/NOTIFICATIONS.md`: grace period, reminder emails, outbox worker contract
- `docs/DESIGN_TOKENS.md`: design tokens and accessibility notes

## Develop
```bash
cp .env.example .env.local    # fill in values; never commit them
npm install
npm run dev                   # http://localhost:3000   (styleguide: /styleguide, dev only)
```

| Command | What it does |
|---|---|
| `npm test` | unit tests (tokens, contrast, tenant theme) using Node's built-in runner |
| `npm run typecheck` | generates Next route types, then `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | production build |
| `npm run tokens` | regenerates `src/styles/tokens.generated.css` from `src/styles/tokens.ts` |
| `npm run fixtures` | dev only: exports what the anonymous role can read from a seeded local DB to `.fixtures/` |
| `npm run smoke` | end-to-end check of the rendered home page (needs `npm run dev`; rules from CLAUDE.md, accessibility, JSON-LD) |
| `npm run smoke:directory` | end-to-end check of `/businesses`: search, filters, paging, redirects, hostile input, noindex rules |
| `npm run smoke:hubs` | end-to-end check of the SEO hub pages, sitemap and robots.txt, including a crawl of every sitemap URL. Run it again with `--paging` against a server started as `SVL_PAGE_SIZE=5 npm run dev` to test pagination |
| `npm run smoke:profile` | end-to-end check of business profiles: Enhanced vs Free vs unclaimed rendering, JSON-LD, 404s, and a crawl of every profile in the sitemap (needs fixtures mode with `SVL_MEDIA_BASE_URL=/demo-media`) |
| `npm run demo:media` | dev only: copies the placeholder seed images into `public/demo-media/` (gitignored) |
| `npm run smoke:admin` | admin guard end to end against a **mock** of Supabase auth/RPC (not real Supabase). Add `--layout` to also run the real-browser layout check on the admin pages. Start the app with `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npm run dev` first |
| `npm run e2e:admin` | drives the business-detail forms in a real browser (Playwright, installed globally, not a project dependency) against the same Supabase **mock**; same server setup as `smoke:admin` |
| `npm run check:layout` | real-browser check (headless Chromium): no horizontal overflow at 8 widths, and controls are actually visible where expected |

### Running without a Supabase project (development only)
```bash
supabase/tests/seed_check.sh                 # builds a seeded local database named svl_seed
npm run fixtures                             # snapshot of what the anonymous role can read
echo "SVL_DATA_SOURCE=fixtures" >> .env.local && npm run dev    # http://star-valley.localhost:3000
```
The snapshot is exported **as the anonymous database role**, so the page shows only what the public could see.
Fixtures mode refuses to run in production.
Every `seed_check.sh` / `tests/run.sh` run rebuilds `svl_seed` with new random ids, so re-run `npm run fixtures` and restart `npm run dev` afterwards, or profile and hub pages will 404.

## Database
`supabase/` holds the migrations, seed and SQL tests.
```bash
supabase/tests/run.sh         # needs a local Postgres 16 superuser; builds a throwaway DB, runs every suite
```
The seed (`supabase/seed.sql`) is dev/demo data only and runs on `supabase db reset`. Never run it in production.

## Admin
`/admin` (noindex, never cached). Staff sign in with email + password (Supabase Auth); sessions are cookies refreshed by `src/proxy.ts`.
Three checks, in order: the proxy (signed in?), the admin layout (`my_staff_role()` for THIS tenant), and RLS in the database.
There is no sign-up. Create the first staff user in the Supabase dashboard (Authentication), then, as the service role / SQL editor:
```sql
insert into public.tenant_staff (tenant_id, user_id, role)
values ((select id from public.tenants where slug = 'star-valley'), '<auth user uuid>', 'admin');   -- admin | sales | editor
```
