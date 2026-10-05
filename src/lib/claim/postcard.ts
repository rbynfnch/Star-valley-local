// Pure helpers for the postcard redemption page.
/** A printed code: 10 letters/digits, grouped or lower-case or hyphenated. Returns the 10 characters, or null. */
export function parsePostcardCode(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 40) return null;
  const s = v.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-HJKMNP-Z2-9]{10}$/.test(s) ? s : null;
}
export type PostcardResult = { result: string; slug?: string; name?: string; level?: string };
export function postcardMessage(r: PostcardResult): { ok: boolean; text: string } {
  switch (r.result) {
    case "verified": return { ok: true, text: r.level === "gold" ? "You are Gold Verified." : "Your postcard is confirmed." };
    case "already": return { ok: true, text: "That code was already used. Your listing is verified." };
    case "expired": return { ok: false, text: "That code has expired (codes last 90 days). Ask us for a new postcard." };
    case "not_verified": return { ok: false, text: "Verify your listing first (by text message or email link); the postcard is the second step." };
    default: return { ok: false, text: "That code did not work. Check it against the postcard and make sure you are signed in to the account that owns the business." };
  }
}
