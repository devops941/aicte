import { z } from "zod";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { institutionScope } from "@/lib/auth/rbac";
import {
  institutionCreateSchema as createSchema,
  institutionUpdateSchema as updateSchema,
} from "@/lib/admin-schemas";
import type { Prisma } from "@prisma/client";

const listQuery = z.object({
  search: z.string().max(120).optional(),
  regionId: z.string().uuid().optional(),
  state: z.string().max(80).optional(),
  active: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  sort: z.enum(["name", "recent"]).default("name"),
});

/**
 * Institution administration. Listing honours the viewer's scope; creating and
 * editing require `admin:config`. An institution is never hard-deleted while it
 * has records — it is deactivated instead, so its application history survives.
 */
export const GET = withAuth("application:read", async ({ actor, req }) => {
  const url = new URL(req.url);
  const query = listQuery.parse({
    search: url.searchParams.get("search") ?? undefined,
    regionId: url.searchParams.get("regionId") ?? undefined,
    state: url.searchParams.get("state") ?? undefined,
    active: url.searchParams.get("active") ?? undefined,
    page: url.searchParams.get("page") ?? 1,
    pageSize: url.searchParams.get("pageSize") ?? 20,
    sort: url.searchParams.get("sort") ?? "name",
  });

  const scope = institutionScope(actor);
  const extra: Prisma.InstitutionWhereInput = {};
  if (query.search) {
    extra.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { aicteId: { contains: query.search, mode: "insensitive" } },
      { city: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.regionId) extra.regionId = query.regionId;
  if (query.state) extra.state = query.state;
  if (query.active) extra.isActive = query.active === "true";

  const where: Prisma.InstitutionWhereInput =
    Object.keys(scope).length === 0 ? extra : { AND: [scope, extra] };

  const orderBy: Prisma.InstitutionOrderByWithRelationInput =
    query.sort === "recent" ? { createdAt: "desc" } : { name: "asc" };

  const [rows, total] = await Promise.all([
    prisma.institution.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        region: { select: { id: true, name: true, code: true } },
        _count: { select: { applications: true, users: true, undertakings: true } },
      },
    }),
    prisma.institution.count({ where }),
  ]);

  return jsonOk({
    rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  });
});

/** Creates an institution. The AICTE id is unique and enforced by the database. */
export const POST = withAuth("admin:config", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(createSchema, await req.json());

  const duplicate = await prisma.institution.findFirst({
    where: { aicteId: { equals: body.aicteId.trim(), mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) return jsonError("An institution with that AICTE id already exists", 409);

  const region = await prisma.region.findUnique({ where: { id: body.regionId }, select: { id: true } });
  if (!region) return jsonError("Region not found", 422);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.institution.create({
      data: {
        aicteId: body.aicteId.trim(),
        name: body.name.trim(),
        state: body.state.trim(),
        district: body.district?.trim() || null,
        city: body.city?.trim() || null,
        regionId: body.regionId,
        contactEmail: body.contactEmail?.trim() || null,
        contactPhone: body.contactPhone?.trim() || null,
      },
    });
    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "INSTITUTION_CREATED",
        entityType: "Institution",
        entityId: row.id,
        after: { aicteId: row.aicteId, name: row.name, regionId: row.regionId },
        ip,
        userAgent,
      },
      tx,
    );
    return row;
  });

  return jsonOk(created, 201);
});

/** Edits an institution or flips its active flag. Deactivation is preferred over deletion. */
export const PATCH = withAuth("admin:config", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(updateSchema, await req.json());

  const existing = await prisma.institution.findUnique({ where: { id: body.id } });
  if (!existing) return jsonError("Institution not found", 404);

  // A regional officer may only touch institutions inside their own region.
  const scope = institutionScope(actor);
  if (Object.keys(scope).length > 0) {
    const inScope = await prisma.institution.findFirst({ where: { AND: [scope, { id: body.id }] } });
    if (!inScope) return jsonError("That institution is outside your scope", 403);
  }

  if (body.regionId) {
    const region = await prisma.region.findUnique({ where: { id: body.regionId }, select: { id: true } });
    if (!region) return jsonError("Region not found", 422);
  }

  const data: Prisma.InstitutionUpdateInput = {
    ...(body.aicteId !== undefined ? { aicteId: body.aicteId.trim() } : {}),
    ...(body.name !== undefined ? { name: body.name.trim() } : {}),
    ...(body.state !== undefined ? { state: body.state.trim() } : {}),
    ...(body.district !== undefined ? { district: body.district?.trim() || null } : {}),
    ...(body.city !== undefined ? { city: body.city?.trim() || null } : {}),
    ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail?.trim() || null } : {}),
    ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone?.trim() || null } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    ...(body.regionId !== undefined ? { region: { connect: { id: body.regionId } } } : {}),
  };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.institution.update({ where: { id: body.id }, data });
    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action:
          body.isActive === false
            ? "INSTITUTION_DEACTIVATED"
            : body.isActive === true
              ? "INSTITUTION_ACTIVATED"
              : "INSTITUTION_UPDATED",
        entityType: "Institution",
        entityId: row.id,
        before: { name: existing.name, isActive: existing.isActive, regionId: existing.regionId },
        after: { name: row.name, isActive: row.isActive, regionId: row.regionId, reason: body.reason?.trim() || null },
        ip,
        userAgent,
      },
      tx,
    );
    return row;
  });

  return jsonOk(updated);
});
