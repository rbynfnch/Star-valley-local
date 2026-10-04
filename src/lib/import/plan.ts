import { parseCsv } from './csv.ts';

export const IMPORT_FIELDS = ['name', 'address_line1', 'city', 'postal_code', 'phone', 'website', 'email', 'short_description', 'category', 'community'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type Mapping = Partial<Record<ImportField, number>>;

const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ['name', 'business name', 'business', 'dba', 'company', 'company name'],
  address_line1: ['address', 'street', 'street address', 'address line 1', 'address1', 'location'],
  city: ['city', 'town'],
  postal_code: ['zip', 'zip code', 'postal code', 'postcode'],
  phone: ['phone', 'phone number', 'telephone', 'tel'],
  website: ['website', 'web', 'url', 'site'],
  email: ['email', 'e-mail', 'email address'],
  short_description: ['description', 'short description', 'summary', 'about'],
  category: ['category', 'type', 'industry', 'business type'],
  community: ['community', 'area', 'locality'],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Suggest a column mapping from header names; the admin can override every choice. */
export function suggestMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<number>();
  for (const f of IMPORT_FIELDS) {
    const idx = headers.findIndex((h, i) => !used.has(i) && HEADER_ALIASES[f].includes(norm(h)));
    if (idx >= 0) { m[f] = idx; used.add(idx); }
  }
  return m;
}

export const phoneDigits = (s: string): string | null => {
  let d = s.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? d : null;
};
export const formatPhone = (s: string): string | null => {
  const d = phoneDigits(s);
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
};
export const normalizeWebsite = (s: string): string | null => {
  const t = s.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString().replace(/\/$/, '');
  } catch { return null; }
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

const ADDR_ABBR: [RegExp, string][] = [[/\bstreet\b/g, 'st'], [/\bavenue\b/g, 'ave'], [/\broad\b/g, 'rd'], [/\bhighway\b/g, 'hwy'], [/\bdrive\b/g, 'dr'], [/\blane\b/g, 'ln'], [/\bnorth\b/g, 'n'], [/\bsouth\b/g, 's'], [/\beast\b/g, 'e'], [/\bwest\b/g, 'w']];
export const addressKey = (s: string) => ADDR_ABBR.reduce((a, [re, r]) => a.replace(re, r), norm(s));
const nameKey = (s: string) => norm(s).replace(/\b(llc|inc|co|company|corp|the)\b/g, '').replace(/\s+/g, ' ').trim();

export interface Lookups {
  categories: { id: string; slug: string; name: string; plural_name?: string | null }[];
  communities: { id: string; slug: string; name: string }[];
  /** existing businesses, for duplicate detection (the DB function re-checks at write time) */
  existing: { id: string; name: string; phone_digits: string | null; address_line1: string | null }[];
}

export interface Candidate {
  name: string; slug: string;
  address_line1: string | null; city: string | null; postal_code: string | null;
  phone: string | null; website: string | null; email: string | null; short_description: string | null;
  primary_category_id: string | null; home_community_id: string | null;
}
export type RowAction = 'create' | 'skip_duplicate' | 'review' | 'invalid';
export interface RowPlan {
  line: number; action: RowAction; reasons: string[]; candidate?: Candidate; duplicateOf?: string;
}

const pick = (cells: string[], m: Mapping, f: ImportField) => (m[f] === undefined ? '' : (cells[m[f]!] ?? '').trim());
const lookup = <T extends { slug: string; name: string; plural_name?: string | null }>(list: T[], v: string) => {
  const k = norm(v); if (!k) return undefined;
  return list.find((x) => norm(x.slug) === k || norm(x.name) === k || (x.plural_name && norm(x.plural_name) === k));
};
const similar = (a: string, b: string) => {
  const grams = (s: string) => { const p = `  ${s} `; const g = new Set<string>(); for (let i = 0; i < p.length - 2; i++) g.add(p.slice(i, i + 3)); return g; };
  const A = grams(a), B = grams(b); let both = 0; for (const x of A) if (B.has(x)) both++;
  return A.size + B.size - both === 0 ? 0 : both / (A.size + B.size - both);
};

/**
 * Turn CSV text into a reviewable plan. Never writes anything.
 * - invalid: no usable name
 * - skip_duplicate: same business already exists (similar name AND same phone or same address), or earlier in this file
 * - review: a plausible match on name alone, or unresolved category/community: a human decides
 * - create: clean new skeleton record
 * Bad optional values (website, phone, email) are dropped with a reason rather than failing the row.
 */
export function planImport(csv: string, mapping: Mapping, lk: Lookups, opts: { hasHeader?: boolean } = {}): RowPlan[] {
  const rows = parseCsv(csv);
  const start = opts.hasHeader === false ? 0 : 1;
  const plans: RowPlan[] = [];
  const seen: { key: string; phone: string | null; addr: string; line: number }[] = [];
  const usedSlugs = new Set<string>();
  for (let i = start; i < rows.length; i++) {
    const cells = rows[i]; const line = i + 1; const reasons: string[] = [];
    const name = pick(cells, mapping, 'name').replace(/\s+/g, ' ');
    if (!name) { plans.push({ line, action: 'invalid', reasons: ['no business name'] }); continue; }
    const rawPhone = pick(cells, mapping, 'phone'); const phone = rawPhone ? formatPhone(rawPhone) : null;
    if (rawPhone && !phone) reasons.push(`phone "${rawPhone}" ignored (not a 10-digit US number)`);
    const rawSite = pick(cells, mapping, 'website'); const website = rawSite ? normalizeWebsite(rawSite) : null;
    if (rawSite && !website) reasons.push(`website "${rawSite}" ignored (not a valid http/https address)`);
    const rawEmail = pick(cells, mapping, 'email'); const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail.toLowerCase() : null;
    if (rawEmail && !email) reasons.push(`email "${rawEmail}" ignored (invalid)`);
    const catV = pick(cells, mapping, 'category'); const comV = pick(cells, mapping, 'community') || pick(cells, mapping, 'city');
    const cat = lookup(lk.categories, catV); const com = lookup(lk.communities, comV);
    const needsReview: string[] = [];
    if (catV && !cat) needsReview.push(`category "${catV}" not recognised`);
    if (comV && !com) needsReview.push(`community "${comV}" not recognised`);
    const address = pick(cells, mapping, 'address_line1') || null;
    const candidate: Candidate = {
      name, slug: '', address_line1: address, city: pick(cells, mapping, 'city') || null,
      postal_code: pick(cells, mapping, 'postal_code') || null, phone, website, email,
      short_description: pick(cells, mapping, 'short_description').slice(0, 120) || null,
      primary_category_id: cat?.id ?? null, home_community_id: com?.id ?? null,
    };
    const digits = phone ? phoneDigits(phone) : null; const nk = nameKey(name); const ak = address ? addressKey(address) : '';

    // duplicate of an existing business
    let dup: { id: string; strong: boolean } | undefined;
    for (const e of lk.existing) {
      const s = similar(nameKey(e.name), nk); if (s < 0.55) continue;
      const strong = (!!digits && e.phone_digits === digits) || (!!ak && !!e.address_line1 && similar(addressKey(e.address_line1), ak) >= 0.6);
      if (strong) { dup = { id: e.id, strong: true }; break; }
      if (s >= 0.8 && !dup) dup = { id: e.id, strong: false };
    }
    if (dup?.strong) { plans.push({ line, action: 'skip_duplicate', reasons: [...reasons, 'already in the directory (matching name and phone/address)'], candidate, duplicateOf: dup.id }); continue; }

    // duplicate of an earlier row in this file
    const inFile = seen.find((s) => similar(s.key, nk) >= 0.55 && ((!!digits && s.phone === digits) || (!!ak && s.addr !== '' && similar(s.addr, ak) >= 0.6)));
    seen.push({ key: nk, phone: digits, addr: ak, line });
    if (inFile) { plans.push({ line, action: 'skip_duplicate', reasons: [...reasons, `duplicate of line ${inFile.line} in this file`], candidate }); continue; }

    let slug = slugify(`${name}${com ? ` ${com.name}` : ''}`) || 'business'; const base = slug; let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
    candidate.slug = slug; usedSlugs.add(slug);
    if (dup) needsReview.push('similar name to an existing business (no matching phone or address)');
    if (needsReview.length) { plans.push({ line, action: 'review', reasons: [...reasons, ...needsReview], candidate, duplicateOf: dup?.id }); continue; }
    plans.push({ line, action: 'create', reasons, candidate });
  }
  return plans;
}

export const summarize = (plans: RowPlan[]) => plans.reduce((a, p) => ({ ...a, [p.action]: (a[p.action] ?? 0) + 1 }), {} as Partial<Record<RowAction, number>>);
