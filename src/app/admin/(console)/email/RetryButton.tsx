"use client";

import { useState, useTransition } from "react";
import { retryEmail, type RetryState } from "./actions";

export function RetryButton({ id }: { id: string }) {
  const [state, setState] = useState<RetryState>({});
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} className="rounded-button border border-slate-600 px-3 py-1.5 text-sm font-semibold text-text disabled:opacity-60"
        onClick={() => start(async () => { const fd = new FormData(); fd.set("id", id); try { setState(await retryEmail(fd)); } catch { setState({ error: "That could not be retried. Reload the page and try again." }); } })}>
        {pending ? "Retrying…" : "Retry"}
      </button>
      {state.error && <p role="alert" className="text-sm font-medium text-danger-text">{state.error}</p>}
      {state.message && <p role="status" className="text-sm font-medium text-green-800">{state.message}</p>}
    </div>
  );
}
