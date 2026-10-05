// "Is it live right now?" for the content lists. The clock is read here, not in the pages.
export const dealLive = (d: { status: string; starts_at: string; ends_at: string | null }, at = Date.now()): boolean =>
  d.status === "published" && new Date(d.starts_at).getTime() <= at && (!d.ends_at || new Date(d.ends_at).getTime() > at);
export const articleLive = (a: { status: string; publish_at: string | null }, at = Date.now()): boolean =>
  (a.status === "published" || a.status === "scheduled") && !!a.publish_at && new Date(a.publish_at).getTime() <= at;
