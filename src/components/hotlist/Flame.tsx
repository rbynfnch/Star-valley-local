import Image from "next/image";

// The Hotlist mark, exactly as supplied (cropped from the logo; never recoloured, redrawn or stretched). 295 x 399 source.
const W = 295, H = 399;
export function FlameMark({ height = 24, label, className = "" }: { height?: number; label?: string; className?: string }) {
  return (
    <Image src="/brand/local-hotlist-mark.png" alt={label ?? ""} width={Math.round((height * W) / H)} height={height}
      aria-hidden={label ? undefined : true} className={`inline-block shrink-0 ${className}`} style={{ height, width: "auto" }} />
  );
}

/** The full logo (mark and wordmark) on its own light surface. */
export function HotlistLogo({ height = 120, priority = false }: { height?: number; priority?: boolean }) {
  return <Image src="/brand/local-hotlist.png" alt="Local Hotlist" width={Math.round((height * 1356) / 856)} height={height} priority={priority} style={{ height, width: "auto" }} />;
}
