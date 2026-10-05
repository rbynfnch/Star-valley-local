"use client";

import { startTransition, useActionState } from "react";
import { changeStatus } from "./edit/actions";
import type { EditState } from "./edit/actions";

const COPY: Record<string, { to: string; button: string; hint: string }> = {
  prospect: { to: "unclaimed", button: "Publish", hint: "Makes this business visible on the public site. It needs a community and a category." },
  unclaimed: { to: "archived", button: "Archive", hint: "Removes it from the public site. Not possible while it has a paid listing or placement." },
  claimed: { to: "archived", button: "Archive", hint: "Removes it from the public site. Not possible while it has a paid listing or placement." },
  archived: { to: "prospect", button: "Restore as prospect", hint: "Brings it back as a hidden prospect." },
};

export function StatusForm({ business, status }: { business: string; status: string }) {
  const [state, dispatch, pending] = useActionState<EditState, FormData>(changeStatus, {});
  const c = COPY[status];
  if (!c) return null;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => dispatch(fd)); }} className="space-y-2">
      <input type="hidden" name="business" value={business} />
      <input type="hidden" name="status" value={c.to} />
      <button type="submit" disabled={pending} className="rounded-button border border-slate-600 px-3 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted disabled:opacity-60">{pending ? "Working…" : c.button}</button>
      <p className="text-xs text-text-muted">{c.hint}</p>
      {state.error && <p role="alert" className="text-sm font-medium text-danger-text">{state.error}</p>}
      {state.saved && <p role="status" className="text-sm font-medium text-green-800">{state.saved}</p>}
    </form>
  );
}
