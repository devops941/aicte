import { CaseDetailRoute } from "@/components/case-detail-route";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseDetailRoute id={id} />;
}
