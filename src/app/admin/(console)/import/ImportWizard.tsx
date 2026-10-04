"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { IMPORT_FIELDS, type ImportField } from "@/lib/import/plan";
import type { Preview } from "@/lib/import/wizard";
import { checkImport, commitImport, previewImport, type CheckOut, type CheckRow, type CommitOut } from "./actions";

const FIELD_LABEL: Record<ImportField, string> = { name: "Business name (required)", address_line1: "Street address", city: "City or town", postal_code: "ZIP", phone: "Phone", website: "Website", email: "Public email", short_description: "Short description", category: "Category", community: "Community (or town)" };
const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-2 py-1.5 text-sm text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";
const btn = "rounded-button bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60";
const ghost = "rounded-button border border-slate-600 px-4 py-2 text-sm font-semibold text-text disabled:opacity-60";
const ACTION_WORDS: Record<string, string> = { create: "Will be added", review: "Needs your decision", skip_duplicate: "Already listed", invalid: "Cannot be imported" };

export function ImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | "">>({});
  const [check, setCheck] = useState<Extract<CheckOut, { ok: true }> | null>(null);
  const [addReview, setAddReview] = useState<Set<number>>(new Set());
  const [updateExisting, setUpdateExisting] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<Extract<CommitOut, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => { setFile(null); setPreview(null); setMapping({}); setCheck(null); setAddReview(new Set()); setUpdateExisting(new Set()); setDone(null); setError(null); };
  const body = (extra: Record<string, string> = {}) => { const fd = new FormData(); if (file) fd.set("file", file); fd.set("mapping", JSON.stringify(Object.fromEntries(Object.entries(mapping).filter(([, v]) => v !== "")))); for (const [k, v] of Object.entries(extra)) fd.set(k, v); return fd; };
  const toggle = (set: Set<number>, line: number, on: boolean) => { const n = new Set(set); if (on) n.add(line); else n.delete(line); return n; };

  const read = () => startTransition(async () => {
    setError(null);
    if (!file) { setError("Choose a CSV file."); return; }
    const fd = new FormData(); fd.set("file", file);
    let r: Awaited<ReturnType<typeof previewImport>>;
    try { r = await previewImport(fd); } catch { setError("That could not be completed. Check the file and try again."); return; }
    if (!r.ok) { setError(r.error); return; }
    setPreview(r.preview); setMapping(Object.fromEntries(Object.entries(r.preview.mapping).map(([k, v]) => [k, v as number])));
  });
  const runCheck = () => startTransition(async () => {
    setError(null);
    if (mapping.name === undefined || mapping.name === "") { setError("Choose which column holds the business name."); return; }
    let r: Awaited<ReturnType<typeof checkImport>>;
    try { r = await checkImport(body()); } catch { setError("That could not be completed. Check the file and try again."); return; }
    if (!r.ok) { setError(r.error); return; }
    setCheck(r); setAddReview(new Set()); setUpdateExisting(new Set());
  });
  const commit = () => startTransition(async () => {
    setError(null);
    let r: Awaited<ReturnType<typeof commitImport>>;
    try { r = await commitImport(body({ add_review: [...addReview].join(","), update_existing: [...updateExisting].join(",") })); } catch { setError("That could not be completed. Check the file and try again."); return; }
    if (!r.ok) { setError(r.error); return; }
    setDone(r);
  });

  const errorEl = error ? <p role="alert" className="mt-3 text-sm font-medium text-brand-text">{error}</p> : null;

  if (done) {
    const s = done.summary;
    return (
      <section aria-labelledby="done-h" className="rounded-card bg-surface-card p-5 shadow-card">
        <h2 id="done-h" className="font-heading text-xl font-semibold text-text">Import finished</h2>
        <p role="status" className="mt-2 text-text-body">{s.created} added as hidden prospects, {s.updated} updated, {s.skipped} skipped, {s.errors} with problems.</p>
        {done.problems.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">{done.problems.map((p) => <li key={p.line} className="text-text-body"><strong>Row {p.line}</strong> ({p.name}): {p.result === "skipped_duplicate" ? "skipped, it was added in the meantime" : (p.message ?? "could not be added")}</li>)}</ul>
        )}
        <p className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link href="/admin/businesses?status=prospect" className="font-semibold text-link underline">Review the new prospects</Link>
          <button type="button" onClick={reset} className="font-semibold text-link underline">Import another file</button>
        </p>
      </section>
    );
  }

  if (check) {
    const c = check.counts;
    const group = (a: string) => check.rows.filter((r) => r.action === a);
    const chosen = group("create").length + addReview.size + updateExisting.size;
    const renderRow = (r: CheckRow) => (
      <li key={r.line} className="border-t border-slate-600/15 py-2 text-sm">
        <p className="font-medium text-text [overflow-wrap:anywhere]"><span className="text-text-muted">Row {r.line}:</span> {r.name}</p>
        {r.reasons.length > 0 && <ul className="ml-4 list-disc text-text-body">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        {r.action === "review" && <label className="mt-1 flex items-center gap-2 text-text"><input type="checkbox" checked={addReview.has(r.line)} onChange={(e) => setAddReview(toggle(addReview, r.line, e.target.checked))} className="h-4 w-4" />Add this business anyway</label>}
        {r.action === "skip_duplicate" && r.duplicateOf && <label className="mt-1 flex items-center gap-2 text-text"><input type="checkbox" checked={updateExisting.has(r.line)} onChange={(e) => setUpdateExisting(toggle(updateExisting, r.line, e.target.checked))} className="h-4 w-4" />Update {r.duplicateName ?? "the existing business"} with this row (fills empty fields; never overwrites owner or staff edits)</label>}
      </li>
    );
    return (
      <section aria-labelledby="check-h" className="rounded-card bg-surface-card p-5 shadow-card">
        <h2 id="check-h" className="font-heading text-xl font-semibold text-text">Check before importing</h2>
        <p className="mt-2 text-text-body" role="status">{c.create ?? 0} will be added, {c.review ?? 0} need your decision, {c.skip_duplicate ?? 0} are already listed, {c.invalid ?? 0} cannot be imported.</p>
        <p className="mt-1 text-sm text-text-muted">Imported businesses are added as <strong>hidden prospects</strong>. Nothing goes public until you publish it.</p>
        {(["review", "skip_duplicate", "invalid", "create"] as const).map((a) => group(a).length > 0 && (
          <details key={a} open={a !== "create"} className="mt-4">
            <summary className="cursor-pointer font-semibold text-text">{ACTION_WORDS[a]} ({group(a).length})</summary>
            <ul className="mt-2">{group(a).map(renderRow)}</ul>
          </details>
        ))}
        {errorEl}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={commit} disabled={pending || chosen === 0} className={btn}>{pending ? "Importing…" : `Import ${chosen} ${chosen === 1 ? "business" : "businesses"}`}</button>
          <button type="button" onClick={() => setCheck(null)} disabled={pending} className={ghost}>Back to columns</button>
        </div>
      </section>
    );
  }

  if (preview) {
    return (
      <section aria-labelledby="map-h" className="rounded-card bg-surface-card p-5 shadow-card">
        <h2 id="map-h" className="font-heading text-xl font-semibold text-text">Match the columns</h2>
        <p className="mt-1 text-sm text-text-muted">{file?.name}: {preview.rowCount} {preview.rowCount === 1 ? "row" : "rows"}. We guessed the columns; fix any that are wrong.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {IMPORT_FIELDS.map((f) => (
            <div key={f}>
              <label htmlFor={`map-${f}`} className="text-sm font-medium text-text">{FIELD_LABEL[f]}</label>
              <select id={`map-${f}`} value={mapping[f] === undefined ? "" : String(mapping[f])} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value === "" ? "" : Number(e.target.value) })} className={field}>
                <option value="">Not in this file</option>
                {preview.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="mb-1 text-left text-sm font-medium text-text">First rows of your file</caption>
          <thead><tr>{preview.headers.map((h, i) => <th key={i} scope="col" className="border-b border-slate-600/20 px-2 py-1 font-medium text-text-muted">{h || `Column ${i + 1}`}</th>)}</tr></thead>
          <tbody>{preview.sample.map((r, i) => <tr key={i}>{preview.headers.map((_, j) => <td key={j} className="px-2 py-1 text-text [overflow-wrap:anywhere]">{r[j] ?? ""}</td>)}</tr>)}</tbody></table></div>
        {errorEl}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={runCheck} disabled={pending} className={btn}>{pending ? "Checking…" : "Check the file"}</button>
          <button type="button" onClick={reset} disabled={pending} className={ghost}>Start over</button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="pick-h" className="rounded-card bg-surface-card p-5 shadow-card">
      <h2 id="pick-h" className="font-heading text-xl font-semibold text-text">Choose a file</h2>
      <p className="mt-1 text-sm text-text-muted">A CSV with a header row. Up to 2,000 rows and 1 MB. Only use lists you have the right to use (public filings, licence lists, your own research); never scraped Google or Yelp data.</p>
      <div className="mt-4">
        <label htmlFor="csv-file" className="text-sm font-medium text-text">CSV file</label>
        <input id="csv-file" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={field} />
      </div>
      {errorEl}
      <div className="mt-5"><button type="button" onClick={read} disabled={pending} className={btn}>{pending ? "Reading…" : "Read the file"}</button></div>
    </section>
  );
}
