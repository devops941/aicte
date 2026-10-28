import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/db";
import { verifyAuditChain } from "@/lib/audit/writer";
import { MaintenanceConsole } from "./maintenance-console";

export const metadata: Metadata = { title: "Data & Maintenance" };

export default async function MaintenancePage() {
  const actor = await requirePageActor();
  if (!can(actor.role, "system:maintain")) redirect("/dashboard");

  const [heartbeats, counts, chain, appCount, auditCount, failed] = await Promise.all([
    prisma.workerHeartbeat.findMany({ orderBy: { job: "asc" } }),
    prisma.notification.groupBy({ by: ["status"], _count: { _all: true } }),
    verifyAuditChain(2000),
    prisma.application.count(),
    prisma.auditLog.count(),
    prisma.notification.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        channel: true,
        title: true,
        attempts: true,
        lastError: true,
        createdAt: true,
        user: { select: { email: true, name: true } },
      },
    }),
  ]);

  const now = Date.now();
  const jobs = heartbeats.map((h) => ({
    job: h.job,
    status: h.status,
    detail: h.detail,
    lastRunAt: h.lastRunAt.toISOString(),
    runCount: Number(h.runCount),
    ageMinutes: Math.round((now - h.lastRunAt.getTime()) / 60000),
    stale: now - h.lastRunAt.getTime() > 30 * 60_000,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Data & Maintenance"
        description="Operational health, the notification queue and audit-chain integrity. Actions here are limited to recoverable operations — requeue a failed notification or re-verify the audit chain — and each is recorded in the audit trail."
      />
      <MaintenanceConsole
        jobs={jobs}
        notifications={Object.fromEntries(counts.map((c) => [c.status, c._count._all]))}
        integrity={{
          chainValid: chain.valid,
          checked: chain.checked,
          brokenAtId: chain.brokenAtId ?? null,
          reason: chain.reason ?? null,
          note: "Hash-chained audit log. Detects in-application tampering; it does not protect against a database owner editing the whole chain.",
        }}
        totals={{ applications: appCount, auditEntries: auditCount }}
        failed={failed.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))}
      />
    </div>
  );
}
