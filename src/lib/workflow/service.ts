import type { ApplicationStatus, Prisma, Role, WorkflowAction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import {
  addWorkingDays,
  buildHolidaySet,
  computeDueDate,
  countWorkingDays,
  type HolidayLike,
} from "@/lib/sla/calendar";
import { guardTransition, statusAfterTransition, type StageRow, type TransitionRow } from "@/lib/workflow/engine";
import { dedupe, type OutboxItem } from "@/lib/notifications/outbox";
import { actionLabel } from "@/lib/workflow/labels";
import type { Actor } from "@/lib/auth/rbac";
import { ForbiddenError, NotFoundError, ValidationError, can } from "@/lib/auth/rbac";

export type TransitionRequest = {
  actor: Actor;
  applicationId: string;
  action: WorkflowAction;
  remark?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Extra data for actions that create a record, e.g. EVC scheduling. */
  payload?: Record<string, unknown>;
};

export type TransitionOutcome = {
  applicationId: string;
  appNo: string;
  fromStage: string;
  toStage: string;
  action: WorkflowAction;
  status: ApplicationStatus;
  slaDueAt: Date | null;
  notificationsQueued: number;
  warnings: string[];
};

async function loadHolidays(regionId: string | null): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany({
    where: { OR: [{ regionId: null }, ...(regionId ? [{ regionId }] : [])] },
    select: { date: true, regionId: true },
  });
  return buildHolidaySet(holidays as HolidayLike[], regionId);
}

/** Generates the next sequential application number for the current year. */
export async function nextApplicationNo(tx: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `APP-${year}-`;
  const last = await tx.application.findFirst({
    where: { appNo: { startsWith: prefix } },
    orderBy: { appNo: "desc" },
    select: { appNo: true },
  });
  const lastSeq = last ? Number.parseInt(last.appNo.slice(prefix.length), 10) : 0;
  const next = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
}

/** Recipients for a role within a scope. Institution admins are pinned to their institution. */
export async function resolveRecipients(
  role: Role,
  scope: { regionId?: string | null; institutionId?: string | null },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (role === "INSTITUTION_ADMIN") {
    if (!scope.institutionId) return [];
    return tx.user.findMany({
      where: { role, institutionId: scope.institutionId, isActive: true },
      select: { id: true, email: true, name: true },
    });
  }
  return tx.user.findMany({
    where: {
      role,
      isActive: true,
      ...(scope.regionId ? { regionId: scope.regionId } : {}),
    },
    select: { id: true, email: true, name: true },
  });
}

function outboxFor(
  recipients: { id: string }[],
  base: Omit<OutboxItem, "userId" | "dedupeKey"> & { dedupeKey: (userId: string) => string },
): OutboxItem[] {
  return recipients.map((r) => ({
    ...base,
    userId: r.id,
    dedupeKey: base.dedupeKey(r.id),
  }));
}

/**
 * Applies one workflow move. Everything that must succeed together — the status
 * change, the stage history row, the assignment swap, the SLA clock and the
 * audit entry — happens inside a single transaction. Notifications are queued
 * in the same transaction and delivered by the worker, so an alert can never
 * describe a state change that was rolled back.
 */
export async function performTransition(req: TransitionRequest): Promise<TransitionOutcome> {
  const { actor, applicationId, action, remark } = req;
  const warnings: string[] = [];

  const result = await prisma.$transaction(async (tx) => {
    const application = await tx.application.findFirst({
      where: { id: applicationId },
      include: {
        institution: { select: { id: true, name: true, regionId: true } },
        workflowVersion: {
          include: {
            stages: { include: { outgoing: true } },
          },
        },
      },
    });

    if (!application) throw new NotFoundError("Application not found");

    // Row-level scope is enforced here too, not only in the list query.
    if (actor.role === "INSTITUTION_ADMIN" && application.institutionId !== actor.institutionId) {
      throw new ForbiddenError("This application belongs to another institution");
    }
    if (actor.role === "REGIONAL_OFFICER" && application.regionId !== actor.regionId) {
      throw new ForbiddenError("This application belongs to another region");
    }

    if (!application.workflowVersion) {
      throw new ValidationError("No workflow is attached to this application");
    }

    const stages = application.workflowVersion.stages as unknown as StageRow[];
    const transitions = application.workflowVersion.stages.flatMap(
      (s) => s.outgoing,
    ) as unknown as TransitionRow[];

    const openClarification = await tx.clarificationRequest.findFirst({
      where: { applicationId, status: "OPEN" },
      select: { id: true },
    });

    const guard = guardTransition({
      snapshot: { id: application.id, status: application.status, currentStageId: application.currentStageId },
      stages,
      transitions,
      action,
      actorRole: actor.role,
      remark,
      hasOpenClarification: Boolean(openClarification),
    });

    if (!guard.ok) {
      // A rejected move is still a recordable event.
      await writeAudit(
        {
          actorId: actor.id,
          actorEmail: actor.email,
          action: `TRANSITION_REJECTED:${action}`,
          entityType: "Application",
          entityId: application.id,
          after: { reason: guard.code, message: guard.message },
          ip: req.ip,
          userAgent: req.userAgent,
        },
        tx,
      );
      throw new ValidationError(guard.message);
    }

    const now = new Date();
    const holidays = await loadHolidays(application.regionId);

    // Close the outgoing stage-history row and measure how long it was held.
    if (application.currentStageId) {
      const openRow = await tx.applicationStageHistory.findFirst({
        where: { applicationId, stageId: application.currentStageId, exitedAt: null },
        orderBy: { enteredAt: "desc" },
      });
      if (openRow) {
        const days = countWorkingDays(openRow.enteredAt, now, holidays);
        const allowance = guard.from.slaWorkingDays;
        await tx.applicationStageHistory.update({
          where: { id: openRow.id },
          data: { exitedAt: now, daysInStage: days, slaMet: days <= allowance },
        });
      }
    }

    const newStatus = statusAfterTransition(action, guard.to, application.status);

    // SLA clock: pausing freezes the deadline, resuming restores the remaining
    // working days, and a plain move starts a fresh allowance on the new stage.
    let slaDueAt = application.slaDueAt;
    let slaPausedAt = application.slaPausedAt;
    let slaPausedMs = application.slaPausedMs;

    if (guard.pausesClock) {
      slaPausedAt = now;
    } else if (guard.resumesClock) {
      const pausedFrom = application.slaPausedAt ?? now;
      slaPausedMs = slaPausedMs + BigInt(Math.max(0, now.getTime() - pausedFrom.getTime()));
      const consumed = await (async () => {
        const firstRow = await tx.applicationStageHistory.findFirst({
          where: { applicationId, stageId: guard.to.id },
          orderBy: { enteredAt: "desc" },
        });
        return firstRow ? countWorkingDays(firstRow.enteredAt, pausedFrom, holidays) : 0;
      })();
      const remaining = Math.max(1, guard.to.slaWorkingDays - consumed);
      slaDueAt = addWorkingDays(now, remaining, holidays);
      slaPausedAt = null;
    } else {
      slaDueAt = computeDueDate(now, guard.to.slaWorkingDays, holidays);
      slaPausedAt = null;
    }

    const slaState =
      newStatus === "APPROVED" || newStatus === "REJECTED" || newStatus === "WITHDRAWN"
        ? application.slaState === "OVERDUE"
          ? "BREACHED"
          : "MET"
        : guard.pausesClock
          ? "PAUSED"
          : "ON_TRACK";

    const updated = await tx.application.update({
      where: { id: application.id },
      data: {
        currentStageId: guard.to.id,
        status: newStatus,
        slaDueAt,
        slaPausedAt,
        slaPausedMs,
        slaState,
        decidedAt: ["APPROVED", "REJECTED", "WITHDRAWN"].includes(newStatus) ? now : null,
      },
    });

    await tx.applicationStageHistory.create({
      data: {
        applicationId: application.id,
        stageId: guard.to.id,
        fromStageId: guard.from.id,
        action,
        actorId: actor.id,
        actorRole: actor.role,
        remark: remark?.trim() || null,
        enteredAt: now,
      },
    });

    // Assignment follows the stage's owning role: release the old holder and
    // hand the case to whoever now owns it.
    await tx.assignment.updateMany({
      where: { applicationId: application.id, releasedAt: null },
      data: { releasedAt: now },
    });

    const recipients = await resolveRecipients(
      guard.to.assigneeRole,
      { regionId: application.regionId, institutionId: application.institutionId },
      tx,
    );

    const primary = recipients[0];
    if (primary) {
      await tx.assignment.create({
        data: {
          applicationId: application.id,
          userId: primary.id,
          stageId: guard.to.id,
          assignedById: actor.id,
          note: `Auto-assigned on ${action}`,
        },
      });
    } else if (!guard.to.isTerminal) {
      warnings.push(`No active ${guard.to.assigneeRole} available in this region; the case is unassigned.`);
    }

    // Clarification bookkeeping.
    if (action === "RETURN_FOR_CLARIFICATION") {
      const dueAt = addWorkingDays(now, 7, holidays);
      await tx.clarificationRequest.create({
        data: {
          applicationId: application.id,
          stageId: guard.from.id,
          raisedById: actor.id,
          reason: remark?.trim() || "Clarification required",
          dueAt,
          status: "OPEN",
        },
      });
    }
    if (action === "RESPOND_CLARIFICATION" || action === "RESUBMIT") {
      await tx.clarificationRequest.updateMany({
        where: { applicationId: application.id, status: "OPEN" },
        data: {
          status: "RESPONDED",
          response: remark?.trim() || null,
          respondedById: actor.id,
          respondedAt: now,
        },
      });
    }

    // Notifications: one row per recipient, keyed so a rerun cannot duplicate it.
    const items: OutboxItem[] = [];
    const link = `/cases/${application.id}`;

    for (const r of recipients) {
      items.push({
        userId: r.id,
        kind: "ASSIGNMENT",
        dedupeKey: `assignment:${application.id}:${guard.to.id}:${r.id}`,
        channel: "IN_APP",
        title: `${application.appNo} is now at ${guard.to.name}`,
        body: `${actionLabel(action)} by ${actor.name}.`,
        link,
        entityType: "Application",
        entityId: application.id,
      });
    }

    if (["APPROVED", "REJECTED"].includes(newStatus)) {
      const instUsers = await resolveRecipients("INSTITUTION_ADMIN", { institutionId: application.institutionId }, tx);
      for (const r of instUsers) {
        items.push({
          userId: r.id,
          kind: "DECISION",
          dedupeKey: `decision:${action}:${application.id}:${r.id}`,
          channel: "EMAIL",
          title: `${application.appNo} has been ${newStatus.toLowerCase()}`,
          body: remark?.trim() || `Decision recorded by ${actor.name}.`,
          link,
          entityType: "Application",
          entityId: application.id,
        });
      }
    }

    if (action === "RETURN_FOR_CLARIFICATION") {
      const instUsers = await resolveRecipients("INSTITUTION_ADMIN", { institutionId: application.institutionId }, tx);
      for (const r of instUsers) {
        items.push({
          userId: r.id,
          kind: "CLARIFICATION_RAISED",
          dedupeKey: `clarification:raised:${application.id}:${r.id}:${now.getTime()}`,
          channel: "EMAIL",
          title: `Clarification requested on ${application.appNo}`,
          body: remark?.trim() || "Please review and respond.",
          link: `/applications/${application.id}`,
          entityType: "Application",
          entityId: application.id,
        });
      }
    }

    const unique = dedupe(items);
    if (unique.length > 0) {
      await tx.notification.createMany({ data: unique, skipDuplicates: true });
    }

    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: `TRANSITION:${action}`,
        entityType: "Application",
        entityId: application.id,
        before: {
          status: application.status,
          currentStageId: application.currentStageId,
          slaDueAt: application.slaDueAt,
          slaState: application.slaState,
        },
        after: {
          status: newStatus,
          currentStageId: guard.to.id,
          slaDueAt,
          slaState,
          remark: remark?.trim() || null,
        },
        ip: req.ip,
        userAgent: req.userAgent,
      },
      tx,
    );

    return {
      applicationId: application.id,
      appNo: application.appNo,
      fromStage: guard.from.name,
      toStage: guard.to.name,
      action,
      status: newStatus,
      slaDueAt,
      notificationsQueued: unique.length,
      warnings,
      updatedStatus: updated.status,
    };
  });

  return {
    applicationId: result.applicationId,
    appNo: result.appNo,
    fromStage: result.fromStage,
    toStage: result.toStage,
    action: result.action,
    status: result.updatedStatus,
    slaDueAt: result.slaDueAt,
    notificationsQueued: result.notificationsQueued,
    warnings: result.warnings,
  };
}

export async function createApplication(input: {
  actor: Actor;
  type: import("@prisma/client").ApplicationType;
  title: string;
  summary?: string | null;
  intakeRequested?: number | null;
  courseName?: string | null;
  institutionId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const { actor } = input;
  if (!can(actor.role, "application:create")) {
    throw new ForbiddenError("You are not permitted to create applications");
  }

  const institutionId = actor.role === "INSTITUTION_ADMIN" ? actor.institutionId : input.institutionId;
  if (!institutionId) throw new ValidationError("An institution is required");

  const institution = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!institution) throw new NotFoundError("Institution not found");

  const definition = await prisma.workflowDefinition.findFirst({
    where: { applicationType: input.type, isActive: true },
    orderBy: { version: "desc" },
    include: { stages: true },
  });
  if (!definition) throw new ValidationError(`No active workflow is configured for ${input.type}`);

  const initial = definition.stages.find((s) => s.isInitial) ?? definition.stages.sort((a, b) => a.sequence - b.sequence)[0];

  return prisma.$transaction(async (tx) => {
    const appNo = await nextApplicationNo(tx);
    const created = await tx.application.create({
      data: {
        appNo,
        type: input.type,
        title: input.title,
        summary: input.summary ?? null,
        intakeRequested: input.intakeRequested ?? null,
        courseName: input.courseName ?? null,
        institutionId,
        regionId: institution.regionId,
        workflowVersionId: definition.id,
        currentStageId: initial?.id ?? null,
        status: "DRAFT",
        createdById: actor.id,
      },
    });

    // Record the initial stage immediately. Without this row the first stage
    // would have no entry timestamp, so its dwell time and SLA outcome could
    // never be measured when the case moves on.
    if (initial) {
      await tx.applicationStageHistory.create({
        data: {
          applicationId: created.id,
          stageId: initial.id,
          action: "CREATED",
          actorId: actor.id,
          actorRole: actor.role,
          remark: "Application created as a draft",
          enteredAt: created.createdAt,
        },
      });
    }

    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "APPLICATION_CREATED",
        entityType: "Application",
        entityId: created.id,
        after: { appNo: created.appNo, type: created.type, title: created.title },
        ip: input.ip,
        userAgent: input.userAgent,
      },
      tx,
    );

    return created;
  });
}

/** Derives the live SLA classification for a case from its stored deadline. */
export function classifyFromDue(dueAt: Date | null, pausedAt: Date | null, now = new Date()) {
  if (pausedAt) return "PAUSED" as const;
  if (!dueAt) return "ON_TRACK" as const;
  const daysLeft = countWorkingDays(now, dueAt, new Set());
  const total = Math.max(1, countWorkingDays(new Date(dueAt.getTime() - 86400000 * 30), dueAt, new Set()));
  if (now > dueAt) return "OVERDUE" as const;
  if (daysLeft <= Math.max(1, Math.round(total * 0.2))) return "DUE_SOON" as const;
  return "ON_TRACK" as const;
}
