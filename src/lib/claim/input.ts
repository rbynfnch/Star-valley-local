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
