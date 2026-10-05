"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { redeemPostcard, type PostcardState } from "./actions";

export function PostcardForm({ initial }: { initial: string }) {
  const [state, setState] = useState<PostcardState>({});
  const [pending, start] = useTransition();
  if (state.ok) {
    return (
      <div role="status" className="space-y-3 rounded-card bg-surface-card p-5 shadow-card">
        <h2 className="font-heading text-xl font-semibold text-text">{state.message}</h2>
        {state.slug && <p><Link href={`/business/${state.slug}`} className="font-semibold text-link underline">View your listing</Link></p>}
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { try { setState(await redeemPostcard(state, fd)); } catch { setState({ message: "That did not work. Try again in a minute." }); } }); }} className="space-y-4 rounded-card bg-surface-card p-5 shadow-card" noValidate>
      <div>
        <label htmlFor="pc-code" className="block text-sm font-medium text-text">Code from your postcard</label>
        <input id="pc-code" name="code" defaultValue={initial} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={40} required className="mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-3 py-2 font-mono text-lg tracking-widest text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand" />
      </div>
      <div aria-live="polite">{state.message && <p role="alert" className="text-sm font-medium text-danger-text">{state.message}</p>}</div>
      <button type="submit" disabled={pending} className="rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60">{pending ? "Checking…" : "Confirm my postcard"}</button>
    </form>
  );
}
