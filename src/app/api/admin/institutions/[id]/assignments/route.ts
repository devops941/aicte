import { z } from "zod";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { institutionAssignments } from "@/lib/queries";
import { institutionAssignmentSchema as schema } from "@/lib/admin-schemas";

const uuidSchema = z.string().uuid();

export const GET = withAuth("admin:config", async (_ctx, params) => {
  if (!uuidSchema.safeParse(params.id).success) return jsonError("Invalid id", 422);
  return jsonOk(await institutionAssignments(params.id));
});

/** Assigns a user to this institution's review team. The user's own role must
 *  match the slot. An institution admin is also pinned to the institution so the
 *  existing institution-scoped queries resolve for them. */
export const POST = withAuth("admin:config", async ({ actor, req, ip, userAgent }, params) => {
  if (!uuidSchema.safeParse(params.id).success) return jsonError("Invalid id", 422);
  const body = parseBody(schema, await req.json());

  const institution = await prisma.institution.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!institution) return jsonError("Institution not found", 404);

  const user = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return jsonError("User not found", 404);
  if (user.role !== body.role) return jsonError("The user's role does not match this slot", 422);

  const duplicate = await prisma.institutionAssignment.findUnique({
    where: { institutionId_userId_role: { institutionId: params.id, userId: body.userId, role: body.role } },
    select: { id: true },
  });
  if (duplicate) return jsonError("That user is already assigned to this role here", 409);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.institutionAssignment.create({
      data: { institutionId: params.id, userId: body.userId, role: body.role, assignedById: actor.id },
      select: { id: true, role: true, user: { select: { id: true, name: true, email: true } } },
    });
    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "INSTITUTION_ASSIGNMENT_ADDED",
        entityType: "Institution",
        entityId: params.id,
        after: { userId: body.userId, role: body.role },
        ip,
        userAgent,
      },
      tx,
    );
    return row;
  });

  return jsonOk(created, 201);
});

export const DELETE = withAuth("admin:config", async ({ actor, req, ip, userAgent }, params) => {
  if (!uuidSchema.safeParse(params.id).success) return jsonError("Invalid id", 422);
  const url = new URL(req.url);
  const assignmentId = url.searchParams.get("assignmentId");
  if (!assignmentId) return jsonError("An assignmentId is required", 422);

  const existing = await prisma.institutionAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, institutionId: true, userId: true, role: true },
  });
  if (!existing || existing.institutionId !== params.id) return jsonError("Assignment not found", 404);

  await prisma.$transaction(async (tx) => {
    await tx.institutionAssignment.delete({ where: { id: assignmentId } });
    if (existing.role === "INSTITUTION_ADMIN") {
      await tx.user.updateMany({ where: { id: existing.userId, institutionId: params.id }, data: { institutionId: null } });
    }
    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "INSTITUTION_ASSIGNMENT_REMOVED",
        entityType: "Institution",
        entityId: params.id,
        before: { userId: existing.userId, role: existing.role },
        ip,
        userAgent,
      },
      tx,
    );
  });

  return jsonOk({ deleted: assignmentId });
});
