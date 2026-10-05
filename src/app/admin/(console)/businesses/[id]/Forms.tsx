"use client";

import { useActionState, useState } from "react";
import { addEntry, setStage, type FormState } from "./actions";

const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-2 py-1.5 text-sm text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";
const btn = "rounded-button bg-brand px-4 py-1.5 text-sm font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60";
const Msg = ({ s }: { s: FormState }) => (
  <>
    {s.error && <p role="alert" className="text-sm font-medium text-danger-text">{s.error}</p>}
    {s.saved && <p role="status" className="text-sm font-medium text-green-800">{s.saved}</p>}
  </>
);

export function StageForm({ business, stage, lostReason, stages }: { business: string; stage: string; lostReason: string | null; stages: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setStage, {});
  const [value, setValue] = useState(stage);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="business" value={business} />
      <div>
        <label htmlFor="stage" className="text-sm font-medium text-text">Lead stage</label>
        <select id="stage" name="stage" value={value} onChange={(e) => setValue(e.target.value)} className={field}>
          {stages.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      {value === "lost" && (
        <div>
          <label htmlFor="lost_reason" className="text-sm font-medium text-text">Why lost (optional)</label>
          <input id="lost_reason" name="lost_reason" maxLength={500} defaultValue={lostReason ?? ""} className={field} />
        </div>
      )}
      <button type="submit" disabled={pending} className={btn}>{pending ? "Saving…" : "Save stage"}</button>
      <Msg s={state} />
    </form>
  );
}

export function EntryForm({ business, kinds, outcomes }: { business: string; kinds: { value: string; label: string }[]; outcomes: { value: string; label: string }[] }) {
  const [kind, setKind] = useState("note");
  // Controlled, so a failed save (bad signal in the field) never wipes what was typed; cleared only on success.
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, form) => {
    const r = await addEntry(prev, form);
    if (r.saved) { setSubject(""); setBody(""); setFollowUp(""); }
    return r;
  }, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="business" value={business} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="kind" className="text-sm font-medium text-text">Type</label>
          <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>{kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
        </div>
        {kind === "visit" && (
          <div>
            <label htmlFor="outcome" className="text-sm font-medium text-text">Visit outcome</label>
            <select id="outcome" name="outcome" defaultValue="" className={field}><option value="">–</option>{outcomes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          </div>
        )}
      </div>
      <div>
        <label htmlFor="subject" className="text-sm font-medium text-text">Subject (optional)</label>
        <input id="subject" name="subject" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="body" className="text-sm font-medium text-text">Notes</label>
        <textarea id="body" name="body" rows={4} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="follow_up" className="text-sm font-medium text-text">Follow up on (optional)</label>
        <input id="follow_up" name="follow_up" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={field} />
      </div>
      <button type="submit" disabled={pending} className={btn}>{pending ? "Saving…" : "Add to log"}</button>
      <Msg s={state} />
    </form>
  );
}
