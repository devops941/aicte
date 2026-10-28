import { z } from "zod";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { dedupe } from "@/lib/notifications/outbox";

const schema = z.object({
  decision: z.enum(["ACCEPTED", "REJECTED"]),
  remark: z.string().max(2000).optional().nullable(),
});

/** Officer verification of submitted compliance evidence. */
export const POST = withAuth("compliance:verify", async ({ actor, req, ip, userAgent }, params) => {
  const submission = await prisma.complianceSubmission.findUnique({
    where: { id: params.id },
    include: { undertaking: { include: { institution: { select: { id: true } } } } },
  });
  if (!submission) return jsonError("Submission not found", 404);

  const body = parseBody(schema, await req.json());

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.complianceSubmission.update({
      where: { id: submission.id },
      data: {
        status: body.decision,
        verifierId: actor.id,
        remark: body.remark?.trim() || null,
        verifiedAt: new Date(),
      },
    });

    await tx.undertaking.update({
      where: { id: submission.undertakingId },
      data: { status: body.decision === "ACCEPTED" ? "VERIFIED" : "REJECTED" },
    });

    const recipients = await tx.user.findMany({
      where: { role: "INSTITUTION_ADMIN", institutionId: submission.undertaking.institutionId, isActive: true },
      select: { id: true },
    });

    if (recipients.length > 0) {
      await tx.notification.createMany({
        skipDuplicates: true,
        data: dedupe(
          recipients.map((r) => ({
            userId: r.id,
            kind: "UNDERTAKING_DUE" as const,
            dedupeKey: `compliance:${submission.id}:${body.decision}:${r.id}`,
            channel: "IN_APP" as const,
            title: `Evidence ${body.decision === "ACCEPTED" ? "accepted" : "rejected"}: ${submission.undertaking.title}`,
            body: body.remark?.trim() || undefined,
            link: "/compliance",
            entityType: "Undertaking",
            entityId: submission.undertakingId,
          })),
        ),
      });
    }

    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: `COMPLIANCE_${body.decision}`,
        entityType: "ComplianceSubmission",
        entityId: submission.id,
        before: { status: submission.status },
        after: { status: body.decision, remark: body.remark?.trim() || null },
        ip,
        userAgent,
      },
      tx,
    );

    return updated;
  });

  return jsonOk(result);
});
