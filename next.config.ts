import type { NextConfig } from "next";

// next/image may only load remote images from hosts we name. The only remote image host is this project's Supabase
// Storage (public bucket); nothing else is allowed.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const remotePatterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [];
if (supabaseUrl) {
  const u = new URL(supabaseUrl);
  remotePatterns.push({ protocol: u.protocol.replace(":", "") as "http" | "https", hostname: u.hostname, ...(u.port ? { port: u.port } : {}), pathname: "/storage/v1/object/public/**" });
}

const nextConfig: NextConfig = { images: { remotePatterns } };

export default nextConfig;
