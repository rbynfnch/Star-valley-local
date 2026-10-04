"use client";

import { useState, useTransition } from "react";
import { joinWaitlist, type WaitlistState } from "./actions";

export function WaitlistButton({ business, slot, scope, label }: { business: string; slot: string; scope?: string; label: string }) {
  const [state, setState] = useState<WaitlistState>({});
  const [pending, startTransition] = useTransition();
  if (state.ok) return <p role="status" className="text-sm font-medium text-green-800">You are on the waitlist{state.position ? ` (position ${state.position})` : ""}. We will be in touch when a spot opens.</p>;
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => startTransition(async () => {
        const fd = new FormData(); fd.set("business", business); fd.set("slot", slot); if (scope) fd.set("scope", scope);
        setState(await joinWaitlist(fd));
      })} className="rounded-button border border-slate-600 px-4 py-2 text-sm font-semibold text-text hover:bg-surface-muted disabled:opacity-60" aria-label={`Join the waitlist: ${label}`}>
        {pending ? "Joining…" : "Join the waitlist"}
      </button>
      {state.error && <p role="alert" className="mt-2 text-sm font-medium text-brand-text">{state.error}</p>}
    </div>
  );
}
