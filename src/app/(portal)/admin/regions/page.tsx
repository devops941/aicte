import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageActor } from "@/lib/auth/session";
import { regionsDirectory } from "@/lib/queries";
import { can } from "@/lib/auth/rbac";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RegionForm } from "@/components/region-form";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Regions" };

export default async function RegionsPage() {
  const actor = await requirePageActor();
  if (!can(actor.role, "admin:config")) redirect("/dashboard");

  const regions = await regionsDirectory();

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Regions"
        description="Regions group institutions and decide which regional officer sees their cases. Every region added here appears in the institution, user and holiday forms immediately."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={`${regions.length} region(s)`} subtitle="Each region can hold institutions and users" />
            <div className="table-wrap border-0">
              <table className="w-full">
                <thead className="bg-canvas">
                  <tr>
                    <th className="th">Code</th>
                    <th className="th">Name</th>
                    <th className="th">Institutions</th>
                    <th className="th">Users</th>
                  </tr>
                </thead>
                <tbody>
                  {regions.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-canvas">
                      <td className="td">
                        <Badge tone="info">{r.code}</Badge>
                      </td>
                      <td className="td font-medium text-ink">{r.name}</td>
                      <td className="td text-ink">{r._count.institutions}</td>
                      <td className="td text-ink">{r._count.users}</td>
                    </tr>
                  ))}
                  {regions.length === 0 && (
                    <tr>
                      <td className="td text-muted" colSpan={4}>
                        No regions yet. Add your first region on the right.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <RegionForm />
      </div>
    </div>
  );
}
