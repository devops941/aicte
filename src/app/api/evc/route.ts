import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { caseDetail } from "@/lib/queries";
import { dedupe } from "@/lib/notifications/outbox";
import { evcReminderKey } from "@/lib/notifications/outbox";
import { ValidationError } from "@/lib/auth/rbac";
import { evcCreateSchema, evcUpdateSchema } from "@/lib/evc-schemas";

/** Statuses that mean a visit is still live, so a second one would be a duplicate. */
const ACTIVE_STATUSES = ["PROPOSED", "SCHEDULED"] as const;

/**
 * Confirms every proposed member exists, is active and holds the EVC_MEMBER
 * role. The id alone is not enough: a stale or mistyped id would otherwise be
 * stored and silently notify nobody.
 */
async function assertValidMembers(memberIds: string[]) {
  const unique = [...new Set(memberIds)];
  const found = await prisma.user.findMany({
    where: { id: { in: unique }, role: "EVC_MEMBER", isActive: true },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw new ValidationError("One or more selected members are not active EVC members");
  }
  return unique;
}

/** Rejects a date in the past (with a small tolerance for clock skew). */
function assertFuture(scheduledFor: Date) {
  if (scheduledFor.getTime() < Date.now() - 60_000) {
    throw new ValidationError("The visit must be scheduled in the future");
  }
}

/** Schedules or reschedules an EVC visit. Rescheduling keeps history and notifies members. */
export const POST = withAuth("evc:schedule", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(evcCreateSchema, await req.json());
  const application = await caseDetail(actor, body.applicationId);
  if (!application) return jsonError("Application not found in your scope", 404);

  assertFuture(body.scheduledFor);
  const memberIds = await assertValidMembers(body.memberIds);

  const duplicate = await prisma.evcSchedule.findFirst({
    where: { applicationId: application.id, status: { in: [...ACTIVE_STATUSES] } },
    select: { id: true, scheduledFor: true },
  });
  if (duplicate) {
    return jsonError("This application already has an active EVC visit scheduled", 409, {
      existingId: duplicate.id,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const evc = await tx.evcSchedule.create({
      data: {
        applicationId: application.id,
        scheduledFor: body.scheduledFor,
        memberIds,
        venue: body.venue ?? null,
        notes: body.notes ?? null,
        status: "SCHEDULED",
      },
    });

    await tx.notification.createMany({
      skipDuplicates: true,
      data: dedupe(
        memberIds.map((memberId) => ({
          userId: memberId,
          kind: "EVC_REMINDER" as const,
          dedupeKey: `${evcReminderKey(evc.id, 7)}:${memberId}:created`,
          channel: "EMAIL" as const,
          title: `EVC visit scheduled for ${application.appNo}`,
          body: `${application.title}${body.venue ? ` at ${body.venue}` : ""} on ${body.scheduledFor.toISOString().slice(0, 10)}.`,
          link: "/evc",
          entityType: "Application",
          entityId: application.id,
        })),
      ),
    });

    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "EVC_SCHEDULED",
        entityType: "EvcSchedule",
        entityId: evc.id,
        after: {
          applicationId: application.id,
          scheduledFor: body.scheduledFor.toISOString(),
          members: memberIds,
          venue: body.venue ?? null,
        },
        ip,
        userAgent,
      },
      tx,
    );

    return evc;
  });

  return jsonOk(created, 201);
});

export const PATCH = withAuth("evc:schedule", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(evcUpdateSchema, await req.json());
  const existing = await prisma.evcSchedule.findUnique({ where: { id: body.id } });
  if (!existing) return jsonError("EVC schedule not found", 404);

  const application = await caseDetail(actor, existing.applicationId);
  if (!application) return jsonError("Application not found in your scope", 404);

  if (body.scheduledFor) assertFuture(body.scheduledFor);
  const memberIds = body.memberIds ? await assertValidMembers(body.memberIds) : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const evc = await tx.evcSchedule.update({
      where: { id: existing.id },
      data: {
        scheduledFor: body.scheduledFor ?? undefined,
        status: body.status ?? undefined,
        memberIds: memberIds ?? undefined,
        venue: body.venue === undefined ? undefined : body.venue,
        notes: body.notes === undefined ? undefined : body.notes,
        completedAt: body.status === "COMPLETED" ? new Date() : undefined,
      },
    });

    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "EVC_UPDATED",
        entityType: "EvcSchedule",
        entityId: evc.id,
        before: {
          scheduledFor: existing.scheduledFor.toISOString(),
          status: existing.status,
          members: existing.memberIds,
        },
        after: {
          scheduledFor: evc.scheduledFor.toISOString(),
          status: evc.status,
          members: evc.memberIds,
        },
        ip,
        userAgent,
      },
      tx,
    );

    return evc;
  });

  return jsonOk(updated);
});
