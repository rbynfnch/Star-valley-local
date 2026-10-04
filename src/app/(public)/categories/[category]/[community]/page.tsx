import type { Metadata } from "next";
import { hubMetadata, renderHub } from "@/components/directory/hub-route";

export async function generateMetadata(props: PageProps<"/categories/[category]/[community]">): Promise<Metadata> {
  const { category, community } = await props.params;
  return hubMetadata("combo", category, community, await props.searchParams);
}
export default async function CategoryInCommunityPage(props: PageProps<"/categories/[category]/[community]">) {
  const { category, community } = await props.params;
  return renderHub("combo", category, community, await props.searchParams);
}
