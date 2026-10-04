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

## Database
`supabase/` holds the migrations, seed and SQL tests.
```bash
supabase/tests/run.sh         # needs a local Postgres 16 superuser; builds a throwaway DB, runs every suite
```
The seed (`supabase/seed.sql`) is dev/demo data only and runs on `supabase db reset`. Never run it in production.
