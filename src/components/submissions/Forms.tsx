"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { resetTurnstile, Turnstile } from "@/components/auth/Turnstile";

type State = { done?: boolean; error?: string };
type Action = (prev: State, form: FormData) => Promise<State>;
const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-3 py-2 text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";
const label = "block text-sm font-medium text-text";
const hint = "mt-1 text-xs text-text-muted";

function Shell({ action, siteKey, children, thanks, submitLabel }: { action: Action; siteKey?: string; children: React.ReactNode; thanks: React.ReactNode; submitLabel: string }) {
  const [state, setState] = useState<State>({});
  const [pending, startTransition] = useTransition();
  if (state.done) return <div role="status" className="rounded-card bg-surface-card p-5 shadow-card"><h2 className="font-heading text-xl font-semibold text-text">Thank you</h2><div className="mt-2 text-text-body">{thanks}</div></div>;
  // onSubmit (not <form action>): React 19 resets a form after its action, which would wipe the fields on an error.
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(async () => { const next = await action(state, fd); setState(next); if (next.error) resetTurnstile(); }); }}
      className="space-y-4 rounded-card bg-surface-card p-5 shadow-card" noValidate>
      {children}
      <Turnstile siteKey={siteKey} />
      {state.error && <p role="alert" className="text-sm font-medium text-brand-text">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60">{pending ? "Sending…" : submitLabel}</button>
      <p className="text-xs text-text-muted">We review every submission before anything is published or changed.</p>
    </form>
  );
}
const Text = ({ id, text, type = "text", required, max, placeholder, current }: { id: string; text: string; type?: string; required?: boolean; max?: number; placeholder?: string; current?: string | null }) => (
  <div>
    <label htmlFor={id} className={label}>{text}{required ? " (required)" : ""}</label>
    <input id={id} name={id} type={type} maxLength={max} placeholder={placeholder} className={field} />
    {current ? <p className={hint}>Currently: {current}</p> : null}
  </div>
);
const Area = ({ id, text, max, rows = 3 }: { id: string; text: string; max: number; rows?: number }) => (
  <div><label htmlFor={id} className={label}>{text}</label><textarea id={id} name={id} rows={rows} maxLength={max} className={field} /></div>
);
function Contact({ emailRequired }: { emailRequired: boolean }) {
  return (
    <fieldset className="space-y-4 border-t border-slate-600/20 pt-4">
      <legend className="text-sm font-semibold text-text">About you {emailRequired ? "" : "(optional)"}</legend>
      <Text id="your_name" text="Your name" max={100} />
      <Text id="your_email" text="Your email" type="email" required={emailRequired} max={254} />
      <p className={hint}>Only our team sees this, and only to follow up. {emailRequired ? "" : "Leave it blank if you prefer."}</p>
    </fieldset>
  );
}

export function UpdateForm({ action, slug, businessName, current, siteKey }: { action: Action; slug: string; businessName: string; current: { phone: string | null; website: string | null; address: string | null }; siteKey?: string }) {
  return (
    <Shell action={action} siteKey={siteKey} submitLabel="Send suggestion" thanks={<><p>We will check this and update {businessName} if it holds up.</p><p className="mt-3"><Link href={`/business/${slug}`} className="font-semibold text-link underline">Back to the listing</Link></p></>}>
      <input type="hidden" name="business" value={slug} />
      <p className="text-text-body">Fill in only what is wrong or missing.</p>
      <Text id="name" text="Business name" max={200} />
      <Text id="address" text="Street address" max={200} current={current.address} />
      <Text id="city" text="City or town" max={100} />
      <Text id="phone" text="Phone" type="tel" max={40} current={current.phone} />
      <Text id="website" text="Website" max={300} placeholder="example.com" current={current.website} />
      <Text id="hours" text="Hours" max={300} placeholder="e.g. Mon to Fri 8 to 5, closed Sunday" />
      <div className="flex items-center gap-2"><input id="closed" name="closed" type="checkbox" value="yes" className="h-4 w-4" /><label htmlFor="closed" className="text-sm text-text">This business has closed for good</label></div>
      <Area id="note" text="Anything else we should know?" max={1000} />
      <Contact emailRequired={false} />
    </Shell>
  );
}

type Opt = { id: string; name: string };
export function BusinessForm({ action, communities, categories, siteKey }: { action: Action; communities: Opt[]; categories: Opt[]; siteKey?: string }) {
  return (
    <Shell action={action} siteKey={siteKey} submitLabel="Suggest this business" thanks={<><p>We will look it over and add it if it belongs in the directory.</p><p className="mt-3"><Link href="/businesses" className="font-semibold text-link underline">Browse the directory</Link></p></>}>
      <Text id="name" text="Business name" required max={200} />
      <div>
        <label htmlFor="category_id" className={label}>Category</label>
        <select id="category_id" name="category_id" defaultValue="" className={field}><option value="">Not sure</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>
      <Text id="category_text" text="What kind of business is it, in your words?" max={100} placeholder="e.g. Sourdough bakery" />
      <div>
        <label htmlFor="community_id" className={label}>Community</label>
        <select id="community_id" name="community_id" defaultValue="" className={field}><option value="">Not sure</option>{communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>
      <Text id="address" text="Street address" max={200} />
      <Text id="city" text="City or town" max={100} />
      <Text id="phone" text="Business phone" type="tel" max={40} />
      <Text id="website" text="Website" max={300} placeholder="example.com" />
      <Area id="description" text="A sentence about what they do" max={500} />
      <Area id="note" text="Anything else we should know?" max={1000} />
      <Contact emailRequired />
    </Shell>
  );
}

export function EventForm({ action, communities, siteKey }: { action: Action; communities: Opt[]; siteKey?: string }) {
  const [allDay, setAllDay] = useState(false);
  return (
    <Shell action={action} siteKey={siteKey} submitLabel="Submit event" thanks={<><p>We will review it and add it to the events calendar.</p><p className="mt-3"><Link href="/businesses" className="font-semibold text-link underline">Browse the directory</Link></p></>}>
      <Text id="title" text="Event name" required max={200} />
      <Area id="description" text="What is happening?" max={2000} rows={4} />
      <div className="grid grid-cols-2 gap-4">
        <div><label htmlFor="start_date" className={label}>Start date (required)</label><input id="start_date" name="start_date" type="date" className={field} /></div>
        {!allDay && <div><label htmlFor="start_time" className={label}>Start time (required)</label><input id="start_time" name="start_time" type="time" className={field} /></div>}
        <div><label htmlFor="end_date" className={label}>End date</label><input id="end_date" name="end_date" type="date" className={field} /></div>
        {!allDay && <div><label htmlFor="end_time" className={label}>End time</label><input id="end_time" name="end_time" type="time" className={field} /></div>}
      </div>
      <div className="flex items-center gap-2"><input id="all_day" name="all_day" type="checkbox" value="yes" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4" /><label htmlFor="all_day" className="text-sm text-text">All day</label></div>
      <p className={hint}>Times are Mountain Time.</p>
      <Text id="venue_name" text="Where is it?" max={200} placeholder="e.g. Afton Town Park" />
      <Text id="address" text="Address" max={200} />
      <div>
        <label htmlFor="community_id" className={label}>Community</label>
        <select id="community_id" name="community_id" defaultValue="" className={field}><option value="">Not sure</option>{communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>
      <Text id="url" text="Link for more information" max={300} placeholder="example.com/event" />
      <Text id="organizer" text="Who is organizing it?" max={200} />
      <Area id="note" text="Anything else we should know?" max={1000} />
      <Contact emailRequired />
    </Shell>
  );
}
