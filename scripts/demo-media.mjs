// DEVELOPMENT ONLY: copies the seed's placeholder images (supabase/seed-media/<bucket>/<path>) into public/demo-media so the
// dev server can show them. Use with SVL_MEDIA_BASE_URL=/demo-media. public/demo-media is gitignored and never deployed.
// (On a real Supabase project the CLI uploads supabase/seed-media to the bucket itself: see docs/PROPOSAL.md.)
import { cpSync, mkdirSync, rmSync } from 'node:fs';
rmSync('public/demo-media', { recursive: true, force: true });
mkdirSync('public/demo-media', { recursive: true });
cpSync('supabase/seed-media', 'public/demo-media', { recursive: true });
console.log('copied supabase/seed-media -> public/demo-media');
