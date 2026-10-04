// schema.org JSON-LD. The string is embedded in a <script> tag, so characters that could close the tag or start a
// comment are escaped; the result is still valid JSON.

export function jsonLdString(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export function websiteJsonLd(o: { name: string; url: string; description?: string | null; searchUrlTemplate: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: o.name,
    url: o.url,
    ...(o.description ? { description: o.description } : {}),
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: o.searchUrlTemplate }, "query-input": "required name=search_term_string" },
  };
}

export function organizationJsonLd(o: { name: string; url: string; logoUrl?: string | null }) {
  return { "@context": "https://schema.org", "@type": "Organization", name: o.name, url: o.url, ...(o.logoUrl ? { logo: o.logoUrl } : {}) };
}
