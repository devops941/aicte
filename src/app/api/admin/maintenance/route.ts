import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyAuditChain, writeAudit } from "@/lib/audit/writer";
import { maintenanceActionSchema as actionSchema } from "@/lib/admin-schemas";


/**
 * Operational diagnostics and safe maintenance actions.
 *
 * This endpoint deliberately exposes no arbitrary SQL and no destructive reset.
 * It reports health, lists failed notifications, and can requeue a failed
 * notification or re-run the alert scan — operations that are recoverable and
 * fully audited. Everything here needs `system:maintain`, which only Super Admin
 * holds.
 */

/** Summarises worker freshness and the notification queue in one read. */
export const GET = withAuth("system:maintain", async ({ req }) => {
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "overview";

  if (view === "failed") {
    const failed = await prisma.notification.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 100,
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
    });
    return jsonOk({ failed });
  }

  const [heartbeats, counts, chain, appCount, auditCount] = await Promise.all([
    prisma.workerHeartbeat.findMany({ orderBy: { job: "asc" } }),
    prisma.notification.groupBy({ by: ["status"], _count: { _all: true } }),
    verifyAuditChain(2000),
    prisma.application.count(),
    prisma.auditLog.count(),
  ]);

  const now = Date.now();
  const jobs = heartbeats.map((h) => ({
    job: h.job,
    status: h.status,
    detail: h.detail,
    lastRunAt: h.lastRunAt,
    runCount: Number(h.runCount),
    ageMinutes: Math.round((now - h.lastRunAt.getTime()) / 60000),
    stale: now - h.lastRunAt.getTime() > 30 * 60_000,
  }));

  return jsonOk({
    jobs,
    notifications: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    integrity: {
      chainValid: chain.valid,
      checked: chain.checked,
      brokenAtId: chain.brokenAtId ?? null,
      reason: chain.reason ?? null,
      note: "Hash-chained audit log. Detects in-application tampering; it does not protect against a database owner editing the whole chain.",
    },
    totals: { applications: appCount, auditEntries: auditCount },
  });
});

/** Recoverable maintenance actions. Each one is recorded in the audit trail. */
export const POST = withAuth("system:maintain", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(actionSchema, await req.json());

  if (body.action === "retry-notification") {
    const notification = await prisma.notification.findUnique({ where: { id: body.id } });
    if (!notification) return jsonError("Notification not found", 404);
    if (notification.status === "SENT") return jsonError("That notification was already delivered", 409);

    // Reset the attempt counter so the dispatcher will pick it up again.
    await prisma.$transaction(async (tx) => {
      await tx.notification.update({
        where: { id: body.id },
        data: { status: "QUEUED", attempts: 0, lastError: null },
      });
      await writeAudit(
        {
          actorId: actor.id,
          actorEmail: actor.email,
          action: "NOTIFICATION_RETRY",
          entityType: "Notification",
          entityId: body.id,
          after: { previousStatus: notification.status, previousAttempts: notification.attempts },
          ip,
          userAgent,
        },
        tx,
      );
    });

    return jsonOk({ requeued: 1 });
  }

  if (body.action === "retry-all-failed") {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.notification.updateMany({
        where: { status: "FAILED" },
        data: { status: "QUEUED", attempts: 0, lastError: null },
      });
      await writeAudit(
        {
          actorId: actor.id,
          actorEmail: actor.email,
          action: "NOTIFICATION_RETRY_BULK",
          entityType: "Notification",
          entityId: null,
          after: { requeued: updated.count },
          ip,
          userAgent,
        },
        tx,
      );
      return updated;
    });
    return jsonOk({ requeued: result.count });
  }

  // verify-chain
  const result = await verifyAuditChain(5000);
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "AUDIT_CHAIN_VERIFIED",
    entityType: "System",
    entityId: null,
    after: { valid: result.valid, checked: result.checked },
    ip,
    userAgent,
  });
  return jsonOk(result);
});
