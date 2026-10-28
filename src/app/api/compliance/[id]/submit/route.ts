import { z } from "zod";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";

const schema = z.object({
  remark: z.string().max(2000).optional().nullable(),
  documentId: z.string().uuid().optional().nullable(),
});

/** Institution submits evidence against an undertaking it owns. */
export const POST = withAuth("compliance:submit", async ({ actor, req, ip, userAgent }, params) => {
  const undertaking = await prisma.undertaking.findUnique({ where: { id: params.id } });
  if (!undertaking) return jsonError("Undertaking not found", 404);
  if (undertaking.institutionId !== actor.institutionId) {
    return jsonError("This undertaking belongs to another institution", 403);
  }

  const body = parseBody(schema, await req.json());

  const created = await prisma.$transaction(async (tx) => {
    const submission = await tx.complianceSubmission.create({
      data: {
        undertakingId: undertaking.id,
        documentId: body.documentId ?? null,
        remark: body.remark?.trim() || null,
        status: "PENDING",
      },
    });
    await tx.undertaking.update({ where: { id: undertaking.id }, data: { status: "SUBMITTED" } });
    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "COMPLIANCE_SUBMITTED",
        entityType: "Undertaking",
        entityId: undertaking.id,
        after: { submissionId: submission.id, remark: body.remark?.trim() || null },
        ip,
        userAgent,
      },
      tx,
    );
    return submission;
  });

  return jsonOk(created, 201);
});
