import type { NextConfig } from "next";

// next/image may only load remote images from hosts we name. The only remote image host is this project's Supabase
// Storage (public bucket); nothing else is allowed.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const remotePatterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [];
if (supabaseUrl) {
  const u = new URL(supabaseUrl);
  remotePatterns.push({ protocol: u.protocol.replace(":", "") as "http" | "https", hostname: u.hostname, ...(u.port ? { port: u.port } : {}), pathname: "/storage/v1/object/public/**" });
}

// Security headers. The CSP keeps 'unsafe-inline' for scripts and styles because Next.js emits inline bootstrap scripts; what it does
// buy is no framing (clickjacking on the admin), no plugins, no foreign form targets or base tags, and a short list of hosts for
// scripts, frames, images and connections. Production only: the dev server needs eval and websockets.
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigin} https://challenges.cloudflare.com`.trim(),
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join("; ");
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// Photo uploads (up to 5 MB, checked again in the server action) travel inside a server action request; the default limit is 1 MB.
const nextConfig: NextConfig = {
  images: { remotePatterns },
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() { return process.env.NODE_ENV === "production" ? [{ source: "/:path*", headers: securityHeaders }] : []; },
};

export default nextConfig;
