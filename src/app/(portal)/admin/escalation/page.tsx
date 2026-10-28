import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { escalationPolicies, regionOptions } from "@/lib/queries";
import { can } from "@/lib/auth/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ROLE_LABELS } from "@/lib/constants";
import { humanise } from "@/lib/utils";
import { EscalationEditor } from "./escalation-editor";

export const metadata: Metadata = { title: "Escalation" };

export default async function EscalationPage() {
  const actor = await requirePageActor();
  if (!can(actor.role, "admin:config")) redirect("/dashboard");

  const [policies, regions] = await Promise.all([escalationPolicies(), regionOptions()]);

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Escalation policies"
        description="Each rung fires once the case is that many working days past its deadline. The most specific matching policy wins."
      />

      <EscalationEditor
        policies={policies.map((p) => ({
          id: p.id,
          level: p.level,
          afterWorkingDays: p.afterWorkingDays,
          targetRole: p.targetRole,
          channel: p.channel,
          scope: p.scope,
          regionId: p.regionId,
          isActive: p.isActive,
          description: p.description,
        }))}
        regions={regions.map((r) => ({ id: r.id, name: r.name }))}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {policies.map((p, i) => (
          <Card key={p.id} className="animate-fade-up" >
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4 text-brand" />
                  Level {p.level}
                </span>
              }
              subtitle={p.description ?? "Escalation rung"}
            />
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">After</span>
                <span className="text-sm font-semibold tabular-nums text-ink">
                  {p.afterWorkingDays} working day(s)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Target role</span>
                <Badge tone="brand">{ROLE_LABELS[p.targetRole] ?? p.targetRole}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Channel</span>
                <Badge tone={p.channel === "EMAIL" ? "info" : "neutral"}>{humanise(p.channel)}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Scope</span>
                <span className="text-xs text-ink">{p.region?.name ?? "All regions"}</span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-3">
                <span className="text-xs text-muted">Status</span>
                <Badge tone={p.isActive ? "ok" : "neutral"} dot>
                  {p.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mt-5 animate-fade-up">
        <CardBody>
          <p className="text-xs leading-relaxed text-muted">
            The escalation engine never changes a case. It only notifies the role named here, so an overdue case
            reaches a supervisor without anyone making a statutory decision on the institution's behalf.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
