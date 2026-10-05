import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/admin/detail-input";
import { parseToken } from "@/lib/claim/input";
import { createServiceClient } from "@/lib/supabase/service";
import { authConfigured, createUserClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant/resolve";
import { signOutAction } from "../../account/actions";
import { ConfirmForm } from "./ConfirmForm";

// The link carries a one-time secret: keep it out of search results and out of Referer headers.
export const metadata: Metadata = { title: "Confirm your business", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Preview = { business_name: string; slug: string; status: string; method: string; expired: boolean };
const Box = ({ children }: { children: React.ReactNode }) => <div className="rounded-card bg-surface-card p-5 text-text-body shadow-card">{children}</div>;

export default async function ConfirmClaim({ searchParams }: PageProps<"/list-your-business/confirm">) {
  const sp = await searchParams;
  const tenant = await getTenant();
  if (!tenant) notFound();
  const claim = typeof sp.c === "string" ? sp.c : "", token = parseToken(sp.t);
  const here = `/list-your-business/confirm?c=${encodeURIComponent(claim)}&t=${encodeURIComponent(typeof sp.t === "string" ? sp.t : "")}`;
  const user = authConfigured() ? (await (await createUserClient()).auth.getUser()).data.user : null;

  let body: React.ReactNode;
  if (!isUuid(claim) || !token) {
    body = <Box>That link is not valid. Go to the business&apos;s page and choose &ldquo;Claim this business&rdquo; to ask for a new one.</Box>;
  } else if (!user) {
    body = (
      <Box>
        <p>Sign in with the account you used to ask for this link. It only works for that account.</p>
        <p className="mt-4 flex flex-wrap gap-4">
          <Link href={`/account/sign-in?next=${encodeURIComponent(here)}`} className="rounded-button bg-brand px-5 py-2 font-semibold text-brand-contrast hover:bg-brand-hover">Sign in</Link>
          <Link href={`/account/sign-up?next=${encodeURIComponent(here)}`} className="rounded-button border border-slate-600 px-5 py-2 font-semibold text-text">Create an account</Link>
        </p>
      </Box>
    );
  } else {
    const { data } = await createServiceClient().rpc("claim_preview", { p_claim: claim, p_user: user.id });
    const pv = data as Preview | null;
    if (!pv || pv.method !== "email_link") {
      body = (
        <Box>
          <p>This link is not for the account you are signed in with ({user.email}), or it is no longer valid.</p>
          <form action={signOutAction} className="mt-4"><button className="font-semibold text-link underline">Sign out and try another account</button></form>
        </Box>
      );
    } else if (pv.status === "verified") {
      body = <Box><p><strong className="[overflow-wrap:anywhere]">{pv.business_name}</strong> is already verified.</p><p className="mt-3"><Link href={`/business/${pv.slug}`} className="font-semibold text-link underline">View the listing</Link></p></Box>;
    } else if (pv.status !== "pending" || pv.expired) {
      body = <Box><p>That link has expired or was replaced by a newer one.</p><p className="mt-3"><Link href={`/list-your-business?claim=${encodeURIComponent(pv.slug)}`} className="font-semibold text-link underline">Ask for a new link</Link></p></Box>;
    } else {
      body = <><p className="mb-3 text-sm text-text-muted">Signed in as {user.email}.</p><ConfirmForm claim={claim} token={token} businessName={pv.business_name} /></>;
    }
  }
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="font-heading text-3xl font-semibold text-text">Confirm your business</h1>
      <div className="mt-6">{body}</div>
    </main>
  );
}
