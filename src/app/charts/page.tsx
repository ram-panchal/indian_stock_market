import { ChartWorkspace } from "@/components/charts/chart-workspace";

export const metadata = { title: "Charts — Indian Market" };

export default async function ChartsPage({
  searchParams,
}: {
  // Next.js 16: searchParams is async.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "IDX:NIFTY";
  return <ChartWorkspace key={token} initialToken={token} />;
}
