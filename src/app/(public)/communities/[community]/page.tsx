import type { Metadata } from "next";
import { hubMetadata, renderHub } from "@/components/directory/hub-route";

export async function generateMetadata(props: PageProps<"/communities/[community]">): Promise<Metadata> {
  const { community } = await props.params;
  return hubMetadata("community", null, community, await props.searchParams);
}
export default async function CommunityPage(props: PageProps<"/communities/[community]">) {
  const { community } = await props.params;
  return renderHub("community", null, community, await props.searchParams);
}
