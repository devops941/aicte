import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { listCases } from "@/lib/queries";
import { CaseList } from "@/components/case-list";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const actor = await requirePageActor();
  const { rows, total } = await listCases(actor, { pageSize: 100, sort: "recent" });

  return (
    <div>
      <PageHeader
        eyebrow="Institution view"
        title="Applications"
        description={`${total} application(s) for your institution. Create a new one or open an existing case.`}
        actions={
          <Link href="/applications/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            New application
          </Link>
        }
      />
      <CaseList rows={rows as never} basePath="/applications" canExport showInstitution={false} />
    </div>
  );
}
