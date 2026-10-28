import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { History, ShieldCheck } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { auditPage } from "@/lib/queries";
import { verifyAuditChain } from "@/lib/audit/writer";
import { can } from "@/lib/auth/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime, humanise } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit Trail" };

export default async function AuditPage() {
  const actor = await requirePageActor();
  if (!can(actor.role, "audit:read")) redirect("/dashboard");

  const [{ rows, total }, verification] = await Promise.all([auditPage(150, 0), verifyAuditChain(10000)]);

  return (
    <div>
      <PageHeader
        eyebrow="Oversight"
        title="Audit trail"
        description="Append-only record of every state change. Each entry hashes the previous one, so editing or removing a row is detectable."
      />

      <Card className="mb-5 animate-fade-up">
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  verification.valid ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"
                }`}
              >
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {verification.valid ? "Chain is intact" : "Chain verification failed"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {verification.valid
                    ? `${verification.checked} entr${verification.checked === 1 ? "y" : "ies"} recomputed and matched.`
                    : `${verification.reason} at entry ${verification.brokenAtId?.slice(0, 8)}. A historical row has been altered.`}
                </p>
              </div>
            </div>
            <Badge tone={verification.valid ? "ok" : "danger"} dot>
              {verification.valid ? "Verified" : "Tampered"}
            </Badge>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`${total} recorded entr${total === 1 ? "y" : "ies"}`} subtitle="Most recent first" />
        <div className="table-wrap border-0">
          <table className="w-full">
            <thead className="bg-canvas">
              <tr>
                <th className="th">When</th>
                <th className="th">Actor</th>
                <th className="th">Action</th>
                <th className="th">Entity</th>
                <th className="th">Hash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-canvas">
                  <td className="td text-muted">{formatDateTime(r.createdAt)}</td>
                  <td className="td">
                    <span className="text-ink">{r.actor?.name ?? r.actorEmail ?? "System"}</span>
                    {r.actor?.role && <p className="text-[10px] text-muted">{humanise(r.actor.role)}</p>}
                  </td>
                  <td className="td">
                    <span className="font-mono text-[11px] text-ink">{r.action}</span>
                  </td>
                  <td className="td">
                    <span className="text-muted">{r.entityType}</span>
                    {r.entityId && <p className="font-mono text-[10px] text-muted">{r.entityId.slice(0, 8)}</p>}
                  </td>
                  <td className="td">
                    <span className="font-mono text-[10px] text-muted">{r.hash.slice(0, 16)}…</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
