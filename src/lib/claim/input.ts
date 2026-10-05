// Pure helpers for the public claim flow. The database enforces every rule again (claim_start / claim_verify).
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const parseSlug = (v: unknown): string | null => (typeof v === "string" && v.length <= 120 && SLUG.test(v) ? v : null);

/** "123 456", "123-456" and " 123456 " are all fine; anything else is not a code. */
export function parseCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(d) ? d : null;
}

/** "(•••) •••-0601": shows only the last four digits, so the page never helps someone else read the number. */
export function maskPhone(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `(•••) •••-${d.slice(-4)}` : null;
}

export function smsBody(tenantName: string, businessName: string, code: string): string {
  const name = businessName.length > 40 ? businessName.slice(0, 39).trimEnd() + "…" : businessName;
  return `${tenantName}: your code to claim ${name} is ${code}. It expires in 10 minutes. If you did not ask for this, ignore this message.`;
}

export type VerifyResult = { result: string; attempts_left?: number; level?: string };
/** Plain-language outcome for claim_verify. `done` = stop asking for a code. */
export function verifyMessage(r: VerifyResult): { done: boolean; ok: boolean; text: string } {
  switch (r.result) {
    case "verified": return { done: true, ok: true, text: "You're verified." };
    case "wrong": return { done: false, ok: false, text: `That code is not right. ${r.attempts_left ?? 0} ${r.attempts_left === 1 ? "try" : "tries"} left.` };
    case "expired": return { done: true, ok: false, text: "That code has expired. Ask for a new one." };
    case "rejected": return { done: true, ok: false, text: "Too many wrong codes. Ask for a new code in a little while." };
    case "already_claimed":
    case "cancelled": return { done: true, ok: false, text: "This business was just claimed by someone else, or a newer code replaced this one." };
    default: return { done: true, ok: false, text: "That did not work. Ask for a new code." };
  }
}

/** The one-time token in an emailed claim link: 64 lowercase hex characters, nothing else ever reaches the database. */
export const parseToken = (v: unknown): string | null => (typeof v === "string" && /^[0-9a-f]{64}$/.test(v) ? v : null);
export const parseClaimMethod = (v: unknown): "sms_code" | "email_link" => (v === "email_link" ? "email_link" : "sms_code");

/** What claim_options hands the page: masked hints only. */
export interface ClaimOptions { phone_last4: string | null; email_hint: string | null }
export const maskPhoneLast4 = (last4: string | null | undefined): string | null => (typeof last4 === "string" && /^\d{4}$/.test(last4) ? `(•••) •••-${last4}` : null);
export const safeHint = (v: unknown): string | null => (typeof v === "string" && /^[^\s@]•••@[^\s@]+$/.test(v) && v.length <= 120 ? v : null);

/** "a•••@alpha.example" -> shown as is; used in "we emailed a link to …". */
export function emailLinkMessage(r: VerifyResult): { done: boolean; ok: boolean; text: string } {
  switch (r.result) {
    case "verified": return { done: true, ok: true, text: "You're verified." };
    case "expired": return { done: true, ok: false, text: "That link has expired. Go back to the business page and ask for a new one." };
    case "rejected": return { done: true, ok: false, text: "That link cannot be used any more. Ask for a new one in a little while." };
    case "already_claimed":
    case "cancelled": return { done: true, ok: false, text: "This business was just claimed by someone else, or a newer link replaced this one. Ask for a new link if you still need one." };
    default: return { done: true, ok: false, text: "That link did not work. Ask for a new one." };
  }
}

/** Text message carrying a staff-issued claim link. A verification message (transactional), never marketing. */
export function inviteSmsBody(tenantName: string, businessName: string, link: string, days: number): string {
  const name = businessName.length > 40 ? businessName.slice(0, 39).trimEnd() + "…" : businessName;
  return `${tenantName}: confirm you manage ${name}: ${link} (valid ${days} days). Not you? Ignore this.`;
}
