"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { saveFields, type EditState } from "./actions";

const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-2 py-1.5 text-sm text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";
type Opt = { id: string; name: string };
export interface Values { [k: string]: string }

export function EditForm({ business, values, communities, categories, published }: { business: string; values: Values; communities: Opt[]; categories: Opt[]; published: boolean }) {
  const [state, dispatch, pending] = useActionState<EditState, FormData>(saveFields, {});
  const [short, setShort] = useState(values.short_description ?? "");
  const [long, setLong] = useState(values.description ?? "");
  const text = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-text">{label}</label>
      <input id={id} name={id} defaultValue={values[id] ?? ""} className={field} {...props} />
    </div>
  );
  // onSubmit instead of <form action>: React 19 resets a form after its action, which would wipe the fields on a failed save.
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => dispatch(fd)); }} className="space-y-4">
      <input type="hidden" name="business" value={business} />
      <div className="grid gap-4 md:grid-cols-2">
        {text("name", "Name", { required: true, maxLength: 200 })}
        {text("legal_name", "Legal name", { maxLength: 200 })}
        <div>
          <label htmlFor="home_community_id" className="text-sm font-medium text-text">Home community{published ? " (required)" : ""}</label>
          <select id="home_community_id" name="home_community_id" defaultValue={values.home_community_id ?? ""} className={field} required={published}>
            <option value="">–</option>{communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="primary_category_id" className="text-sm font-medium text-text">Primary category{published ? " (required)" : ""}</label>
          <select id="primary_category_id" name="primary_category_id" defaultValue={values.primary_category_id ?? ""} className={field} required={published}>
            <option value="">–</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {text("address_line1", "Street address", { maxLength: 200 })}
        {text("address_line2", "Address line 2", { maxLength: 200 })}
        {text("city", "City", { maxLength: 100 })}
        {text("postal_code", "ZIP", { maxLength: 20, inputMode: "numeric" })}
        {text("phone", "Phone", { type: "tel", maxLength: 40 })}
        {text("website", "Website", { type: "url", maxLength: 300, placeholder: "https://" })}
        {text("email", "Public email", { type: "email", maxLength: 254 })}
      </div>
      <div>
        <label htmlFor="short_description" className="text-sm font-medium text-text">Short description <span className="font-normal text-text-muted">({short.length}/120)</span></label>
        <input id="short_description" name="short_description" maxLength={120} value={short} onChange={(e) => setShort(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="description" className="text-sm font-medium text-text">Description <span className="font-normal text-text-muted">({long.length}/1500) · shown on Enhanced listings only</span></label>
        <textarea id="description" name="description" rows={6} maxLength={1500} value={long} onChange={(e) => setLong(e.target.value)} className={field} />
      </div>
      {text("hours_note", "Hours note", { maxLength: 300, placeholder: "e.g. Emergency service available" })}
      {state.error && <p role="alert" className="text-sm font-medium text-danger-text">{state.error}</p>}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="rounded-button bg-brand px-5 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60">{pending ? "Saving…" : "Save changes"}</button>
        <Link href={`/admin/businesses/${business}`} className="text-sm font-medium text-link underline">Cancel</Link>
      </div>
    </form>
  );
}
