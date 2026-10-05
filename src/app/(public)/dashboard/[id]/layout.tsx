import Link from "next/link";
import { requireOwnedBusiness } from "@/lib/owner/session";
import { DashboardTabs } from "./DashboardTabs";

export default async function BusinessLayout({ children, params }: LayoutProps<"/dashboard/[id]">) {
  const { id } = await params;
  const { business } = await requireOwnedBusiness(id, `/dashboard/${id}`);
  return (
    <>
      <p className="text-sm"><Link href="/dashboard" className="text-link underline">← All your businesses</Link></p>
      <h1 className="mt-2 font-heading text-3xl font-bold text-text [overflow-wrap:anywhere]">{business.name}</h1>
      <DashboardTabs id={id} newLeads={business.new_leads} slug={business.slug} />
      <div className="mt-6">{children}</div>
    </>
  );
}
