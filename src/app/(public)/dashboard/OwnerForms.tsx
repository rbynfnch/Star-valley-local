"use client";

import { startTransition, useActionState, useState } from "react";
import { saveProfile, setLeadStatus, submitOffer, type OwnerState } from "./actions";

export const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-3 py-2 text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";
const label = "text-sm font-medium text-text";
const primary = "rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60";
const Msg = ({ s }: { s: OwnerState }) => (<div aria-live="polite">
  {s.error && <p role="alert" className="text-sm font-medium text-danger-text">{s.error}</p>}
  {s.message && <p role="status" className="text-sm font-medium text-green-800">{s.message}</p>}
</div>);

/** onSubmit instead of <form action>: React 19 resets a form after its action, which would wipe the fields on a failed save. */
function Form({ action, children, button, pendingLabel = "Saving…", className = "space-y-4", resetOnSuccess = false }: { action: (s: OwnerState, f: FormData) => Promise<OwnerState>; children: React.ReactNode; button: string; pendingLabel?: string; className?: string; resetOnSuccess?: boolean }) {
  const [state, dispatch, pending] = useActionState<OwnerState, FormData>(action, {});
  return (
    <form onSubmit={(e) => { const form = e.currentTarget; e.preventDefault(); const fd = new FormData(form); startTransition(() => dispatch(fd)); if (resetOnSuccess) setTimeout(() => { if (!form.querySelector("[role=alert]")) form.reset(); }, 1500); }} className={className}>
      {children}<Msg s={state} />
      <button type="submit" disabled={pending} className={primary}>{pending ? pendingLabel : button}</button>
    </form>
  );
}

export function ProfileForm({ business, v, enhanced }: { business: string; v: Record<string, string>; enhanced: boolean }) {
  const [short, setShort] = useState(v.short_description ?? "");
  const [long, setLong] = useState(v.description ?? "");
  const text = (id: string, name: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label htmlFor={id} className={label}>{name}</label><input id={id} name={id} defaultValue={v[id] ?? ""} className={field} {...props} /></div>
  );
  return (
    <Form action={saveProfile} button="Save changes">
      <input type="hidden" name="business" value={business} />
      <div className="grid gap-4 md:grid-cols-2">
        {text("name", "Business name", { required: true, maxLength: 200 })}
        {text("phone", "Phone", { type: "tel", maxLength: 40 })}
        {text("address_line1", "Street address", { maxLength: 200 })}
        {text("address_line2", "Address line 2", { maxLength: 200 })}
        {text("city", "City", { maxLength: 100 })}
        {text("postal_code", "ZIP", { maxLength: 20, inputMode: "numeric" })}
        {text("website", "Website", { type: "url", maxLength: 300, placeholder: "https://" })}
        {enhanced && text("email", "Public email", { type: "email", maxLength: 254 })}
      </div>
      <div><label htmlFor="short_description" className={label}>Short description <span className="font-normal text-text-muted">({short.length}/120)</span></label>
        <input id="short_description" name="short_description" maxLength={120} value={short} onChange={(e) => setShort(e.target.value)} className={field} /></div>
      {enhanced && <div><label htmlFor="description" className={label}>Longer description <span className="font-normal text-text-muted">({long.length}/1500)</span></label>
        <textarea id="description" name="description" rows={6} maxLength={1500} value={long} onChange={(e) => setLong(e.target.value)} className={field} /></div>}
      {text("hours_note", "Hours note", { maxLength: 300, placeholder: "e.g. Emergency service available" })}
    </Form>
  );
}

const STATUS_LABELS: [string, string][] = [["new", "New"], ["contacted", "Contacted"], ["in_progress", "In progress"], ["converted", "Became a customer"], ["lost", "Not a fit"]];
export function LeadStatus({ business, lead, status }: { business: string; lead: string; status: string }) {
  const [state, dispatch, pending] = useActionState<OwnerState, FormData>(setLeadStatus, {});
  const [value, setValue] = useState(status);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`st-${lead}`} className="sr-only">Status of this request</label>
      <select id={`st-${lead}`} value={value} disabled={pending} onChange={(e) => { const v = e.target.value; setValue(v); const fd = new FormData(); fd.set("business", business); fd.set("lead", lead); fd.set("status", v); startTransition(() => dispatch(fd)); }}
        className="rounded-button border border-slate-600 bg-surface-card px-2 py-1 text-sm text-text">
        {STATUS_LABELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <Msg s={state} />
    </div>
  );
}

export function OfferForm({ business, categories }: { business: string; categories: { value: string; label: string }[] }) {
  return (
    <Form action={submitOffer} button="Send for review" pendingLabel="Sending…" resetOnSuccess>
      <input type="hidden" name="business" value={business} />
      <div><label htmlFor="o-title" className={label}>Title</label><input id="o-title" name="title" maxLength={90} required className={field} /></div>
      <div><label htmlFor="o-summary" className={label}>One-line summary</label><input id="o-summary" name="summary" maxLength={180} className={field} /></div>
      <div><label htmlFor="o-body" className={label}>Description</label><textarea id="o-body" name="body" rows={4} maxLength={4000} className={field} /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label htmlFor="o-original" className={label}>Original value ($)</label><input id="o-original" name="original" inputMode="decimal" required className={field} /></div>
        <div><label htmlFor="o-price" className={label}>Hotlist price ($)</label><input id="o-price" name="price" inputMode="decimal" required className={field} /></div>
        <div><label htmlFor="o-qty" className={label}>Quantity <span className="font-normal text-text-muted">(blank: unlimited)</span></label><input id="o-qty" name="quantity" inputMode="numeric" className={field} /></div>
        <div><label htmlFor="o-end" className={label}>Last day</label><input id="o-end" name="end_date" type="date" required className={field} /></div>
        <div><label htmlFor="o-code" className={label}>Code prefix <span className="font-normal text-text-muted">(3 to 8 letters or digits)</span></label><input id="o-code" name="code_prefix" maxLength={8} required className={field} /></div>
        <div><label htmlFor="o-cat" className={label}>Category</label><select id="o-cat" name="category" className={field}>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
      </div>
      <div><label htmlFor="o-red" className={label}>How customers redeem it</label><textarea id="o-red" name="redemption" rows={2} maxLength={500} required className={field} /></div>
      <div><label htmlFor="o-terms" className={label}>Terms</label><textarea id="o-terms" name="terms" rows={2} maxLength={1000} className={field} /></div>
    </Form>
  );
}
