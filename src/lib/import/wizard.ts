import { parseCsv } from "./csv.ts";
import { IMPORT_FIELDS, suggestMapping, type ImportField, type Mapping, type RowPlan } from "./plan.ts";

// Glue between the import UI and the planner/database. Everything here is pure so it can be tested without a browser.
export const MAX_BYTES = 1_000_000;
export const MAX_ROWS = 2000;      // import_businesses() accepts at most 2000 rows per call

export type Preview = { headers: string[]; rowCount: number; sample: string[][]; mapping: Mapping };
export type PreviewResult = { ok: true; preview: Preview } | { ok: false; error: string };

/** First look at an uploaded file: headers, row count, a few sample rows, and a guessed column mapping. */
export function previewCsv(text: string): PreviewResult {
  if (text.length > MAX_BYTES) return { ok: false, error: "That file is larger than 1 MB. Split it into smaller files." };
  let rows: string[][];
  try { rows = parseCsv(text); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "That file could not be read as CSV." }; }
  if (rows.length < 2) return { ok: false, error: "The file needs a header row and at least one business." };
  if (rows.length - 1 > MAX_ROWS) return { ok: false, error: `That file has ${rows.length - 1} rows; the limit is ${MAX_ROWS} per import. Split it into smaller files.` };
  const headers = rows[0].map((h) => h.trim());
  if (headers.length > 60) return { ok: false, error: "That file has too many columns to be a business list." };
  return { ok: true, preview: { headers, rowCount: rows.length - 1, sample: rows.slice(1, 4), mapping: suggestMapping(headers) } };
}

/** The browser sends the mapping as JSON; accept only known fields pointing at real columns. */
export function sanitizeMapping(raw: unknown, columnCount: number): { ok: true; mapping: Mapping } | { ok: false; error: string } {
  let obj: unknown = raw;
  if (typeof raw === "string") { try { obj = JSON.parse(raw); } catch { return { ok: false, error: "The column choices could not be read." }; } }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return { ok: false, error: "The column choices could not be read." };
  const mapping: Mapping = {};   // one column may feed several fields (a "Town" column is often both city and community)
  for (const f of IMPORT_FIELDS) {
    const v = (obj as Record<string, unknown>)[f];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= columnCount) return { ok: false, error: "A column choice points outside the file." };
    mapping[f as ImportField] = v;
  }
  if (mapping.name === undefined) return { ok: false, error: "Choose which column holds the business name." };
  return { ok: true, mapping };
}

export interface Selection { addReview: number[]; updateExisting: number[] }
export type RpcRow = Record<string, unknown>;

/**
 * Turn a fresh plan plus the reviewer's choices into the rows for import_businesses().
 *  - "create" rows are always included
 *  - "review" rows only when their line is in addReview (sent with force: the human has seen the reasons)
 *  - "skip_duplicate" rows only when their line is in updateExisting AND they match a real existing business
 *    (in-file duplicates have no existing id and can never be updated)
 *  - "invalid" rows are never included, whatever the browser says
 */
export function selectRows(plans: RowPlan[], sel: Selection): { rows: RpcRow[]; lines: number[] } {
  const add = new Set(sel.addReview), upd = new Set(sel.updateExisting);
  const rows: RpcRow[] = []; const lines: number[] = [];
  for (const p of plans) {
    const c = p.candidate; if (!c) continue;
    const base = { name: c.name, slug: c.slug, address_line1: c.address_line1, city: c.city, postal_code: c.postal_code, phone: c.phone, website: c.website, email: c.email, short_description: c.short_description, primary_category_id: c.primary_category_id, home_community_id: c.home_community_id };
    if (p.action === "create") { rows.push(base); lines.push(p.line); }
    else if (p.action === "review" && add.has(p.line)) { rows.push({ ...base, force: true }); lines.push(p.line); }
    else if (p.action === "skip_duplicate" && p.duplicateOf && upd.has(p.line)) { rows.push({ ...base, existing_id: p.duplicateOf }); lines.push(p.line); }
  }
  return { rows, lines };
}

export const parseLineList = (v: unknown): number[] => {
  if (typeof v !== "string" || v === "") return [];
  return [...new Set(v.split(",").map((x) => Number.parseInt(x, 10)).filter((n) => Number.isInteger(n) && n >= 2 && n <= MAX_ROWS + 1))];
};

export interface RowResult { index: number; result: "created" | "updated" | "skipped_duplicate" | "error"; id?: string; slug?: string; message?: string }
export function summarizeResults(results: RowResult[]) {
  const s = { created: 0, updated: 0, skipped: 0, errors: 0 };
  for (const r of results) { if (r.result === "created") s.created++; else if (r.result === "updated") s.updated++; else if (r.result === "skipped_duplicate") s.skipped++; else s.errors++; }
  return s;
}
