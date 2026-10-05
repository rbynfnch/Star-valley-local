// Uploads the demo photos in supabase/seed-media to the hosted project's public `media` bucket (the seed's media rows point at them).
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service key> node scripts/hosted/upload-seed-media.mjs
// Uses only fetch (no dependency). Existing files are replaced. The service key never leaves your machine except to your own project.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, ''), key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || key.length < 20) { console.error('Set NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co) and SUPABASE_SERVICE_ROLE_KEY'); process.exit(2); }
const root = 'supabase/seed-media/media';
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
let ok = 0, bad = 0;
for (const file of walk(root)) {
  const path = relative(root, file).split('\\').join('/');
  const type = TYPES[extname(file).toLowerCase()];
  if (!type) continue;
  const res = await fetch(`${url}/storage/v1/object/media/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, apikey: key, 'content-type': type, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }, body: readFileSync(file),
  });
  if (res.ok) ok++; else { bad++; console.error(`failed ${path}: ${res.status} ${(await res.text()).slice(0, 120)}`); }
}
console.log(`uploaded ${ok} file(s), ${bad} failed`);
process.exit(bad ? 1 : 0);
