import type { Metadata } from "next";
import { requireArea } from "@/lib/admin/session";
import { ImportWizard } from "./ImportWizard";

export const metadata: Metadata = { title: "Import businesses" };
const TEMPLATE = "data:text/csv;charset=utf-8," + encodeURIComponent("Business name,Street address,Town,ZIP,Phone,Website,Email,Category,Description\nSample Plumbing Co,100 Main St,Thayne,83127,307-555-0100,sampleplumbing.example,hello@sampleplumbing.example,Plumbing,Family-run plumber\n");

export default async function ImportPage() {
  await requireArea("import");
  return (
    <>
      <h1 className="font-heading text-2xl font-semibold text-text">Import businesses</h1>
      <p className="mt-1 text-sm text-text-muted">Add many businesses at once from a spreadsheet. Duplicates are caught, nothing goes public automatically, and existing owner or staff edits are never overwritten. <a href={TEMPLATE} download="businesses-template.csv" className="font-medium text-link underline">Download a template</a></p>
      <div className="mt-4"><ImportWizard /></div>
    </>
  );
}
