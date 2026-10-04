// Cloudflare Turnstile server-side check (CLAUDE.md decision: captcha on public forms that send messages).
// Fail closed in production: without a secret, or when Cloudflare cannot be reached, the request is NOT allowed.
export type Fetch = typeof fetch;

export async function verifyTurnstile(token: unknown, opts: { secret?: string; ip?: string | null; isProduction: boolean; fetchImpl?: Fetch }): Promise<boolean> {
  if (!opts.secret) return !opts.isProduction;                 // local development without keys: allowed; production: refused
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
  const body = new URLSearchParams({ secret: opts.secret, response: token });
  if (opts.ip) body.set("remoteip", opts.ip);
  try {
    const res = await (opts.fetchImpl ?? fetch)("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch { return false; }
}
