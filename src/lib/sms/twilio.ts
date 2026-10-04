// Sends one-time verification codes (transactional only; CLAUDE.md §11: no marketing SMS). Plain REST, no SDK.
export interface SmsConfig { accountSid: string; authToken: string; from: string; apiBase: string }
export type Fetch = typeof fetch;

export class SmsError extends Error {
  readonly status: number;
  constructor(status: number) { super(`SMS provider returned ${status}`); this.status = status; }
}

/** Config from env, or null when Twilio is not configured. TWILIO_API_BASE exists only so tests can point at a mock. */
export function smsConfigFromEnv(env: Record<string, string | undefined> = process.env): SmsConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID, authToken = env.TWILIO_AUTH_TOKEN, from = env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) return null;
  const apiBase = env.NODE_ENV === "production" ? "https://api.twilio.com" : (env.TWILIO_API_BASE || "https://api.twilio.com");
  return { accountSid, authToken, from, apiBase };
}

/** E.164 only: a "+" and 8 to 15 digits. The number comes from our own database, but never send to anything else. */
export const isE164 = (s: string) => /^\+[1-9]\d{7,14}$/.test(s);

export async function sendSms(cfg: SmsConfig, to: string, body: string, fetchImpl: Fetch = fetch): Promise<void> {
  if (!isE164(to)) throw new SmsError(400);
  const res = await fetchImpl(`${cfg.apiBase}/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: cfg.from, Body: body }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new SmsError(res.status);   // never include the response body: it can echo the number or credentials
}
