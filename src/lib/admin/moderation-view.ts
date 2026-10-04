import { formatDay, formatStamp } from "./format.ts";
import type { StaffRole } from "./access.ts";

export type Kind = "update" | "business" | "event";
export interface SubRow {
  id: string; kind: Kind; status: string; payload: Record<string, unknown>; submitter_name: string | null; submitter_email: string | null; submitter_phone: string | null;
  created_at: string; reviewed_at: string | null; resolution_notes: string | null; business_id: string | null; business_name: string | null; business_slug: string | null;
}
export interface Detail { label: string; value: string }
export interface CardView {
  id: string; kind: Kind; kindLabel: string; status: string; when: string; who: string;
  businessName: string | null; businessHref: string | null; details: Detail[]; note: string | null; closed: boolean;
  /** What this staff role may do with a pending submission. */
  canApprove: boolean; canApply: boolean; approveBlockedReason: string | null;
  applicableFields: string[]; reviewed: string | null; resolutionNotes: string | null;
}

export const KIND_LABEL: Record<Kind, string> = { update: "Suggested update", business: "Suggested business", event: "Submitted event" };
const FIELD_LABEL: Record<string, string> = { name: "Name", address_line1: "Street address", city: "City or town", phone: "Phone", website: "Website", hours: "Hours" };
const APPLICABLE = ["name", "address_line1", "city", "phone", "website"];    // hours are free text: never auto-applied

/** Who may approve what (the database enforces the same rules): sales and admin create/edit businesses; editors and admin publish events. */
export function permissions(role: StaffRole, kind: Kind): { canApprove: boolean; canApply: boolean; blocked: string | null } {
  const sales = role === "admin" || role === "sales", editor = role === "admin" || role === "editor";
  if (kind === "update") return { canApprove: true, canApply: sales, blocked: null };
  if (kind === "business") return { canApprove: sales, canApply: false, blocked: sales ? null : "Only sales staff and admins can add a business." };
  return { canApprove: editor, canApply: false, blocked: editor ? null : "Only editors and admins can publish an event." };
}

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const add = (d: Detail[], label: string, v: unknown) => { const t = s(v); if (t) d.push({ label, value: t }); };

export function buildCard(r: SubRow, role: StaffRole, tz: string): CardView {
  const p = r.payload ?? {};
  const details: Detail[] = []; let applicable: string[] = [];
  if (r.kind === "update") {
    const f = (p.fields ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(FIELD_LABEL)) add(details, FIELD_LABEL[k], f[k]);
    applicable = APPLICABLE.filter((k) => s(f[k]));
  } else if (r.kind === "business") {
    add(details, "Name", p.name); add(details, "Category (their words)", p.category_text); add(details, "Street address", p.address_line1); add(details, "City or town", p.city);
    add(details, "Phone", p.phone); add(details, "Website", p.website); add(details, "About", p.description);
  } else {
    add(details, "Event", p.title); add(details, "About", p.description);
    const start = s(p.starts_at), end = s(p.ends_at), allDay = p.all_day === true;
    if (start) details.push({ label: "Starts", value: allDay ? `${formatDay(start, tz)} (all day)` : formatStamp(start, tz) });
    if (end) details.push({ label: "Ends", value: allDay ? formatDay(end, tz) : formatStamp(end, tz) });
    add(details, "Where", p.venue_name); add(details, "Address", p.address); add(details, "Link", p.url); add(details, "Organizer", p.organizer);
  }
  const perm = permissions(role, r.kind);
  const who = [r.submitter_name, r.submitter_email, r.submitter_phone].filter(Boolean).join(" · ") || "Anonymous";
  return {
    id: r.id, kind: r.kind, kindLabel: KIND_LABEL[r.kind], status: r.status, when: formatStamp(r.created_at, tz), who,
    businessName: r.business_name, businessHref: r.business_id ? `/admin/businesses/${r.business_id}` : null, details, note: s(p.note), closed: p.closed === true,
    canApprove: perm.canApprove, canApply: perm.canApply && applicable.length > 0, approveBlockedReason: perm.blocked, applicableFields: applicable.map((k) => FIELD_LABEL[k]),
    reviewed: r.reviewed_at ? formatStamp(r.reviewed_at, tz) : null, resolutionNotes: r.resolution_notes,
  };
}
