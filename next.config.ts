import type { NextConfig } from "next";

// next/image may only load remote images from hosts we name. The only remote image host is this project's Supabase
// Storage (public bucket); nothing else is allowed.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const remotePatterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [];
if (supabaseUrl) {
  const u = new URL(supabaseUrl);
  remotePatterns.push({ protocol: u.protocol.replace(":", "") as "http" | "https", hostname: u.hostname, ...(u.port ? { port: u.port } : {}), pathname: "/storage/v1/object/public/**" });
}

// Photo uploads (up to 5 MB, checked again in the server action) travel inside a server action request; the default limit is 1 MB.
const nextConfig: NextConfig = { images: { remotePatterns }, experimental: { serverActions: { bodySizeLimit: "6mb" } } };

export default nextConfig;
