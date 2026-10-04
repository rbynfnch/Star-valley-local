/**
 * Public URL of a stored image. `base` is the public storage root: Supabase's `<project>/storage/v1/object/public`, or
 * (development only) `/demo-media`. Returns null for anything that is not a plain relative object path, so a bad row
 * can never turn into `../` traversal or a javascript: URL.
 */
export function mediaUrl(base: string | null | undefined, bucket: string, path: string): string | null {
  if (!base) return null;
  const clean = (s: string) => s.split("/").every((seg) => seg.length > 0 && seg !== "." && seg !== ".." && /^[A-Za-z0-9._~ -]+$/.test(seg));
  if (!/^[a-z0-9_-]+$/i.test(bucket) || !clean(path)) return null;
  const root = base.replace(/\/+$/, "");
  if (!/^(https?:\/\/|\/)/.test(root)) return null;
  return `${root}/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function mediaBaseUrl(env: { SVL_MEDIA_BASE_URL?: string; NEXT_PUBLIC_SUPABASE_URL?: string; NODE_ENV?: string } = process.env): string | null {
  if (env.SVL_MEDIA_BASE_URL && env.NODE_ENV !== "production") return env.SVL_MEDIA_BASE_URL;   // dev-only override
  return env.NEXT_PUBLIC_SUPABASE_URL ? `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public` : null;
}
