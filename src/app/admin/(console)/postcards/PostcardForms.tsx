"use client";

import { startTransition, useActionState, useState } from "react";
import { encodeQr, qrSvgPath } from "@/lib/qr/qr";
import { createBatch, voidCard, type BatchState, type Card } from "./actions";

const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-2 py-1.5 text-sm text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";
const Msg = ({ s }: { s: BatchState }) => (<>
  {s.error && <p role="alert" className="text-sm font-medium text-danger-text">{s.error}</p>}
  {s.message && <p role="status" className="text-sm font-medium text-green-800">{s.message}</p>}
</>);
const grouped = (code: string) => `${code.slice(0, 5)} ${code.slice(5)}`;

function Qr({ url }: { url: string }) {
  const { d, size } = qrSvgPath(encodeQr(url));
  return <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code for the verification page" className="h-40 w-40" shapeRendering="crispEdges"><rect width={size} height={size} fill="#fff" /><path d={d} fill="#000" /></svg>;
}

/** One postcard: what the owner reads, the code to type and a QR to scan. Sized for a 4 x 6 inch card; the page prints two to a sheet. */
export function PostcardSheet({ cards, tenantName }: { cards: Card[]; tenantName: string }) {
  return (
    <div className="print-sheet space-y-4">
      {cards.map((c) => (
        <article key={c.code} className="break-inside-avoid rounded-card border border-slate-600 bg-white p-6 text-black print:rounded-none print:border-dashed">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 flex-1 space-y-3">
              <p className="font-heading text-xl font-bold">{tenantName}</p>
              <p className="text-lg font-semibold [overflow-wrap:anywhere]">{c.name}</p>
              <p className="text-sm">{[c.address_line1, c.address_line2].filter(Boolean).join(", ")}<br />{[c.city, c.state].filter(Boolean).join(", ")} {c.postal_code}</p>
              <p className="text-sm">Finish verifying your listing. Scan the code, or go to <strong>{c.url.split("/verify")[0].replace(/^https?:\/\//, "")}/verify/postcard</strong> and enter this code while signed in:</p>
              <p className="font-mono text-3xl font-bold tracking-widest" aria-label={"Code " + c.code.split("").join(" ")}>{grouped(c.code)}</p>
              <p className="text-xs">The code works once and expires 90 days after it was printed.</p>
            </div>
            <Qr url={c.url} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function BatchForm({ eligible, tenantName }: { eligible: { id: string; name: string; city: string | null }[]; tenantName: string }) {
  const [state, dispatch, pending] = useActionState<BatchState, FormData>(createBatch, {});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="space-y-4">
      {eligible.length === 0 ? <p className="text-sm text-text-subtle">No business can be sent a card right now. A business needs to be claimed and Green verified, not already Gold, with no card waiting.</p> : (
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => dispatch(fd)); }} className="no-print space-y-3">
          <div><label htmlFor="pc-label" className="text-sm font-medium text-text">Batch name</label><input id="pc-label" name="label" maxLength={80} required placeholder="October mailing" className={field} /></div>
          <fieldset><legend className="text-sm font-medium text-text">Businesses <span className="font-normal text-text-muted">({picked.size} chosen)</span></legend>
            <ul className="mt-1 max-h-72 space-y-1 overflow-y-auto rounded-card border border-slate-600/40 p-2">
              {eligible.map((b) => <li key={b.id}><label className="flex items-center gap-2 text-sm text-text"><input type="checkbox" name="business" value={b.id} checked={picked.has(b.id)} onChange={() => toggle(b.id)} />{b.name}{b.city ? <span className="text-text-muted"> · {b.city}</span> : null}</label></li>)}
            </ul></fieldset>
          <button type="submit" disabled={pending || picked.size === 0} className="rounded-button bg-brand px-5 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60">{pending ? "Making codes…" : "Make codes"}</button>
        </form>
      )}
      <div className="no-print"><Msg s={state} /></div>
      {state.cards && (
        <section aria-labelledby="sheet-h" className="space-y-3">
          <div className="no-print flex flex-wrap items-center gap-3"><h3 id="sheet-h" className="font-heading text-lg font-semibold text-text">{state.label}</h3>
            <button type="button" onClick={() => window.print()} className="rounded-button border border-slate-600 px-4 py-2 text-sm font-semibold text-text hover:bg-surface-muted">Print</button></div>
          <PostcardSheet cards={state.cards} tenantName={tenantName} />
        </section>
      )}
    </div>
  );
}

export function VoidButton({ id }: { id: string }) {
  const [state, dispatch, pending] = useActionState<BatchState, FormData>(voidCard, {});
  return (<span className="inline-flex items-center gap-2">
    <button type="button" disabled={pending} className="text-link underline disabled:opacity-60" onClick={() => { const fd = new FormData(); fd.set("id", id); startTransition(() => dispatch(fd)); }}>Void</button><Msg s={state} /></span>);
}
