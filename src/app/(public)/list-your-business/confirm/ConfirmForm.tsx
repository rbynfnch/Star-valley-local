"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { confirmEmailClaim, type ConfirmState } from "./actions";

export function ConfirmForm({ claim, token, businessName }: { claim: string; token: string; businessName: string }) {
  const [state, setState] = useState<ConfirmState>({});
  const [pending, start] = useTransition();
  if (state.done && state.ok) {
    return (
      <div role="status" className="rounded-card bg-surface-card p-5 shadow-card">
        <h2 className="font-heading text-xl font-semibold text-text">You&apos;re verified</h2>
        <p className="mt-2 text-text-body">{businessName} now shows as claimed and verified on Star Valley Local.</p>
        <p className="mt-4 flex flex-wrap gap-4"><Link href="/dashboard" className="rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover">Open your dashboard</Link>{state.slug && <Link href={`/business/${state.slug}`} className="font-semibold text-link underline">View your listing</Link>}</p>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { try { setState(await confirmEmailClaim(state, fd)); } catch { setState({ error: "That did not work. Try again in a minute." }); } }); }}
      className="space-y-4 rounded-card bg-surface-card p-5 shadow-card">
      <input type="hidden" name="c" value={claim} />
      <input type="hidden" name="t" value={token} />
      <p className="text-text-body">Confirm that you manage <strong className="[overflow-wrap:anywhere]">{businessName}</strong>. This links the listing to your account.</p>
      {state.error && <p role="alert" className="text-sm font-medium text-danger-text">{state.error}</p>}
      {state.done && !state.ok
        ? <p><Link href="/businesses" className="font-semibold text-link underline">Find your business</Link></p>
        : <button type="submit" disabled={pending} className="rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60">{pending ? "Confirming…" : "Yes, I manage this business"}</button>}
    </form>
  );
}
