import type { Metadata } from "next";
import { CalendarClock, ShieldCheck, TriangleAlert } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { complianceOverview } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ComplianceActions } from "@/components/compliance-actions";
import { can } from "@/lib/auth/rbac";
import { formatDate, humanise } from "@/lib/utils";

export const metadata: Metadata = { title: "Compliance" };

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  OPEN: "info",
  SUBMITTED: "warn",
  VERIFIED: "ok",
  REJECTED: "danger",
  OVERDUE: "danger",
};

export default async function CompliancePage() {
  const actor = await requirePageActor();
  const { undertakings, expiring } = await complianceOverview(actor);

  const overdue = undertakings.filter((u) => u.status === "OVERDUE").length;
  const pending = undertakings.filter((u) => u.status === "SUBMITTED").length;

  return (
    <div>
      <PageHeader
        eyebrow="Institutional compliance"
        title="Compliance"
        description="Undertakings, evidence and document expiry. Overdue obligations raise alerts automatically."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Undertakings", value: undertakings.length, tone: "brand" as const, icon: ShieldCheck },
          { label: "Awaiting verification", value: pending, tone: "warn" as const, icon: CalendarClock },
          { label: "Overdue", value: overdue, tone: "danger" as const, icon: TriangleAlert },
        ].map((s, i) => (
          <div key={s.label} className="card card-pad animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{s.label}</p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{s.value}</p>
              </div>
              <s.icon className={`h-4 w-4 ${s.tone === "danger" ? "text-danger" : s.tone === "warn" ? "text-warn" : "text-brand"}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Undertakings" subtitle="Obligations owed by institutions, with evidence status" />
            {undertakings.length === 0 ? (
              <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No undertakings" description="Nothing is outstanding for the institutions in your scope." />
            ) : (
              <div className="divide-y divide-line">
                {undertakings.map((u) => (
                  <div key={u.id} className="px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">{u.title}</span>
                          <Badge tone={STATUS_TONE[u.status] ?? "neutral"} dot>
                            {humanise(u.status)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {u.institution.name} · due {formatDate(u.dueAt)}
                          {u.application && ` · ${u.application.appNo}`}
                        </p>
                        {u.submissions.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {u.submissions.slice(0, 2).map((s) => (
                              <div key={s.id} className="rounded-lg border border-line bg-canvas px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-medium text-ink">
                                    {s.status === "PENDING" ? "Awaiting verification" : humanise(s.status)}
                                  </span>
                                  <span className="text-[10px] text-muted">{formatDate(s.submittedAt)}</span>
                                </div>
                                {s.remark && <p className="mt-1 text-[11px] text-muted">{s.remark}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <ComplianceActions
                        undertakingId={u.id}
                        status={u.status}
                        canSubmit={can(actor.role, "compliance:submit")}
                        canVerify={can(actor.role, "compliance:verify")}
                        submissionId={u.submissions.find((s) => s.status === "PENDING")?.id ?? null}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="h-full">
          <CardHeader title="Documents expiring soon" subtitle="Within the next 60 days" />
          <CardBody className="space-y-2">
            {expiring.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted">No documents are close to expiry.</p>
            ) : (
              expiring.map((d) => {
                const expired = d.expiresAt ? d.expiresAt < new Date() : false;
                return (
                  <div key={d.id} className="rounded-xl border border-line px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-ink">{d.label ?? d.kind}</span>
                      <Badge tone={expired ? "danger" : "warn"}>{expired ? "Expired" : "Expiring"}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {d.application?.appNo ?? "Institution document"} · {formatDate(d.expiresAt)}
                    </p>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
