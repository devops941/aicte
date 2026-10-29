import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GitBranch } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { workflowList } from "@/lib/queries";
import { can } from "@/lib/auth/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ACTION_LABELS, TYPE_LABELS } from "@/lib/constants";
import { humanise } from "@/lib/utils";

export const metadata: Metadata = { title: "Workflows" };

export default async function WorkflowsPage() {
  const actor = await requirePageActor();
  if (!can(actor.role, "workflow:configure")) redirect("/dashboard");

  const definitions = await workflowList();

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Workflow definitions"
        description="Stage sequences and SLA allowances live in these tables, so a handbook change is a data change. Cases stay on the version they started with."
      />

      <div className="space-y-5">
        {definitions.map((def, i) => (
          <Card key={def.id}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <GitBranch className="h-4 w-4 text-brand" />
                  {def.name}
                  <Badge tone="brand">v{def.version}</Badge>
                  <Badge tone={def.isActive ? "ok" : "neutral"} dot>
                    {def.isActive ? "Active" : "Inactive"}
                  </Badge>
                </span>
              }
              subtitle={`${TYPE_LABELS[def.applicationType] ?? def.applicationType} · ${def.stages.length} stages · ${def._count.applications} case(s) on this version`}
            />
            <CardBody>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {def.stages
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((s, idx) => (
                    <span key={s.id} className="flex items-center gap-1.5">
                      <Badge tone={s.isInitial ? "brand" : s.isTerminal ? "neutral" : "info"}>
                        {s.name} · {s.slaWorkingDays}d · {humanise(s.assigneeRole)}
                      </Badge>
                      {idx < def.stages.length - 1 && <span className="text-muted">→</span>}
                    </span>
                  ))}
              </div>

              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Allowed transitions</p>
              <div className="table-wrap">
                <table className="w-full">
                  <thead className="bg-canvas">
                    <tr>
                      <th className="th">Action</th>
                      <th className="th">Required role</th>
                      <th className="th">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {def.stages.flatMap((s) =>
                      s.outgoing.map((t) => (
                        <tr key={t.id} className="transition-colors hover:bg-canvas">
                          <td className="td font-mono text-[11px] text-ink">{ACTION_LABELS[t.action] ?? t.action}</td>
                          <td className="td text-muted">{humanise(t.requiredRole)}</td>
                          <td className="td">
                            {t.requiresRemark ? <Badge tone="warn">Required</Badge> : <span className="text-muted">Optional</span>}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
