import { z } from "zod";
import { jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { escalationPolicies } from "@/lib/queries";

const schema = z.object({
  id: z.string().uuid().optional(),
  level: z.coerce.number().int().min(1).max(10),
  afterWorkingDays: z.coerce.number().int().min(0).max(365),
  targetRole: z.enum([
    "INSTITUTION_ADMIN",
    "REGIONAL_OFFICER",
    "BUREAU_OFFICER",
    "EVC_MEMBER",
    "COMPETENT_AUTHORITY",
    "SYSTEM_ADMIN",
    "AUDITOR",
  ]),
  channel: z.enum(["IN_APP", "EMAIL"]),
  scope: z
    .enum(["NEW_ENGINEERING", "EXTENSION_OF_APPROVAL", "INCREASE_IN_INTAKE", "NEW_COURSE", "CLOSURE", "OTHERS"])
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
  description: z.string().max(300).optional().nullable(),
});

export const GET = withAuth("report:read", async () => jsonOk(await escalationPolicies()));

/** Creates or updates one rung of the escalation ladder. */
export const POST = withAuth("admin:config", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(schema, await req.json());

  const saved = await prisma.$transaction(async (tx) => {
    const data = {
      level: body.level,
      afterWorkingDays: body.afterWorkingDays,
      targetRole: body.targetRole,
      channel: body.channel,
      scope: body.scope ?? null,
      isActive: body.isActive ?? true,
      description: body.description ?? null,
    };

    const row = body.id
      ? await tx.escalationPolicy.update({ where: { id: body.id }, data })
      : await tx.escalationPolicy.create({ data });

    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: body.id ? "ESCALATION_UPDATED" : "ESCALATION_CREATED",
        entityType: "EscalationPolicy",
        entityId: row.id,
        after: data,
        ip,
        userAgent,
      },
      tx,
    );

    return row;
  });

  return jsonOk(saved, 201);
});
