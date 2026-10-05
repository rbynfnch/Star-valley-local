import type { Metadata } from "next";

// Open Graph and Twitter tags for a page. Next replaces (not merges) a page's `openGraph` with the layout's, so each page that sets
// its own title builds the whole object here. `path` is relative; metadataBase (set in the public layout) makes it absolute.
export function socialMeta(o: { title: string; description: string; path: string; siteName: string; image?: string | null }): Pick<Metadata, "openGraph" | "twitter"> {
  const images = o.image && /^(https?:\/\/|\/)/.test(o.image) ? [{ url: o.image }] : undefined;
  return {
    openGraph: { type: "website", locale: "en_US", siteName: o.siteName, title: o.title, description: o.description, url: o.path, ...(images ? { images } : {}) },
    twitter: { card: images ? "summary_large_image" : "summary", title: o.title, description: o.description, ...(images ? { images: images.map((i) => i.url) } : {}) },
  };
}
