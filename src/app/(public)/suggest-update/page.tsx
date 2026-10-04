import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UpdateForm } from "@/components/submissions/Forms";
import { getDirectoryData } from "@/lib/directory/data";
import { parseSlug } from "@/lib/claim/input";
import { getTenant } from "@/lib/tenant/resolve";
import { submitUpdate } from "../submissions-actions";

export const metadata: Metadata = { title: "Suggest an update", robots: { index: false, follow: true } };

export default async function SuggestUpdate({ searchParams }: PageProps<"/suggest-update">) {
  const sp = await searchParams;
  const tenant = await getTenant();
  const slug = parseSlug(typeof sp.business === "string" ? sp.business : undefined);
  if (!tenant || !slug) notFound();
  const raw = await getDirectoryData().businessProfile(tenant.id, slug);
  if (!raw) notFound();
  const b = raw.business;
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <p className="text-sm"><Link href={`/business/${slug}`} className="text-link underline">← {b.name}</Link></p>
      <h1 className="mt-2 font-heading text-3xl font-semibold text-text [overflow-wrap:anywhere]">Suggest an update for {b.name}</h1>
      <div className="mt-6">
        <UpdateForm action={submitUpdate} slug={slug} businessName={b.name} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          current={{ phone: b.phone, website: b.website, address: [b.address_line1, b.city].filter(Boolean).join(", ") || null }} />
      </div>
    </main>
  );
}
