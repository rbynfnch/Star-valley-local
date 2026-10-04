import type { Product, Scarcity, ScarcityScope } from "../directory/types.ts";

export const dollars = (cents: number): string => {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d.toLocaleString("en-US") : d.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const priceLabel = (p: Pick<Product, "amount_cents" | "interval">): string => `${dollars(p.amount_cents)}${p.interval === "month" ? "/mo" : p.interval === "year" ? "/yr" : ""}`;

/** "2 of 3 spots left", "1 spot left", or "Full". */
export function remainingText(max: number, used: number): { text: string; remaining: number; full: boolean } {
  const remaining = Math.max(max - used, 0);
  return { remaining, full: remaining === 0, text: remaining === 0 ? "Full" : remaining === max ? `${max} of ${max} spots open` : `${remaining} of ${max} ${remaining === 1 ? "spot" : "spots"} left` };
}

/**
 * A Stripe Payment Link with the business id attached as client_reference_id, so a payment can be matched to the business.
 * Only https links are accepted (the database enforces it too); anything else yields null.
 */
export function paymentLink(url: string | null | undefined, businessId?: string | null, email?: string | null): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:") return null;
  if (businessId && /^[0-9a-f-]{36}$/i.test(businessId)) u.searchParams.set("client_reference_id", businessId);
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254) u.searchParams.set("prefilled_email", email);
  return u.toString();
}

export const productFor = (products: Product[], kind: Product["kind"], slot?: Product["slot_type"]): Product | undefined =>
  products.find((p) => p.kind === kind && (kind === "listing" || p.slot_type === slot));

export type ScopeRow = ScarcityScope & { text: string; remaining: number; full: boolean };
export const scopeRows = (list: ScarcityScope[]): ScopeRow[] => list.map((c) => ({ ...c, ...remainingText(c.max, c.used) }));
export const totalSpots = (s: Scarcity) => ({ homepage: remainingText(s.homepage.max, s.homepage.used), things_to_do: remainingText(s.things_to_do.max, s.things_to_do.used) });
