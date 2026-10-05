import { timingSafeEqual, createHash } from "node:crypto";

// Constant-time comparison of secrets of any length (hash both so lengths never leak).
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
/** `Authorization: Bearer <secret>`. Fails closed when no secret is configured. */
export function bearerOk(header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  const m = /^Bearer (.+)$/.exec(header ?? "");
  return !!m && safeEqual(m[1], secret);
}
/** HTTP Basic credentials. Fails closed when either is not configured. */
export function basicOk(header: string | null | undefined, user: string | undefined, password: string | undefined): boolean {
  if (!user || !password || password.length < 12) return false;
  const m = /^Basic (.+)$/.exec(header ?? "");
  if (!m) return false;
  let decoded = "";
  try { decoded = Buffer.from(m[1], "base64").toString("utf8"); } catch { return false; }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  const okUser = safeEqual(decoded.slice(0, i), user), okPass = safeEqual(decoded.slice(i + 1), password);
  return okUser && okPass;
}
