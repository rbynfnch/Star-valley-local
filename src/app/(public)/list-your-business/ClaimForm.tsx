"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { resetTurnstile, Turnstile } from "@/components/auth/Turnstile";
import { startClaim, verifyClaim, type ClaimState } from "./actions";

const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-3 py-2 text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";
const btn = "rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60";

export function ClaimForm({ slug, businessName, maskedPhone, siteKey }: { slug: string; businessName: string; maskedPhone: string; siteKey?: string }) {
  const [state, setState] = useState<ClaimState>({ step: "start" });
  const [pending, startTransition] = useTransition();
  const onSubmit = (action: (prev: ClaimState, fd: FormData) => Promise<ClaimState>) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => { const next = await action(state, fd); setState(next); if (next.error) resetTurnstile(); });
  };

  if (state.step === "done") {
    return (
      <div role="status" className="rounded-card bg-surface-card p-5 shadow-card">
        <h2 className="font-heading text-xl font-semibold text-text">You&apos;re verified</h2>
        <p className="mt-2 text-text-body">{businessName} now shows as claimed and verified on Star Valley Local. Owner tools for editing your listing are coming soon.</p>
        <p className="mt-4"><Link href={`/business/${slug}`} className="font-semibold text-link underline">View your listing</Link></p>
      </div>
    );
  }
  if (state.step === "code") {
    return (
      <form onSubmit={onSubmit(verifyClaim)} className="space-y-4 rounded-card bg-surface-card p-5 shadow-card" noValidate>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="claim_id" value={state.claimId} />
        <p className="text-text-body">We texted a 6-digit code to {state.sentTo ?? maskedPhone}. It works for 10 minutes.</p>
        <div>
          <label htmlFor="code" className="block text-sm font-medium text-text">Code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 -]*" maxLength={12} required className={field} />
        </div>
        {state.error && <p role="alert" className="text-sm font-medium text-brand-text">{state.error}</p>}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={pending} className={btn}>{pending ? "Checking…" : "Verify"}</button>
          <button type="button" onClick={() => setState({ step: "start" })} className="text-sm font-medium text-link underline">Send a new code</button>
        </div>
      </form>
    );
  }
  return (
    <form onSubmit={onSubmit(startClaim)} className="space-y-4 rounded-card bg-surface-card p-5 shadow-card" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <p className="text-text-body">To prove this is your business, we&apos;ll text a code to the phone number on the listing: <strong>{maskedPhone}</strong>.</p>
      <Turnstile siteKey={siteKey} />
      {state.error && <p role="alert" className="text-sm font-medium text-brand-text">{state.error}</p>}
      <button type="submit" disabled={pending} className={btn}>{pending ? "Sending…" : "Text me a code"}</button>
      <p className="text-xs text-text-muted">Message and data rates may apply. We only use this number to send this one code.</p>
    </form>
  );
}
