// Host header -> the domain string we look up in tenant_domains.

/** Lower-cases, strips the port and any trailing dot. Returns null for anything that is not a plausible hostname. */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Host may be a comma-separated list when proxies append (x-forwarded-host); the first entry is the client-facing one.
  const first = raw.split(",")[0].trim().toLowerCase();
  const noPort = first.replace(/:\d{1,5}$/, "").replace(/\.$/, "");
  if (noPort.length === 0 || noPort.length > 253) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(noPort)) return null;
  return noPort;
}

/** Candidate domains to try, most specific first: the host itself, then without a leading "www.". */
export function hostCandidates(host: string | null): string[] {
  if (!host) return [];
  return host.startsWith("www.") ? [host, host.slice(4)] : [host];
}
