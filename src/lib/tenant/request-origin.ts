import { headers } from "next/headers";
import { normalizeHost } from "./host.ts";
import { originFromRequest } from "./origin.ts";

/** Public origin (scheme + host) of the current request, or null when the host header is not a plausible hostname. */
export async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = normalizeHost(h.get("host")) ? h.get("host") : null;
  return originFromRequest(host, h.get("x-forwarded-proto"), process.env.NODE_ENV === "production");
}
