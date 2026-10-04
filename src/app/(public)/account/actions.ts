"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { nextAfterAuth } from "@/lib/account-next";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

export interface AuthState { error?: string; notice?: string }

const clientIp = async () => ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
const text = (f: FormData, k: string, max: number) => { const v = f.get(k); return typeof v === "string" ? v.slice(0, max) : ""; };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!authConfigured()) return { error: "Sign-in is not available right now." };
  const email = text(form, "email", 254).trim(), password = text(form, "password", 200);
  if (!EMAIL.test(email) || !password) return { error: "Enter your email and password." };
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password did not match." };   // same message for every failure
  redirect(nextAfterAuth(form.get("next")));
}

export async function signUpAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!authConfigured()) return { error: "Sign-up is not available right now." };
  const email = text(form, "email", 254).trim(), password = text(form, "password", 200);
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 10) return { error: "Use a password of at least 10 characters." };
  const human = await verifyTurnstile(form.get("cf-turnstile-response"), { secret: process.env.TURNSTILE_SECRET_KEY, ip: await clientIp(), isProduction: process.env.NODE_ENV === "production" });
  if (!human) return { error: "We could not confirm you are human. Reload the page and try again." };
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: "We could not create that account. Try a different password, or sign in if you already have one." };
  if (data.session) redirect(nextAfterAuth(form.get("next")));
  // Confirmation required. Same message whether or not the address already had an account.
  return { notice: "Check your email for a confirmation link, then come back and sign in." };
}

export async function signOutAction() {
  if (authConfigured()) { const supabase = await createUserClient(); await supabase.auth.signOut(); }
  redirect("/");
}
