import { z } from "zod";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { caseDetail } from "@/lib/queries";
import { dedupe } from "@/lib/notifications/outbox";
import { evcReminderKey } from "@/lib/notifications/outbox";

const createSchema = z.object({
  applicationId: z.string().uuid(),
  scheduledFor: z.string().min(8),
  memberIds: z.array(z.string().uuid()).min(1).max(8),
  venue: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  scheduledFor: z.string().min(8).optional(),
  status: z.enum(["PROPOSED", "SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
  memberIds: z.array(z.string().uuid()).max(8).optional(),
  venue: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/** Schedules or reschedules an EVC visit. Rescheduling keeps history and notifies members. */
export const POST = withAuth("evc:schedule", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(createSchema, await req.json());
  const application = await caseDetail(actor, body.applicationId);
  if (!application) return jsonError("Application not found in your scope", 404);

  const created = await prisma.$transaction(async (tx) => {
    const evc = await tx.evcSchedule.create({
      data: {
        applicationId: application.id,
        scheduledFor: new Date(body.scheduledFor),
        memberIds: body.memberIds,
        venue: body.venue ?? null,
        notes: body.notes ?? null,
        status: "SCHEDULED",
      },
    });

    await tx.notification.createMany({
      skipDuplicates: true,
      data: dedupe(
        body.memberIds.map((memberId) => ({
          userId: memberId,
          kind: "EVC_REMINDER" as const,
          dedupeKey: `${evcReminderKey(evc.id, 7)}:${memberId}:created`,
          channel: "EMAIL" as const,
          title: `EVC visit scheduled for ${application.appNo}`,
          body: `${application.title}${body.venue ? ` at ${body.venue}` : ""} on ${new Date(body.scheduledFor).toISOString().slice(0, 10)}.`,
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
        after: { applicationId: application.id, scheduledFor: body.scheduledFor, members: body.memberIds.length },
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
  const body = parseBody(updateSchema, await req.json());
  const existing = await prisma.evcSchedule.findUnique({ where: { id: body.id } });
  if (!existing) return jsonError("EVC schedule not found", 404);

  const application = await caseDetail(actor, existing.applicationId);
  if (!application) return jsonError("Application not found in your scope", 404);

  const updated = await prisma.$transaction(async (tx) => {
    const evc = await tx.evcSchedule.update({
      where: { id: existing.id },
      data: {
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : undefined,
        status: body.status ?? undefined,
        memberIds: body.memberIds ?? undefined,
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
        before: { scheduledFor: existing.scheduledFor, status: existing.status },
        after: { scheduledFor: evc.scheduledFor, status: evc.status },
        ip,
        userAgent,
      },
      tx,
    );

    return evc;
  });

  return jsonOk(updated);
});
