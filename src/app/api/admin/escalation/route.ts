import { jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { escalationPolicies } from "@/lib/queries";
import { escalationPolicySchema as schema } from "@/lib/admin-schemas";

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
