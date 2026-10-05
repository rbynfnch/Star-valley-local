"use client";

import { useActionState } from "react";
import { sendClaimLink, type ClaimLinkState } from "./claim-actions";

export interface ClaimOverview {
  status: string; owned: boolean; phone_last4: string | null; email_hint: string | null;
  invites: { method: string; status: string; created_at: string; expires_at: string; verified_at: string | null }[];
}
const btn = "rounded-button border border-slate-600 px-3 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted disabled:opacity-60";

export function ClaimLinkCard({ business, overview, stamp }: { business: string; overview: ClaimOverview; stamp: Record<number, string> }) {
  const [state, action, pending] = useActionState<ClaimLinkState, FormData>(sendClaimLink, {});
  const claimable = overview.status === "unclaimed" && !overview.owned;
  return (
    <div className="space-y-3">
      {overview.owned || overview.status === "claimed" ? (
        <p className="text-text-body">This business is already claimed.</p>
      ) : !claimable ? (
        <p className="text-text-body">Publish the business before sending a claim link.</p>
      ) : (
        <form action={action} className="space-y-2">
          <input type="hidden" name="business" value={business} />
          <p className="text-text-body">The link goes only to the contact already on the listing, so opening it proves they control it. The listing becomes Green Verified when they confirm.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" name="channel" value="email" disabled={pending || !overview.email_hint} className={btn}>{overview.email_hint ? `Email link to ${overview.email_hint}` : "No email on file"}</button>
            <button type="submit" name="channel" value="sms" disabled={pending || !overview.phone_last4} className={btn}>{overview.phone_last4 ? `Text link to (•••) •••-${overview.phone_last4}` : "No phone on file"}</button>
          </div>
          <p className="text-xs text-text-muted">The link lasts 7 days and each new link replaces the last. In the field, use “claimed together” in the log and ask the owner to open it on their phone.</p>
          <div aria-live="polite">
            {state.error && <p role="alert" className="text-sm font-medium text-danger-text">{state.error}</p>}
            {state.saved && <p role="status" className="text-sm font-medium text-green-800">{state.saved}</p>}
          </div>
        </form>
      )}
      {overview.invites.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text">Recent links</h3>
          <ul className="mt-1 space-y-1 text-text-body">
            {overview.invites.map((i, n) => (
              <li key={n}>{i.method === "sms_code" ? "Text" : "Email"} · {stamp[n]} · <span className="font-medium">{i.status === "verified" ? "Confirmed" : i.status === "pending" ? "Waiting" : i.status === "expired" ? "Expired" : i.status === "cancelled" ? "Replaced" : "Stopped"}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
