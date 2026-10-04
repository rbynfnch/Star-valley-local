import { zonedToUtc } from "../events/recurrence.ts";
import { isUuid } from "./detail-input.ts";

// Parse the admin "activate / extend" forms. The database enforces every rule again (activate_listing / activate_placement).
export const SOURCES = ["paid", "founding_member", "campaign", "manual"] as const;
export const SLOTS = ["homepage", "category", "community", "things_to_do"] as const;
export type Source = (typeof SOURCES)[number];
export type Slot = (typeof SLOTS)[number];
type Res<T> = { ok: true; value: T } | { ok: false; error: string };
const str = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v : ""; };

/** "19", "19.00", "$1,900.50" -> cents. Max 2 decimals, positive, at most $10,000. */
export function dollarsToCents(input: string): number | null {
  const t = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents > 0 && cents <= 1_000_000 ? cents : null;
}

export type Term = { months: number } | { endsAt: string };
function term(f: FormData, tz: string, now: Date): Res<Term> {
  if (str(f, "term") === "date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(f, "end_date"));
    if (!m) return { ok: false, error: "Choose an end date." };
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const chk = new Date(Date.UTC(y, mo - 1, d)); if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return { ok: false, error: "That is not a real date." };
    const next = new Date(Date.UTC(y, mo - 1, d + 1));                       // "through" the chosen day: ends when the next day starts, tenant time
    const end = zonedToUtc({ y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate(), h: 0, mi: 0 }, tz);
    if (end.getTime() <= now.getTime()) return { ok: false, error: "The end date must be in the future." };
    if (end.getTime() > now.getTime() + 3 * 366 * 24 * 3600 * 1000) return { ok: false, error: "The end date can be at most 3 years away." };
    return { ok: true, value: { endsAt: end.toISOString() } };
  }
  const n = Number(str(f, "months"));
  if (!Number.isInteger(n) || n < 1 || n > 36) return { ok: false, error: "Choose a number of months from 1 to 36." };
  return { ok: true, value: { months: n } };
}
function money(f: FormData): Res<{ source: Source; amountCents: number | null }> {
  const source = (SOURCES as readonly string[]).includes(str(f, "source")) ? (str(f, "source") as Source) : null;
  if (!source) return { ok: false, error: "Choose paid or a comp type." };
  if (source !== "paid") return { ok: true, value: { source, amountCents: null } };    // a comp carries no payment, whatever was typed
  const cents = dollarsToCents(str(f, "amount"));
  return cents ? { ok: true, value: { source, amountCents: cents } } : { ok: false, error: "Enter the amount paid, like 19 or 49.00." };
}
const common = (f: FormData) => {
  const p = str(f, "product").trim();
  return { product: /^[a-z0-9_]{1,50}$/.test(p) ? p : null, autoRenews: str(f, "auto_renews") === "yes", notes: str(f, "notes").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, 500) || null };
};

export type ListingInput = { business: string; term: Term; source: Source; amountCents: number | null; product: string | null; autoRenews: boolean; notes: string | null };
export function parseActivateListing(f: FormData, tz: string, now = new Date()): Res<ListingInput> {
  const business = str(f, "business"); if (!isUuid(business)) return { ok: false, error: "Unknown business." };
  const t = term(f, tz, now); if (!t.ok) return t;
  const m = money(f); if (!m.ok) return m;
  return { ok: true, value: { business, term: t.value, ...m.value, ...common(f) } };
}

export type PlacementInput = ListingInput & { slot: Slot; scope: string | null; waitlistId: string | null };
export function parseActivatePlacement(f: FormData, tz: string, now = new Date()): Res<PlacementInput> {
  const waitlistId = str(f, "waitlist_id");
  if (waitlistId && !isUuid(waitlistId)) return { ok: false, error: "Unknown waitlist entry." };
  const business = str(f, "business");
  if (!waitlistId && !isUuid(business)) return { ok: false, error: "Unknown business." };
  const slot = (SLOTS as readonly string[]).includes(str(f, "slot")) ? (str(f, "slot") as Slot) : null;
  if (!waitlistId && !slot) return { ok: false, error: "Choose where it will appear." };
  const scopeRaw = str(f, "scope");
  if (scopeRaw && !isUuid(scopeRaw)) return { ok: false, error: "Choose a category or community from the list." };
  const scope = slot === "category" || slot === "community" ? (scopeRaw || null) : null;
  if (!waitlistId && (slot === "category" || slot === "community") && !scope) return { ok: false, error: `Choose a ${slot}.` };
  const t = term(f, tz, now); if (!t.ok) return t;
  const m = money(f); if (!m.ok) return m;
  return { ok: true, value: { business: business || "", slot: slot ?? "homepage", scope: scope ? scopeRaw.toLowerCase() : null, waitlistId: waitlistId || null, term: t.value, ...m.value, ...common(f) } };
}
