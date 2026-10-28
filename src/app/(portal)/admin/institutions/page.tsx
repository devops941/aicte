import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { institutionDirectory, regionOptions } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { InstitutionDirectory } from "./institution-directory";

export const metadata: Metadata = { title: "Institutions" };

export default async function InstitutionsPage() {
  const actor = await requirePageActor();
  if (!can(actor.role, "admin:config") && actor.role !== "REGIONAL_OFFICER") redirect("/dashboard");

  const [directory, regions] = await Promise.all([
    institutionDirectory(actor, { pageSize: 100 }),
    regionOptions(),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Institutions"
        description="The master list of institutions. Each belongs to one region, and that region decides which officer sees its cases. Institutions are deactivated rather than deleted, so their application history is preserved."
      />
      <InstitutionDirectory rows={directory.rows} regions={regions} canEdit={can(actor.role, "admin:config")} />
    </div>
  );
}
