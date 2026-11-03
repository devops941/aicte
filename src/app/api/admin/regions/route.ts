import { z } from "zod";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma, TX_OPTIONS } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { regionsDirectory } from "@/lib/queries";
import { regionCreateSchema as schema } from "@/lib/admin-schemas";

export const GET = withAuth("admin:config", async () => jsonOk(await regionsDirectory()));

/**
 * Creates a region. Institutions, users and holidays all pick a region from this
 * table, so a region added here appears in those dropdowns immediately.
 */
export const POST = withAuth("admin:config", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(schema, await req.json());
  const code = body.code.trim().toUpperCase();
  const name = body.name.trim();

  const existing = await prisma.region.findFirst({
    where: { code: { equals: code, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return jsonError("A region with that code already exists", 409);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.region.create({ data: { code, name } });
    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "REGION_CREATED",
        entityType: "Region",
        entityId: row.id,
        after: { code, name },
        ip,
        userAgent,
      },
      tx,
    );
    return row;
  });

  return jsonOk(created, 201);
});

export const DELETE = withAuth("admin:config", async ({ actor, req, ip, userAgent }) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonError("A region id is required", 422);
  if (!z.string().uuid().safeParse(id).success) return jsonError("Invalid id", 422);

  const existing = await prisma.region.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, _count: { select: { institutions: true, users: true } } },
  });
  if (!existing) return jsonError("Region not found", 404);
  if (existing._count.institutions > 0 || existing._count.users > 0) {
    return jsonError("Reassign or remove its institutions and users before deleting this region", 409);
  }

  await prisma.$transaction(async (tx) => {
    await tx.region.delete({ where: { id } });
    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "REGION_DELETED",
        entityType: "Region",
        entityId: id,
        before: { code: existing.code, name: existing.name },
        ip,
        userAgent,
      },
      tx,
    );
  });

  return jsonOk({ deleted: id });
});
