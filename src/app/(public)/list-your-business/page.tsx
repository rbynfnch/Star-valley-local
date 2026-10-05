import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDirectoryData } from "@/lib/directory/data";
import { maskPhoneLast4, parseSlug, safeHint, type ClaimOptions } from "@/lib/claim/input";
import { createServiceClient } from "@/lib/supabase/service";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant/resolve";
import { ClaimForm } from "./ClaimForm";
import { signOutAction } from "../account/actions";

export const metadata: Metadata = { title: "Claim your business", robots: { index: false, follow: true } };

export default async function ListYourBusiness({ searchParams }: PageProps<"/list-your-business">) {
  const sp = await searchParams;
  const tenant = await getTenant();
  if (!tenant) notFound();
  const wanted = typeof sp.claim === "string" ? sp.claim : undefined;

  if (wanted === undefined) {
    return (
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
        <h1 className="font-heading text-3xl font-semibold text-text">Claim your business</h1>
        <p className="mt-3 text-text-body">Most local businesses are already listed. Find yours, then choose &ldquo;Claim this business&rdquo; on its page to verify that it&apos;s yours and keep your information accurate.</p>
        <p className="mt-6"><Link href="/businesses" className="font-semibold text-link underline">Find your business</Link></p>
        <p className="mt-3 text-text-body">Cannot find it? <Link href="/suggest-business" className="font-semibold text-link underline">Suggest a business</Link>.</p>
      </main>
    );
  }
  const slug = parseSlug(wanted);
  const raw = slug ? await getDirectoryData().businessProfile(tenant.id, slug) : null;
  if (!slug || !raw) notFound();
  const b = raw.business;

  const user = authConfigured() ? (await (await createUserClient()).auth.getUser()).data.user : null;
  const here = `/list-your-business?claim=${encodeURIComponent(slug)}`;
  // What can be offered is read with the service role (a listing's email is not public on Free listings) and arrives masked.
  let opts: ClaimOptions | null = null;
  if (b.status === "unclaimed") {
    try { const { data } = await createServiceClient().rpc("claim_options", { p_tenant: tenant.id, p_business: b.id }); opts = (data as ClaimOptions | null) ?? null; } catch { opts = null; }
  }
  const masked = maskPhoneLast4(opts?.phone_last4), emailHint = safeHint(opts?.email_hint);

  let body: React.ReactNode;
  if (b.status !== "unclaimed") {
    body = <p className="rounded-card bg-surface-card p-5 text-text-body shadow-card">This business has already been claimed. <Link href={`/business/${slug}`} className="font-semibold text-link underline">Back to the listing</Link></p>;
  } else if (!masked && !emailHint) {
    body = <p className="rounded-card bg-surface-card p-5 text-text-body shadow-card">We can&apos;t verify this business online yet because there&apos;s no phone number or email address on its listing. <Link href={`/business/${slug}`} className="font-semibold text-link underline">Back to the listing</Link></p>;
  } else if (!user) {
    body = (
      <div className="rounded-card bg-surface-card p-5 shadow-card">
        <p className="text-text-body">Sign in or create a free account first. It takes a minute, and it&apos;s how we link the listing to you.</p>
        <p className="mt-4 flex flex-wrap gap-4">
          <Link href={`/account/sign-in?next=${encodeURIComponent(here)}`} className="rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover">Sign in</Link>
          <Link href={`/account/sign-up?next=${encodeURIComponent(here)}`} className="rounded-button border border-slate-600 px-5 py-2 font-semibold text-text">Create an account</Link>
        </p>
      </div>
    );
  } else {
    body = (
      <>
        <p className="mb-3 text-sm text-text-muted">Signed in as {user.email}. <form action={signOutAction} className="inline"><button className="font-medium text-link underline">Not you?</button></form></p>
        <ClaimForm slug={slug} businessName={b.name} maskedPhone={masked} emailHint={emailHint} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
      </>
    );
  }
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <p className="text-sm"><Link href={`/business/${slug}`} className="text-link underline">← {b.name}</Link></p>
      <h1 className="mt-2 font-heading text-3xl font-semibold text-text [overflow-wrap:anywhere]">Claim {b.name}</h1>
      <div className="mt-6">{body}</div>
    </main>
  );
}
