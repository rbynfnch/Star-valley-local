// Display helpers. Pure and timezone-explicit (a tenant has its own timezone).

export function formatEventDay(date: Date, tz: string): { month: string; day: string; weekday: string } {
  const f = (opt: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opt }).format(date);
  return { month: f({ month: "short" }).toUpperCase(), day: f({ day: "numeric" }), weekday: f({ weekday: "long" }) };
}

export function formatTimeRange(start: Date, end: Date | null, tz: string, allDay: boolean): string {
  if (allDay) return "All day";
  const t = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
  return end ? `${t(start)} – ${t(end)}` : t(start);
}

/** tel: link for a US number (10 digits, or 11 starting with 1). Null if it does not look like one. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return null;
}

/** Link-out to directions. We store no map data (CLAUDE.md §7); this only builds a URL. */
export function directionsHref(parts: { address_line1?: string | null; city?: string | null; state?: string | null; postal_code?: string | null }): string | null {
  const dest = [parts.address_line1, parts.city, parts.state, parts.postal_code].filter((p) => p && p.trim()).join(", ");
  if (!parts.address_line1 || !dest) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/** Only http(s) URLs may become links; anything else (javascript:, data:, ...) is dropped. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function websiteLabel(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
