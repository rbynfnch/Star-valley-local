import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/submissions/Forms";
import { getDirectoryData } from "@/lib/directory/data";
import { getTenant } from "@/lib/tenant/resolve";
import { submitEvent } from "../submissions-actions";

export const metadata: Metadata = { title: "Submit an event", robots: { index: false, follow: true } };

export default async function SubmitEvent() {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const communities = await getDirectoryData().communities(tenant.id);
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="font-heading text-3xl font-semibold text-text">Submit an event</h1>
      <p className="mt-3 text-text-body">Hosting something in Star Valley? Send it to us and we will add it to the events calendar after a quick review.</p>
      <div className="mt-6"><EventForm action={submitEvent} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} communities={communities.map((c) => ({ id: c.id, name: c.name }))} /></div>
    </main>
  );
}
