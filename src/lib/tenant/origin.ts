/** Public origin of this request (scheme + host), for canonical URLs and JSON-LD. Multi-tenant: derived per request. */
export function originFromRequest(host: string | null, forwardedProto: string | null, isProduction: boolean): string | null {
  if (!host) return null;
  const proto = forwardedProto?.split(",")[0].trim().toLowerCase();
  const scheme = proto === "http" || proto === "https" ? proto : isProduction ? "https" : "http";
  return `${scheme}://${host}`;
}
