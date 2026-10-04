import type { Metadata } from "next";
import { hubMetadata, renderHub } from "@/components/directory/hub-route";

export async function generateMetadata(props: PageProps<"/categories/[category]">): Promise<Metadata> {
  const { category } = await props.params;
  return hubMetadata("category", category, null, await props.searchParams);
}
export default async function CategoryPage(props: PageProps<"/categories/[category]">) {
  const { category } = await props.params;
  return renderHub("category", category, null, await props.searchParams);
}
