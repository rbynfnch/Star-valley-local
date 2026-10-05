"use client";

import { startTransition, useActionState, useState } from "react";
import { ActionForm, field, ghost, labelCls, primary } from "../content/EditorialBits";
import { deleteHotlist, redeemCode, reviewHotlist, saveFeatures, saveHotlist, type HotlistState } from "./actions";

type Opt = { value: string; label: string };
export interface HotlistValues {
  id: string | null; kind: "deal" | "pick"; business: string; category: string; badge: string; title: string; summary: string; body: string; start_date: string; end_date: string;
  original: string; price: string; quantity: string; code_prefix: string; redemption: string; terms: string; status: string;
}
const Msg = ({ s }: { s: HotlistState }) => (<>
  {s.error && <p role="alert" className="text-sm font-medium text-danger-text">{s.error}</p>}
  {s.message && <p role="status" className="text-sm font-medium text-green-800">{s.message}</p>}
</>);

export function HotlistForm({ v, categories, badges }: { v: HotlistValues; categories: Opt[]; badges: Opt[] }) {
  const [kind, setKind] = useState(v.kind);
  return (
    <ActionForm action={saveHotlist} buttonLabel={v.id ? "Save item" : "Create draft"}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="sr-only">Basics</legend>
        <div><label htmlFor="kind" className={labelCls}>Type</label>
          <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value === "pick" ? "pick" : "deal")} className={field}><option value="deal">Deal (has a price)</option><option value="pick">Pick (editorial, no price)</option></select></div>
        <div><label htmlFor="business" className={labelCls}>Business <span className="font-normal text-text-muted">(web address name)</span></label><input id="business" name="business" defaultValue={v.business} required placeholder="sample-creekside-cafe" className={field} /></div>
        <div><label htmlFor="category" className={labelCls}>Category</label>
          <select id="category" name="category" defaultValue={v.category} className={field}>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
        {kind === "deal" && <div><label htmlFor="badge" className={labelCls}>Label</label>
          <select id="badge" name="badge" defaultValue={v.badge} className={field}>{badges.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>}
      </fieldset>
      <div><label htmlFor="title" className={labelCls}>Title</label><input id="title" name="title" defaultValue={v.title} maxLength={90} required className={field} /></div>
      <div><label htmlFor="summary" className={labelCls}>One-line summary <span className="font-normal text-text-muted">(up to 180 characters)</span></label><input id="summary" name="summary" defaultValue={v.summary} maxLength={180} className={field} /></div>
      <div><label htmlFor="body" className={labelCls}>Description <span className="font-normal text-text-muted">(Markdown: **bold**, *italic*, [links](https://…))</span></label><textarea id="body" name="body" rows={6} maxLength={4000} defaultValue={v.body} className={field} /></div>
      {kind === "deal" && (
        <fieldset className="space-y-3 rounded-card border border-slate-600 p-3">
          <legend className="px-1 text-sm font-semibold text-text">The offer <span className="font-normal text-text-muted">(must save $10 or 20%)</span></legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label htmlFor="original" className={labelCls}>Original value ($)</label><input id="original" name="original" inputMode="decimal" defaultValue={v.original} required className={field} /></div>
            <div><label htmlFor="price" className={labelCls}>Hotlist price ($)</label><input id="price" name="price" inputMode="decimal" defaultValue={v.price} required className={field} /></div>
            <div><label htmlFor="quantity" className={labelCls}>Quantity <span className="font-normal text-text-muted">(blank: unlimited)</span></label><input id="quantity" name="quantity" inputMode="numeric" defaultValue={v.quantity} className={field} /></div>
            <div><label htmlFor="code_prefix" className={labelCls}>Code prefix <span className="font-normal text-text-muted">(3 to 8 letters or digits)</span></label><input id="code_prefix" name="code_prefix" defaultValue={v.code_prefix} maxLength={8} required className={field} /></div>
          </div>
          <div><label htmlFor="redemption" className={labelCls}>How to redeem</label><textarea id="redemption" name="redemption" rows={2} maxLength={500} defaultValue={v.redemption} required className={field} /></div>
        </fieldset>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="start_date" className={labelCls}>Starts <span className="font-normal text-text-muted">(blank: now)</span></label><input id="start_date" name="start_date" type="date" defaultValue={v.start_date} className={field} /></div>
        <div><label htmlFor="end_date" className={labelCls}>Last day {kind === "deal" ? <span className="font-normal text-text-muted">(required, within 120 days)</span> : <span className="font-normal text-text-muted">(optional)</span>}</label><input id="end_date" name="end_date" type="date" defaultValue={v.end_date} required={kind === "deal"} className={field} /></div>
      </div>
      <div><label htmlFor="terms" className={labelCls}>Terms</label><textarea id="terms" name="terms" rows={2} maxLength={1000} defaultValue={v.terms} className={field} /></div>
      <div><label htmlFor="status" className={labelCls}>Status</label>
        <select id="status" name="status" defaultValue={v.status} className={field}>
          <option value="draft">Draft (hidden)</option><option value="pending">Pending review (hidden)</option><option value="published">Published (needs a photo)</option><option value="archived">Archived (hidden)</option>
        </select></div>
    </ActionForm>
  );
}

export function ReviewPanel({ id }: { id: string }) {
  const [state, dispatch, pending] = useActionState<HotlistState, FormData>(reviewHotlist, {});
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={pending} className={primary} onClick={() => { const fd = new FormData(); fd.set("id", id); fd.set("decision", "approve"); startTransition(() => dispatch(fd)); }}>Approve and publish</button>
        <button type="button" className={ghost} onClick={() => setRejecting((r) => !r)} aria-expanded={rejecting}>Reject…</button>
      </div>
      {rejecting && (
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => dispatch(fd)); }} className="space-y-2">
          <input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value="reject" />
          <label htmlFor="reason" className={labelCls}>Why? <span className="font-normal text-text-muted">(the business will be told)</span></label>
          <textarea id="reason" name="reason" rows={2} maxLength={500} required className={field} />
          <button type="submit" disabled={pending} className="rounded-button bg-danger px-4 py-2 text-sm font-semibold text-danger-contrast disabled:opacity-60">Reject offer</button>
        </form>
      )}
      <Msg s={state} />
    </div>
  );
}

export function DeleteHotlist({ id }: { id: string }) {
  const [state, dispatch, pending] = useActionState<HotlistState, FormData>(deleteHotlist, {});
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {!confirm ? <button type="button" className={ghost} onClick={() => setConfirm(true)}>Delete item…</button> : (<>
        <span className="text-sm text-text">Delete this item for good?</span>
        <button type="button" disabled={pending} className="rounded-button bg-danger px-4 py-2 text-sm font-semibold text-danger-contrast disabled:opacity-60" onClick={() => { const fd = new FormData(); fd.set("id", id); startTransition(() => dispatch(fd)); }}>Yes, delete</button>
        <button type="button" className={ghost} onClick={() => setConfirm(false)}>Keep</button></>)}
      <Msg s={state} />
    </div>
  );
}

export function FeatureSlot({ slot, title, hint, options, selected, max }: { slot: string; title: string; hint: string; options: Opt[]; selected: string[]; max: number }) {
  return (
    <ActionForm action={saveFeatures} className="space-y-3" buttonLabel="Save slot">
      <input type="hidden" name="slot" value={slot} />
      <div><h3 className="font-semibold text-text">{title}</h3><p className="text-sm text-text-muted">{hint}</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: max }, (_, i) => (
          <div key={i}><label htmlFor={`${slot}-${i + 1}`} className={labelCls}>Position {i + 1}</label>
            <select id={`${slot}-${i + 1}`} name={`item_${i + 1}`} defaultValue={selected[i] ?? ""} className={field}><option value="">Empty</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        ))}
      </div>
    </ActionForm>
  );
}

export function RedeemForm() {
  return (
    <ActionForm action={redeemCode} className="flex flex-wrap items-end gap-3" buttonLabel="Mark redeemed" pendingLabel="Checking…">
      <div><label htmlFor="redeem-code" className={labelCls}>Hotlist code</label><input id="redeem-code" name="code" placeholder="SVL25-K7Q2M" autoComplete="off" required className={`${field} w-56`} /></div>
    </ActionForm>
  );
}
