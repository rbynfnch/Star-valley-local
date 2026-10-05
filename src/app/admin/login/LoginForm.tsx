"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const input = "mt-1 block w-full rounded-button border border-slate-600 bg-surface-card px-3 py-2 text-text focus:outline-2 focus:outline-offset-2 focus:outline-brand";
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-text">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className={input} />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-text">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={input} />
      </div>
      {state.error && <p role="alert" className="text-sm font-medium text-danger-text">{state.error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-button bg-brand px-4 py-2 font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
