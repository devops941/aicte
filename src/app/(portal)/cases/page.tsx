import type { Metadata } from "next";
import { requirePageActor } from "@/lib/auth/session";
import { listCases } from "@/lib/queries";
import { CaseList } from "@/components/case-list";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Cases" };

export default async function CasesPage() {
  const actor = await requirePageActor();
  const { rows, total } = await listCases(actor, { pageSize: 100, sort: "due" });

  return (
    <div>
      <PageHeader
        eyebrow="Officer view"
        title="Cases"
        description={`${total} case(s) in your scope. Scoped to your region or assignments — you will not see cases outside it.`}
      />
      <CaseList rows={rows as never} basePath="/cases" canExport={can(actor.role, "report:read")} />
    </div>
  );
}
