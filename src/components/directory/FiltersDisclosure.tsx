"use client";
import { useEffect, useRef } from "react";

// The filter panel is a native <details>. It renders OPEN, so desktop and no-JavaScript visitors always see the
// filters; on narrow screens this collapses it (after hydration) behind the "Filters" summary, and re-opens it when
// the window grows past the `lg` breakpoint. The summary is hidden at `lg`, so there it can't be collapsed.
export function FiltersDisclosure({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => { if (ref.current) ref.current.open = mq.matches; };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return (
    <details ref={ref} open className="group lg:contents">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-button border border-border bg-surface-card px-4 py-3 font-semibold text-text lg:hidden [&::-webkit-details-marker]:hidden">
        {summary}<span aria-hidden="true" className="group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-4 lg:mt-0">{children}</div>
    </details>
  );
}
