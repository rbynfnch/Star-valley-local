"use client";

import { useState, useTransition } from "react";
import { resetTurnstile, Turnstile } from "@/components/auth/Turnstile";
import { claimDeal, type DealClaimState } from "@/app/(public)/hotlist/actions";

/** The pass: a code to show at the counter. Shown on the page for people who already claimed, and right after claiming. */
export function Pass({ code, business, redemption, endsText, redeemed = false }: { code: string; business: string; redemption: string | null; endsText: string | null; redeemed?: boolean }) {
  return (
    <section aria-labelledby="pass-h" className="overflow-hidden rounded-card bg-surface-inverse text-text-on-inverse shadow-card">
      <div className="border-b border-dashed border-text-on-inverse/40 p-6">
        <h2 id="pass-h" className="text-sm font-semibold text-text-on-inverse">Your Hotlist code{redeemed ? " · redeemed" : ""}</h2>
        <p className="mt-2 break-all font-heading text-4xl font-bold tracking-wider text-white" aria-label={"Code " + code.split("").join(" ")}>{code}</p>
        <p className="mt-2 text-text-on-inverse">Show this code at {business}.</p>
      </div>
      <div className="space-y-1 p-6 text-sm text-text-on-inverse">
        {redemption && <p>{redemption}</p>}
        {endsText && <p>{endsText}</p>}
        <p>Screenshot it or find it again on this page while you are signed in.</p>
      </div>
    </section>
  );
}

export function GetDeal({ slug, business, redemption, endsText, siteKey, signedIn, signInHref }: { slug: string; business: string; redemption: string | null; endsText: string | null; siteKey?: string; signedIn: boolean; signInHref: string }) {
  const [state, setState] = useState<DealClaimState>({});
  const [pending, start] = useTransition();
  if (state.code) return <div role="status"><Pass code={state.code} business={business} redemption={redemption} endsText={endsText} /></div>;
  if (!signedIn) {
    return (
      <div className="space-y-2">
        <a href={signInHref} className="inline-block rounded-button bg-brand px-6 py-3 text-lg font-semibold text-brand-contrast hover:bg-brand-hover">Get deal</a>
        <p className="text-sm text-text-muted">Sign in or create a free account to get your code.</p>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { try { const next = await claimDeal(state, fd); setState(next); if (next.error) resetTurnstile(); } catch { setState({ error: "That did not work. Try again in a minute." }); } }); }} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <Turnstile siteKey={siteKey} />
      <button type="submit" disabled={pending} className="rounded-button bg-brand px-6 py-3 text-lg font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60">{pending ? "Getting your code…" : "Get deal"}</button>
      <div aria-live="polite">{state.error && <p role="alert" className="text-sm font-medium text-danger-text">{state.error}</p>}</div>
    </form>
  );
}
