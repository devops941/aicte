import { z } from "zod";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { holidaysList } from "@/lib/queries";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD"),
  label: z.string().min(2).max(120),
  regionId: z.string().uuid().optional().nullable(),
});

export const GET = withAuth("report:read", async () => jsonOk(await holidaysList()));

/** Adds a holiday to the calendar. The SLA calculator reads this table directly. */
export const POST = withAuth("admin:config", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(schema, await req.json());
  const date = new Date(`${body.date}T00:00:00.000Z`);

  const existing = await prisma.holiday.findFirst({
    where: { date, regionId: body.regionId ?? null },
  });
  if (existing) return jsonError("That date is already a holiday in this scope", 409);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.holiday.create({
      data: { date, label: body.label, regionId: body.regionId ?? null },
    });
    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "HOLIDAY_CREATED",
        entityType: "Holiday",
        entityId: row.id,
        after: { date: body.date, label: body.label, regionId: body.regionId ?? null },
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
  if (!id) return jsonError("A holiday id is required", 422);

  const existing = await prisma.holiday.findUnique({ where: { id } });
  if (!existing) return jsonError("Holiday not found", 404);

  await prisma.$transaction(async (tx) => {
    await tx.holiday.delete({ where: { id } });
    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "HOLIDAY_DELETED",
        entityType: "Holiday",
        entityId: id,
        before: { date: existing.date, label: existing.label },
        ip,
        userAgent,
      },
      tx,
    );
  });

  return jsonOk({ deleted: id });
});
