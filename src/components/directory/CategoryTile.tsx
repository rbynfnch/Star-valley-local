import Link from "next/link";
import { categoryColors, type CategoryColorName } from "@/styles/tokens";

export function categoryStyle(token: string | null) {
  const c = categoryColors[(token ?? "navy") as CategoryColorName] ?? categoryColors.navy;
  return { background: c.bg, color: c.fg };
}

export function CategoryTile({ slug, name, description, colorToken }: { slug: string; name: string; description: string | null; colorToken: string | null }) {
  return (
    <Link href={`/categories/${slug}`} style={categoryStyle(colorToken)} className="flex min-h-32 flex-col justify-end gap-1 rounded-card p-4 shadow-card transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <span className="font-heading text-xl font-bold leading-tight">{name}</span>
      {description && <span className="text-sm opacity-95">{description}</span>}
    </Link>
  );
}
