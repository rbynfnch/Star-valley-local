import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { signInAction } from "../actions";
import { nextAfterAuth } from "@/lib/account-next";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: PageProps<"/account/sign-in">) {
  const sp = await searchParams;
  const next = nextAfterAuth(typeof sp.next === "string" ? sp.next : undefined);
  return (
    <main id="main" className="mx-auto w-full max-w-sm flex-1 px-4 py-12">
      <h1 className="font-heading text-2xl font-semibold text-text">Sign in</h1>
      <p className="mt-1 text-sm text-text-muted">One account for your business listing and saved places.</p>
      <div className="mt-6"><AuthForm mode="sign-in" next={next} action={signInAction} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} /></div>
    </main>
  );
}
