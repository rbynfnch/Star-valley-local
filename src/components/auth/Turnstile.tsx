"use client";

import Script from "next/script";

/** Cloudflare Turnstile widget. Renders nothing when no site key is configured (local development). The widget adds a hidden
 *  "cf-turnstile-response" field to the surrounding form; the server verifies it. */
export function Turnstile({ siteKey }: { siteKey: string | undefined }) {
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div className="cf-turnstile" data-sitekey={siteKey} data-theme="light" />
    </>
  );
}

/** Call after a failed attempt: a Turnstile token works once. */
export function resetTurnstile() {
  try { (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset(); } catch { /* widget not loaded */ }
}
