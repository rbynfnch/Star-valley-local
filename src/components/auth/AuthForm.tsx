"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect } from "react";
import { resetTurnstile, Turnstile } from "./Turnstile";

type State = { error?: string; notice?: string };
const field = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-3 py-2 text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";

export function AuthForm({ mode, next, action, siteKey }: { mode: "sign-in" | "sign-up"; next: string; action: (prev: State, form: FormData) => Promise<State>; siteKey?: string }) {
  const [state, dispatch, pending] = useActionState<State, FormData>(action, {});
  useEffect(() => { if (state.error) resetTurnstile(); }, [state]);
  const other = mode === "sign-in" ? "/account/sign-up" : "/account/sign-in";
  const q = `?next=${encodeURIComponent(next)}`;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => dispatch(fd)); }} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-text">Email</label>
        <input id="email" name="email" type="email" autoComplete={mode === "sign-in" ? "username" : "email"} required className={field} />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-text">Password{mode === "sign-up" ? " (at least 10 characters)" : ""}</label>
        <input id="password" name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={mode === "sign-up" ? 10 : undefined} required className={field} />
      </div>
      {mode === "sign-up" && <Turnstile siteKey={siteKey} />}
      {state.error && <p role="alert" className="text-sm font-medium text-danger-text">{state.error}</p>}
      {state.notice && <p role="status" className="text-sm font-medium text-text">{state.notice}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-button bg-brand px-4 py-2 font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60">
        {pending ? "One moment…" : mode === "sign-in" ? "Sign in" : "Create account"}
      </button>
      <p className="text-sm text-text-muted">
        {mode === "sign-in" ? "New here? " : "Already have an account? "}
        <Link href={`${other}${q}`} className="font-medium text-link underline">{mode === "sign-in" ? "Create an account" : "Sign in"}</Link>
      </p>
    </form>
  );
}
