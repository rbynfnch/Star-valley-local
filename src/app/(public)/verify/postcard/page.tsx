import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parsePostcardCode } from "@/lib/claim/postcard";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant/resolve";
import { PostcardForm } from "./PostcardForm";

// A scanned QR code opens this page with the code filled in. Opening it changes nothing: the owner presses the button.
export const metadata: Metadata = { title: "Confirm your postcard", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function VerifyPostcard({ searchParams }: PageProps<"/verify/postcard">) {
  if (!(await getTenant())) notFound();
  const sp = await searchParams;
  const raw = typeof sp.c === "string" ? sp.c : "";
  const code = parsePostcardCode(raw) ?? "";
  const here = `/verify/postcard${code ? `?c=${code}` : ""}`;
  const user = authConfigured() ? (await (await createUserClient()).auth.getUser()).data.user : null;
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="font-heading text-3xl font-semibold text-text">Confirm your postcard</h1>
      <p className="mt-2 text-text-body">Enter the code from the postcard we mailed to your business. This is the extra step that earns the Gold Verified badge.</p>
      <div className="mt-6">
        {user ? (
          <><p className="mb-3 text-sm text-text-muted">Signed in as {user.email}. It must be the account that owns the business.</p><PostcardForm initial={code} /></>
        ) : (
          <div className="rounded-card bg-surface-card p-5 text-text-body shadow-card">
            <p>Sign in with the account that owns your business, then enter the code.</p>
            <p className="mt-4 flex flex-wrap gap-4">
              <Link href={`/account/sign-in?next=${encodeURIComponent(here)}`} className="rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover">Sign in</Link>
              <Link href={`/account/sign-up?next=${encodeURIComponent(here)}`} className="rounded-button border border-slate-600 px-5 py-2 font-semibold text-text">Create an account</Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
