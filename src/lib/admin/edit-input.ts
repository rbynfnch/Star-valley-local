import { isUuid } from "./detail-input.ts";

// The profile edit form. Friendly messages here; the database enforces the same rules again (update_business_fields).
export const EDIT_TEXT_FIELDS = ["name", "legal_name", "address_line1", "address_line2", "city", "postal_code", "phone", "website", "email", "short_description", "description", "hours_note"] as const;
export const LIMITS: Record<string, number> = { name: 200, legal_name: 200, address_line1: 200, address_line2: 200, city: 100, postal_code: 20, phone: 40, website: 300, email: 254, short_description: 120, description: 1500, hours_note: 300 };

type Result = { ok: true; business: string; fields: Record<string, string | null> } | { ok: false; error: string };
const str = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v : ""; };

export function parseEditInput(f: FormData): Result {
  const business = str(f, "business");
  if (!isUuid(business)) return { ok: false, error: "Unknown business." };
  const fields: Record<string, string | null> = {};
  for (const k of EDIT_TEXT_FIELDS) {
    if (!f.has(k)) continue;                                                   // only fields that were on the form
    const v = str(f, k).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
    if (v.length > LIMITS[k]) return { ok: false, error: `${k === "short_description" ? "Short description" : k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} is limited to ${LIMITS[k]} characters.` };
    fields[k] = v;
  }
  if ("name" in fields && !fields.name) return { ok: false, error: "Name cannot be empty." };
  if (fields.website && (!/^https?:\/\/[^\s]+$/i.test(fields.website))) return { ok: false, error: "Website must be a full address starting with http:// or https://." };
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return { ok: false, error: "Email does not look right." };
  for (const k of ["home_community_id", "primary_category_id"] as const) {
    if (!f.has(k)) continue;
    const v = str(f, k);
    if (v && !isUuid(v)) return { ok: false, error: "Unknown community or category." };
    fields[k] = v ? v.toLowerCase() : "";
  }
  return { ok: true, business, fields };
}
