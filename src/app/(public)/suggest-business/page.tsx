import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessForm } from "@/components/submissions/Forms";
import { getDirectoryData } from "@/lib/directory/data";
import { getTenant } from "@/lib/tenant/resolve";
import { submitBusiness } from "../submissions-actions";

export const metadata: Metadata = { title: "Suggest a business", robots: { index: false, follow: true } };

export default async function SuggestBusiness() {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const data = getDirectoryData();
  const [communities, categories] = await Promise.all([data.communities(tenant.id), data.categories(tenant.id)]);
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="font-heading text-3xl font-semibold text-text">Suggest a business</h1>
      <p className="mt-3 text-text-body">Know a local business that is not listed? Tell us about it. It does not have to be yours.</p>
      <div className="mt-6">
        <BusinessForm action={submitBusiness} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          communities={communities.map((c) => ({ id: c.id, name: c.name }))} categories={categories.filter((c) => c.parent_id !== null || !categories.some((x) => x.parent_id === c.id)).map((c) => ({ id: c.id, name: c.name }))} />
      </div>
    </main>
  );
}
