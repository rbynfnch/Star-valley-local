"use client";

import { useState, useSyncExternalStore } from "react";

const btn = "rounded-button border border-slate-600 px-4 py-2 text-sm font-semibold text-text hover:bg-surface-muted";

/** Native share sheet when the device has one, always copy-link, and plain links for email and Facebook. The link is the page's own
 *  canonical address, so a shared Hotlist card carries the same preview image and text as the page. */
export function ShareButtons({ url, title, text }: { url: string; title: string; text: string }) {
  const canShare = useSyncExternalStore(() => () => {}, () => typeof navigator.share === "function", () => false);   // server and first paint: no Share button
  const [note, setNote] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setNote("Link copied."); } catch { setNote("Copy this address: " + url); }
  };
  const share = async () => { try { await navigator.share({ title, text, url }); } catch { /* cancelled */ } };
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Share this">
      {canShare && <button type="button" onClick={share} className={btn}>Share</button>}
      <button type="button" onClick={copy} className={btn}>Copy link</button>
      <a className={btn} href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + "\n\n" + url)}`}>Email</a>
      <a className={btn} href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">Facebook<span className="sr-only"> (opens in a new tab)</span></a>
      <span role="status" className="text-sm text-text-muted">{note}</span>
    </div>
  );
}
