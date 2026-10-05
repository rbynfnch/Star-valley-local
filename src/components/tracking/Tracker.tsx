"use client";

import { useEffect } from "react";

// Sends events to /api/track with navigator.sendBeacon (survives leaving the page, sets no cookies).
// Honours Do Not Track and Global Privacy Control in the browser too; the server checks again.
export interface ClientEvent { type: string; business_id?: string; deal_id?: string; article_id?: string; community_id?: string; category_id?: string; query?: string; surface?: string }

function allowed(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack !== "1" && nav.globalPrivacyControl !== true;
}
function send(events: ClientEvent[]) {
  if (!allowed() || events.length === 0) return;
  let referrer: string | null = null;
  try { const u = new URL(document.referrer); if (u.host !== location.host) referrer = u.hostname; } catch { /* none */ }
  const data = JSON.stringify({ events: events.slice(0, 50), referrer });
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([data], { type: "text/plain" }))) return;
    void fetch("/api/track", { method: "POST", body: data, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
  } catch { /* tracking never breaks a page */ }
}

/** Page-level events (a profile view, the businesses a search showed). Sent once per page visit, however often React re-renders. */
export function TrackEvents({ events }: { events: ClientEvent[] }) {
  const key = JSON.stringify(events);
  useEffect(() => {
    const k = "svl-t:" + location.pathname + location.search + ":" + key.length + ":" + key.slice(0, 80);
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch { /* no storage: send anyway */ }
    send(JSON.parse(key) as ClientEvent[]);
  }, [key]);
  return null;
}

/** One listener for every Call / Website / Directions link: <a data-track="phone_click" data-business="<id>">. */
export function ClickTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[data-track]") as HTMLElement | null;
      if (!a) return;
      const type = a.dataset.track, business = a.dataset.business;
      if (type && business) send([{ type, business_id: business, ...(a.dataset.surface ? { surface: a.dataset.surface } : {}) }]);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);              // middle-click opens in a new tab too
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("auxclick", onClick, true); };
  }, []);
  return null;
}
