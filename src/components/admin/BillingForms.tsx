"use client";

import { useState, useTransition } from "react";
import type { BillingState } from "@/app/admin/(console)/placements/actions";

const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-2 py-1.5 text-sm text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";
const btn = "rounded-button px-3 py-1.5 text-sm font-semibold disabled:opacity-60";
const primary = `${btn} bg-brand text-brand-contrast hover:bg-brand-hover`;
const ghost = `${btn} border border-slate-600 text-text`;
type Act = (fd: FormData) => Promise<BillingState>;
export type Opt = { id: string; name: string };
export type Product = { code: string; name: string; kind: string; interval: string | null; amount_cents: number };

/** Runs a server action from a button or form, with the same message handling everywhere. */
function useAction(action: Act) {
  const [state, setState] = useState<BillingState>({});
  const [pending, start] = useTransition();
  const run = (fd: FormData) => start(async () => { try { setState(await action(fd)); } catch { setState({ error: "That could not be completed. Reload the page and try again." }); } });
  return { state, setState, pending, run };
}
const Msg = ({ s }: { s: BillingState }) => (
  <>
    {s.error && <p role="alert" className="text-sm font-medium text-danger-text">{s.error}</p>}
    {s.message && !s.full && <p role="status" className="text-sm font-medium text-green-800">{s.message}</p>}
  </>
);

function Money({ source, setSource, products, amount, setAmount, setMonths, productCode, setProductCode, idp }: {
  source: string; setSource: (s: string) => void; products: Product[]; amount: string; setAmount: (s: string) => void; setMonths: (m: string) => void; productCode: string; setProductCode: (s: string) => void; idp: string }) {
  return (
    <>
      <div>
        <label htmlFor={`${idp}-source`} className="text-sm font-medium text-text">Payment</label>
        <select id={`${idp}-source`} name="source" value={source} onChange={(e) => setSource(e.target.value)} className={field}>
          <option value="paid">Paid (mark as paid)</option><option value="founding_member">Comp: founding member</option><option value="campaign">Comp: campaign</option><option value="manual">Comp: other</option>
        </select>
      </div>
      {source === "paid" && (
        <>
          {products.length > 0 && (
            <div>
              <label htmlFor={`${idp}-product`} className="text-sm font-medium text-text">Product (fills in the price)</label>
              <select id={`${idp}-product`} name="product" value={productCode} className={field} onChange={(e) => {
                const p = products.find((x) => x.code === e.target.value); setProductCode(e.target.value);
                if (p) { setAmount((p.amount_cents / 100).toFixed(2)); setMonths(p.interval === "year" ? "12" : "1"); }
              }}>
                <option value="">Other</option>{products.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor={`${idp}-amount`} className="text-sm font-medium text-text">Amount paid ($)</label>
            <input id={`${idp}-amount`} name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} placeholder="19.00" />
          </div>
        </>
      )}
    </>
  );
}
function Term({ months, setMonths, term, setTerm, idp }: { months: string; setMonths: (m: string) => void; term: string; setTerm: (t: string) => void; idp: string }) {
  return (
    <fieldset className="space-y-2"><legend className="text-sm font-medium text-text">Runs for</legend>
      <div className="flex gap-4 text-sm"><label className="flex items-center gap-1"><input type="radio" name="term" value="months" checked={term === "months"} onChange={() => setTerm("months")} />Months</label>
        <label className="flex items-center gap-1"><input type="radio" name="term" value="date" checked={term === "date"} onChange={() => setTerm("date")} />Until a date</label></div>
      {term === "months"
        ? <div><label htmlFor={`${idp}-months`} className="sr-only">Months</label><input id={`${idp}-months`} name="months" type="number" min={1} max={36} value={months} onChange={(e) => setMonths(e.target.value)} className={field} /></div>
        : <div><label htmlFor={`${idp}-end`} className="sr-only">End date</label><input id={`${idp}-end`} name="end_date" type="date" className={field} /></div>}
    </fieldset>
  );
}

export function ActivateListingForm({ action, business, products, running }: { action: Act; business: string; products: Product[]; running: boolean }) {
  const { state, pending, run } = useAction(action);
  const [source, setSource] = useState("paid"), [amount, setAmount] = useState(""), [months, setMonths] = useState("1"), [term, setTerm] = useState("months"), [product, setProduct] = useState("");
  const [renews, setRenews] = useState(false), [notes, setNotes] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); run(new FormData(e.currentTarget)); }} className="space-y-3">
      <input type="hidden" name="business" value={business} />
      <Term months={months} setMonths={setMonths} term={term} setTerm={setTerm} idp="l" />
      <Money source={source} setSource={setSource} products={products.filter((p) => p.kind === "listing")} amount={amount} setAmount={setAmount} setMonths={setMonths} productCode={product} setProductCode={setProduct} idp="l" />
      <div className="flex items-center gap-2"><input id="l-renews" name="auto_renews" type="checkbox" value="yes" checked={renews} onChange={(e) => setRenews(e.target.checked)} className="h-4 w-4" /><label htmlFor="l-renews" className="text-sm text-text">Recurring Stripe subscription (renews by itself)</label></div>
      <div><label htmlFor="l-notes" className="text-sm font-medium text-text">Notes (optional: Stripe reference, who agreed)</label><input id="l-notes" name="notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className={field} /></div>
      <Msg s={state} />
      <button type="submit" disabled={pending} className={primary}>{pending ? "Saving…" : running ? "Extend Enhanced listing" : source === "paid" ? "Mark paid and activate Enhanced" : "Activate Enhanced (comp)"}</button>
    </form>
  );
}

export function ActivatePlacementForm({ action, waitlistAction, business, products, categories, communities }: { action: Act; waitlistAction: Act; business: string; products: Product[]; categories: Opt[]; communities: Opt[] }) {
  const { state, setState, pending, run } = useAction(action);
  const wl = useAction(waitlistAction);
  const [slot, setSlot] = useState("category"), [scope, setScope] = useState(""), [source, setSource] = useState("paid"), [amount, setAmount] = useState(""), [months, setMonths] = useState("1"), [term, setTerm] = useState("months"), [product, setProduct] = useState("");
  const scopes = slot === "category" ? categories : slot === "community" ? communities : [];
  const submit = (fd: FormData) => { setState({}); wl.setState({}); run(fd); };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }} className="space-y-3">
      <input type="hidden" name="business" value={business} />
      <div>
        <label htmlFor="p-slot" className="text-sm font-medium text-text">Appears on</label>
        <select id="p-slot" name="slot" value={slot} onChange={(e) => { setSlot(e.target.value); setScope(""); }} className={field}>
          <option value="category">A category page</option><option value="community">A community page</option><option value="homepage">The home page</option><option value="things_to_do">Things to Do</option>
        </select>
      </div>
      {scopes.length > 0 && (
        <div>
          <label htmlFor="p-scope" className="text-sm font-medium text-text">{slot === "category" ? "Category" : "Community"}</label>
          <select id="p-scope" name="scope" value={scope} onChange={(e) => setScope(e.target.value)} className={field}><option value="">Choose…</option>{scopes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </div>
      )}
      <Term months={months} setMonths={setMonths} term={term} setTerm={setTerm} idp="p" />
      <Money source={source} setSource={setSource} products={products.filter((p) => p.kind === "placement")} amount={amount} setAmount={setAmount} setMonths={setMonths} productCode={product} setProductCode={setProduct} idp="p" />
      <div><label htmlFor="p-notes" className="text-sm font-medium text-text">Notes (optional)</label><input id="p-notes" name="notes" maxLength={500} className={field} /></div>
      <Msg s={state} /><Msg s={wl.state} />
      {state.full && (
        <div role="alert" className="rounded-card bg-surface-muted p-3 text-sm text-text">
          That spot is full right now. Nothing was charged or recorded.
          <div className="mt-2"><button type="button" disabled={wl.pending} className={ghost} onClick={() => { const fd = new FormData(); fd.set("business", business); fd.set("slot", slot); if (scope) fd.set("scope", scope); wl.run(fd); }}>{wl.pending ? "Adding…" : "Add to the waitlist"}</button></div>
        </div>
      )}
      <button type="submit" disabled={pending} className={primary}>{pending ? "Saving…" : source === "paid" ? "Mark paid and activate Featured" : "Activate Featured (comp)"}</button>
    </form>
  );
}

/** A two-step "end" control: the first click asks for a reason, the second confirms. */
export function EndButton({ action, fields, label, confirmLabel }: { action: Act; fields: Record<string, string>; label: string; confirmLabel: string }) {
  const { state, pending, run } = useAction(action);
  const [open, setOpen] = useState(false);
  if (state.message && !state.error) return <p role="status" className="text-sm font-medium text-green-800">{state.message}</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={ghost}>{label}</button>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); for (const [k, v] of Object.entries(fields)) fd.set(k, v); run(fd); }} className="space-y-2 rounded-card bg-surface-muted p-3">
      <label className="text-sm font-medium text-text">Reason (optional)<input name="reason" maxLength={500} className={field} /></label>
      <Msg s={state} />
      <div className="flex gap-2"><button type="submit" disabled={pending} className={primary}>{pending ? "Working…" : confirmLabel}</button><button type="button" onClick={() => setOpen(false)} className={ghost}>Cancel</button></div>
    </form>
  );
}

/** Promote a waitlist entry into an active placement. */
export function PromoteForm({ action, waitlistId, products }: { action: Act; waitlistId: string; products: Product[] }) {
  const { state, setState, pending, run } = useAction(action);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("paid"), [amount, setAmount] = useState(""), [months, setMonths] = useState("1"), [term, setTerm] = useState("months"), [product, setProduct] = useState("");
  if (state.message && !state.error && !state.full) return <p role="status" className="text-sm font-medium text-green-800">{state.message}</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={primary}>Promote</button>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); setState({}); run(new FormData(e.currentTarget)); }} className="space-y-3 rounded-card bg-surface-muted p-3">
      <input type="hidden" name="waitlist_id" value={waitlistId} />
      <Term months={months} setMonths={setMonths} term={term} setTerm={setTerm} idp={`w${waitlistId.slice(0, 4)}`} />
      <Money source={source} setSource={setSource} products={products.filter((p) => p.kind === "placement")} amount={amount} setAmount={setAmount} setMonths={setMonths} productCode={product} setProductCode={setProduct} idp={`w${waitlistId.slice(0, 4)}`} />
      <Msg s={state} />
      {state.full && <p role="alert" className="text-sm font-medium text-danger-text">That spot is still full. End a placement first.</p>}
      <div className="flex gap-2"><button type="submit" disabled={pending} className={primary}>{pending ? "Working…" : source === "paid" ? "Mark paid and activate" : "Activate (comp)"}</button><button type="button" onClick={() => setOpen(false)} className={ghost}>Cancel</button></div>
    </form>
  );
}
