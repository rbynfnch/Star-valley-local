"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/admin/access";
import { authConfigured, createUserClient } from "@/lib/supabase/server";

export interface LoginState { error?: string }

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!authConfigured()) return { error: "Sign-in is not configured on this server." };
  const email = String(form.get("email") ?? "").trim().slice(0, 254);
  const password = String(form.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { error: "Enter your email and password." };
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // One message for every failure: never reveal whether an account exists.
  if (error) return { error: "That email and password did not match." };
  redirect(safeNextPath(String(form.get("next") ?? "")));
}

export async function signOut() {
  if (authConfigured()) { const supabase = await createUserClient(); await supabase.auth.signOut(); }
  redirect("/admin/login");
}
