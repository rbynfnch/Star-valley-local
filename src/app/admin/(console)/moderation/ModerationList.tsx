"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import type { CardView } from "@/lib/admin/moderation-view";
import { reviewSubmission, type ReviewState } from "./actions";

const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-2 py-1.5 text-sm text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";
const btn = "rounded-button px-3 py-1.5 text-sm font-semibold disabled:opacity-60";

function ReviewForm({ c, onDone }: { c: CardView; onDone: (m: string) => void }) {
  const [state, dispatch, pending] = useActionState<ReviewState, FormData>(async (prev, fd) => { const r = await reviewSubmission(prev, fd); if (r.message) onDone(r.message); return r; }, {});
  const [notes, setNotes] = useState("");
  const [apply, setApply] = useState(false);
  const submit = (action: "approve" | "reject" | "spam", force = false) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form!; const fd = new FormData(form);
    fd.set("action", action); if (force) fd.set("force", "yes");
    startTransition(() => dispatch(fd));
  };
  return (
    <form onSubmit={(e) => e.preventDefault()} className="mt-4 space-y-3 border-t border-slate-600/20 pt-3">
      <input type="hidden" name="id" value={c.id} />
      <div>
        <label htmlFor={`notes-${c.id}`} className="text-sm font-medium text-text">Notes (optional, kept with the decision)</label>
        <textarea id={`notes-${c.id}`} name="notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
      </div>
      {c.canApply && (
        <div className="flex items-start gap-2">
          <input id={`apply-${c.id}`} name="apply" type="checkbox" value="yes" checked={apply} onChange={(e) => setApply(e.target.checked)} className="mt-1 h-4 w-4" />
          <label htmlFor={`apply-${c.id}`} className="text-sm text-text">Apply the suggested {c.applicableFields.join(", ").toLowerCase()} to the business when approving (recorded as a staff edit)</label>
        </div>
      )}
      {c.approveBlockedReason && <p className="text-sm text-text-muted">{c.approveBlockedReason} You can still reject it or mark it as spam.</p>}
      {state.duplicate && (
        <div role="alert" className="rounded-card bg-surface-muted p-3 text-sm text-text">
          This looks like <Link href={`/admin/businesses/${state.duplicate.id}`} className="font-semibold text-link underline">{state.duplicate.name}</Link>, which is already in the directory.
          <div className="mt-2"><button type="button" onClick={submit("approve", true)} disabled={pending} className={`${btn} border border-slate-600 text-text`}>Add it anyway</button></div>
        </div>
      )}
      {state.error && <p role="alert" className="text-sm font-medium text-brand-text">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        {c.canApprove && <button type="button" onClick={submit("approve")} disabled={pending} className={`${btn} bg-brand text-brand-contrast hover:bg-brand-hover`}>{pending ? "Working…" : "Approve"}</button>}
        <button type="button" onClick={submit("reject")} disabled={pending} className={`${btn} border border-slate-600 text-text`}>Reject</button>
        <button type="button" onClick={submit("spam")} disabled={pending} className={`${btn} border border-slate-600 text-text`}>Spam</button>
      </div>
    </form>
  );
}

export function ModerationList({ cards, empty }: { cards: CardView[]; empty: string }) {
  const [flash, setFlash] = useState<string | null>(null);
  return (
    <>
      {flash && <p role="status" className="mt-4 rounded-card bg-surface-muted p-3 text-sm font-medium text-green-800">{flash}</p>}
      {cards.length === 0 && <p className="mt-4 rounded-card bg-surface-card p-6 text-text-muted shadow-card">{empty}</p>}
      <ul className="mt-4 space-y-4">
        {cards.map((c) => (
          <li key={c.id} className="rounded-card bg-surface-card p-4 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-heading text-lg font-semibold text-text">{c.kindLabel}{c.businessName ? <> for {c.businessHref ? <Link href={c.businessHref} className="text-link underline">{c.businessName}</Link> : c.businessName}</> : null}</h2>
              <p className="text-xs text-text-muted">{c.when}</p>
            </div>
            <p className="mt-1 text-sm text-text-muted [overflow-wrap:anywhere]">From {c.who}</p>
            {c.closed && <p className="mt-2 inline-block rounded-full bg-surface-muted px-3 py-0.5 text-sm font-semibold text-text">Says this business has closed for good</p>}
            <dl className="mt-3 divide-y divide-slate-600/15 text-sm">
              {c.details.map((d) => (
                <div key={d.label} className="grid grid-cols-3 gap-2 py-1.5"><dt className="text-text-muted">{d.label}</dt><dd className="col-span-2 whitespace-pre-wrap text-text [overflow-wrap:anywhere]">{d.value}</dd></div>
              ))}
            </dl>
            {c.note && <p className="mt-3 whitespace-pre-wrap rounded-card bg-surface-muted p-3 text-sm text-text-body [overflow-wrap:anywhere]">{c.note}</p>}
            {c.status === "pending"
              ? <ReviewForm c={c} onDone={setFlash} />
              : <p className="mt-3 text-sm text-text-muted">{c.status === "approved" ? "Approved" : c.status === "rejected" ? "Rejected" : "Marked as spam"}{c.reviewed ? ` · ${c.reviewed}` : ""}{c.resolutionNotes ? ` · ${c.resolutionNotes}` : ""}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}
