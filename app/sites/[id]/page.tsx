import SiteView from "@/components/SiteView";

export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cached?: string }>;
}) {
  const { id } = await params;
  const { cached } = await searchParams;
  return <SiteView id={id} fromCache={cached === "1"} />;
}
