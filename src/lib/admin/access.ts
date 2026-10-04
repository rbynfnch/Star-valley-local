// Which admin areas each staff role may open. This only decides what the UI shows and which pages redirect;
// the database (RLS) is the real gate, and these rules mirror its policies (see supabase/migrations/..._rls.sql).
export type StaffRole = 'admin' | 'sales' | 'editor';
export type AdminArea = 'dashboard' | 'businesses' | 'import' | 'crm' | 'placements' | 'moderation' | 'content' | 'settings';

const ALLOWED: Record<AdminArea, readonly StaffRole[]> = {
  dashboard: ['sales', 'editor'],            // counts are read-only and harmless to every staff role
  businesses: ['sales'],
  import: ['sales'],
  crm: ['sales'],
  placements: ['sales'],                     // sales may read; only admin may change placements/limits (RLS)
  moderation: ['sales', 'editor'],
  content: ['editor'],                       // articles, events, deals
  settings: [],                              // tenant config, staff, billing: admin only
};

export const canAccess = (role: StaffRole | null | undefined, area: AdminArea): boolean =>
  !!role && (role === 'admin' || ALLOWED[area].includes(role));

export const canWritePlacements = (role: StaffRole | null | undefined) => role === 'admin';

export const visibleAreas = (role: StaffRole | null | undefined): AdminArea[] =>
  (Object.keys(ALLOWED) as AdminArea[]).filter((a) => canAccess(role, a));

/** Where to send someone after signing in. Only same-site relative paths under /admin; never an external URL. */
export function safeNextPath(next: string | null | undefined, fallback = '/admin'): string {
  if (!next || typeof next !== 'string') return fallback;
  if (next.length > 300 || /[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  let decoded = next;
  try { decoded = decodeURIComponent(next); } catch { return fallback; }
  if (decoded.startsWith('//') || /[\u0000-\u001f\\]/.test(decoded)) return fallback;
  if (decoded.split('?')[0].split('/').some((seg) => seg === '..' || seg === '.')) return fallback;
  if (next !== '/admin' && !next.startsWith('/admin/') && !next.startsWith('/admin?')) return fallback;
  return next;
}
