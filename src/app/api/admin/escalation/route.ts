import { Prisma } from "@prisma/client";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { escalationPolicies } from "@/lib/queries";
import { ValidationError } from "@/lib/auth/rbac";
import { escalationPolicySchema as schema } from "@/lib/admin-schemas";

export const GET = withAuth("report:read", async () => jsonOk(await escalationPolicies()));

/**
 * Rejects a ladder that would fire out of order. A higher level must never be
 * reached before a lower one, or the "most specific matching policy wins" rule
 * silently promotes the wrong rung.
 */
async function assertOrder(input: {
  id?: string;
  scope: string | null;
  regionId: string | null;
  level: number;
  afterWorkingDays: number;
}) {
  const siblings = await prisma.escalationPolicy.findMany({
    where: { scope: input.scope as never, regionId: input.regionId, ...(input.id ? { id: { not: input.id } } : {}) },
    select: { level: true, afterWorkingDays: true },
  });
  for (const s of siblings) {
    if (s.level < input.level && s.afterWorkingDays > input.afterWorkingDays) {
      throw new ValidationError(
        `Level ${input.level} would fire before level ${s.level}; a higher rung must not be reached earlier.`,
      );
    }
    if (s.level > input.level && s.afterWorkingDays < input.afterWorkingDays) {
      throw new ValidationError(
        `Level ${input.level} would fire after level ${s.level}; a lower rung must not be reached later.`,
      );
    }
  }
}

/**
 * Rejects a duplicate rung explicitly. The `@@unique([scope, regionId, level])`
 * index does not fire when `scope` or `regionId` is NULL, because Postgres
 * treats NULLs as distinct in a unique index — so a second global level-1 rung
 * would otherwise be accepted. This check is what actually enforces "one rung
 * per level per scope/region".
 */
async function assertNoDuplicate(input: {
  id?: string;
  scope: string | null;
  regionId: string | null;
  level: number;
}) {
  const existing = await prisma.escalationPolicy.findFirst({
    where: {
      scope: input.scope as never,
      regionId: input.regionId,
      level: input.level,
      ...(input.id ? { id: { not: input.id } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new ValidationError(
      `Level ${input.level} already exists for this scope and region. Edit that rung or pick another level.`,
    );
  }
}

/** Creates or updates one rung of the escalation ladder. */
export const POST = withAuth("admin:config", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(schema, await req.json());
  const scope = body.scope ?? null;
  const regionId = body.regionId ?? null;

  await assertNoDuplicate({ id: body.id, scope, regionId, level: body.level });
  await assertOrder({ id: body.id, scope, regionId, level: body.level, afterWorkingDays: body.afterWorkingDays });

  const data = {
    level: body.level,
    afterWorkingDays: body.afterWorkingDays,
    targetRole: body.targetRole,
    channel: body.channel,
    scope: scope as never,
    regionId,
    isActive: body.isActive ?? true,
    description: body.description ?? null,
  };

  try {
    const saved = await prisma.$transaction(async (tx) => {
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

    return jsonOk(saved, body.id ? 200 : 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError(
        `Level ${body.level} already exists for this scope and region. Edit that rung or pick another level.`,
        409,
      );
    }
    throw error;
  }
});
