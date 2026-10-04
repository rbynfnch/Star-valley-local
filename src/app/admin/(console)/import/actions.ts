"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/admin/session";
import { planImport, summarize, type Lookups, type RowAction } from "@/lib/import/plan";
import { MAX_BYTES, parseLineList, previewCsv, sanitizeMapping, selectRows, summarizeResults, type Preview, type RowResult } from "@/lib/import/wizard";
import { createUserClient } from "@/lib/supabase/server";

export type PreviewOut = { ok: true; preview: Preview } | { ok: false; error: string };
export type CheckRow = { line: number; action: RowAction; name: string; reasons: string[]; duplicateOf?: string; duplicateName?: string };
export type CheckOut = { ok: true; counts: Partial<Record<RowAction, number>>; rows: CheckRow[] } | { ok: false; error: string };
export type CommitOut = { ok: true; summary: { created: number; updated: number; skipped: number; errors: number }; problems: { line: number; name: string; result: string; message?: string }[] } | { ok: false; error: string };
const FAIL = "That could not be completed. Reload the page and try again.";

async function readFile(form: FormData): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return { ok: false, error: "Choose a CSV file." };
  if (f.size > MAX_BYTES) return { ok: false, error: "That file is larger than 1 MB. Split it into smaller files." };
  const text = await f.text();
  if (text.includes("\u0000")) return { ok: false, error: "That does not look like a CSV text file." };
  return { ok: true, text };
}

/** Everything the planner needs to resolve names to ids and spot duplicates, read as the signed-in staff member (RLS applies). */
async function loadLookups(tenantId: string): Promise<Lookups> {
  const supabase = await createUserClient();
  const [cats, coms] = await Promise.all([
    supabase.from("categories").select("id,slug,name,plural_name").eq("tenant_id", tenantId).eq("is_active", true),
    supabase.from("communities").select("id,slug,name").eq("tenant_id", tenantId),
  ]);
  if (cats.error || coms.error) throw new Error("lookups");
  const existing: Lookups["existing"] = [];
  for (let from = 0; from < 50_000; from += 1000) {        // PostgREST returns at most 1000 rows per request
    const { data, error } = await supabase.from("businesses").select("id,name,phone_digits,address_line1").eq("tenant_id", tenantId).order("id").range(from, from + 999);
    if (error) throw new Error("lookups");
    existing.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { categories: cats.data ?? [], communities: coms.data ?? [], existing };
}

export async function previewImport(form: FormData): Promise<PreviewOut> {
  await requireArea("import");
  const file = await readFile(form); if (!file.ok) return file;
  return previewCsv(file.text);
}

async function planFrom(form: FormData, tenantId: string) {
  const file = await readFile(form); if (!file.ok) return file;
  const pv = previewCsv(file.text); if (!pv.ok) return pv;
  const m = sanitizeMapping(form.get("mapping"), pv.preview.headers.length); if (!m.ok) return m;
  const lookups = await loadLookups(tenantId);
  return { ok: true as const, plans: planImport(file.text, m.mapping, lookups), lookups };
}

export async function checkImport(form: FormData): Promise<CheckOut> {
  const staff = await requireArea("import");
  try {
    const r = await planFrom(form, staff.tenant.id); if (!r.ok) return r;
    const names = new Map(r.lookups.existing.map((e) => [e.id, e.name]));
    const rows: CheckRow[] = r.plans.map((p) => ({ line: p.line, action: p.action, name: p.candidate?.name ?? "(no name)", reasons: p.reasons, duplicateOf: p.duplicateOf, duplicateName: p.duplicateOf ? names.get(p.duplicateOf) : undefined }));
    return { ok: true, counts: summarize(r.plans), rows };
  } catch { return { ok: false, error: FAIL }; }
}

export async function commitImport(form: FormData): Promise<CommitOut> {
  const staff = await requireArea("import");
  try {
    const r = await planFrom(form, staff.tenant.id); if (!r.ok) return r;            // re-planned from the file: the browser never supplies rows
    const { rows, lines } = selectRows(r.plans, { addReview: parseLineList(form.get("add_review")), updateExisting: parseLineList(form.get("update_existing")) });
    if (rows.length === 0) return { ok: false, error: "Nothing is selected to import." };
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("import_businesses", { p_tenant: staff.tenant.id, p_rows: rows });
    if (error || !Array.isArray(data)) return { ok: false, error: FAIL };
    const results = data as RowResult[];
    const name = (line: number) => r.plans.find((p) => p.line === line)?.candidate?.name ?? "(no name)";
    const problems = results.filter((x) => x.result === "skipped_duplicate" || x.result === "error").map((x) => ({ line: lines[x.index - 1], name: name(lines[x.index - 1]), result: x.result, message: x.message?.slice(0, 200) }));
    revalidatePath("/admin/businesses"); revalidatePath("/admin");
    return { ok: true, summary: summarizeResults(results), problems };
  } catch { return { ok: false, error: FAIL }; }
}
