import { formatDay } from "./format.ts";

export interface RawHolder { id: string; business_id: string; business_name: string; source: string; start_at: string; end_at: string; auto_renews: boolean; upcoming: boolean }
export interface RawWait { id: string; business_id: string; business_name: string; since: string; eligible: boolean }
export interface RawSlot { slot_type: string; scope_id: string | null; scope_name: string | null; max_slots: number; used: number; holders: RawHolder[]; waitlist: RawWait[] }
export interface RawListing { id: string; business_id: string; business_name: string; source: string; ends_at: string | null; auto_renews: boolean }
export interface RawOverview { slots: RawSlot[]; listings: RawListing[] }

export const SOURCE_LABEL: Record<string, string> = { paid: "Paid", founding_member: "Comp: founding member", campaign: "Comp: campaign", manual: "Comp" };
const SLOT_TITLE: Record<string, string> = { homepage: "Home page", things_to_do: "Things to Do", category: "Category", community: "Community" };
const ORDER: Record<string, number> = { homepage: 0, things_to_do: 1, category: 2, community: 3 };
export const SOON_DAYS = 30;
const DAY = 24 * 3600 * 1000;

export interface HolderView { id: string; businessId: string; name: string; source: string; ends: string; daysLeft: number; soon: boolean; upcoming: boolean; autoRenews: boolean }
export interface WaitView { id: string; businessId: string; name: string; position: number; since: string; eligible: boolean; reason: string | null }
export interface SlotView { key: string; title: string; slot: string; scopeId: string | null; used: number; max: number; full: boolean; holders: HolderView[]; waitlist: WaitView[] }
export interface ExpiringView { kind: "Featured" | "Enhanced"; name: string; businessId: string; ends: string; daysLeft: number; autoRenews: boolean }
export interface OverviewView { slots: SlotView[]; expiring: ExpiringView[]; listings: { id: string; businessId: string; name: string; source: string; ends: string; autoRenews: boolean }[] }

export function buildOverview(raw: RawOverview, tz: string, now = new Date()): OverviewView {
  const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY));
  const slots: SlotView[] = [...raw.slots].sort((a, b) => (ORDER[a.slot_type] ?? 9) - (ORDER[b.slot_type] ?? 9) || (a.scope_name ?? "").localeCompare(b.scope_name ?? "")).map((s) => ({
    key: `${s.slot_type}:${s.scope_id ?? ""}`, slot: s.slot_type, scopeId: s.scope_id,
    title: s.scope_name ? `${SLOT_TITLE[s.slot_type] ?? s.slot_type}: ${s.scope_name}` : (SLOT_TITLE[s.slot_type] ?? s.slot_type),
    used: s.used, max: s.max_slots, full: s.used >= s.max_slots,
    holders: s.holders.map((h) => ({ id: h.id, businessId: h.business_id, name: h.business_name, source: SOURCE_LABEL[h.source] ?? h.source, ends: formatDay(h.end_at, tz), daysLeft: daysLeft(h.end_at), soon: daysLeft(h.end_at) <= SOON_DAYS && !h.upcoming, upcoming: h.upcoming, autoRenews: h.auto_renews })),
    waitlist: s.waitlist.map((w, i) => ({ id: w.id, businessId: w.business_id, name: w.business_name, position: i + 1, since: formatDay(w.since, tz), eligible: w.eligible, reason: w.eligible ? null : "Needs a verified, published business with an Enhanced listing" })),
  }));
  const expiring: ExpiringView[] = [
    ...raw.slots.flatMap((s) => s.holders.filter((h) => !h.upcoming && daysLeft(h.end_at) <= SOON_DAYS).map((h) => ({ kind: "Featured" as const, name: h.business_name, businessId: h.business_id, ends: formatDay(h.end_at, tz), daysLeft: daysLeft(h.end_at), autoRenews: h.auto_renews }))),
    ...raw.listings.filter((l) => l.ends_at && daysLeft(l.ends_at) <= SOON_DAYS).map((l) => ({ kind: "Enhanced" as const, name: l.business_name, businessId: l.business_id, ends: formatDay(l.ends_at, tz), daysLeft: daysLeft(l.ends_at!), autoRenews: l.auto_renews })),
  ].sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
  return { slots, expiring, listings: raw.listings.map((l) => ({ id: l.id, businessId: l.business_id, name: l.business_name, source: SOURCE_LABEL[l.source] ?? l.source, ends: l.ends_at ? formatDay(l.ends_at, tz) : "No end date", autoRenews: l.auto_renews })) };
}
