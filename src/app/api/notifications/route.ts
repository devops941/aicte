import { z } from "zod";
import { jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notificationsFor } from "@/lib/queries";

const schema = z.object({
  ids: z.array(z.string().uuid()).max(200).optional(),
  markAll: z.boolean().optional(),
});

export const GET = withAuth("notification:read", async ({ actor, req }) => {
  const url = new URL(req.url);
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 60));
  const rows = await notificationsFor(actor.id, limit);
  const unread = await prisma.notification.count({ where: { userId: actor.id, readAt: null, status: "SENT" } });
  return jsonOk({ rows, unread });
});

/** Marks notifications read. Scoped to the actor, so nobody can clear another user's alerts. */
export const PATCH = withAuth("notification:read", async ({ actor, req }) => {
  const body = parseBody(schema, await req.json());
  const result = await prisma.notification.updateMany({
    where: {
      userId: actor.id,
      ...(body.markAll ? {} : { id: { in: body.ids ?? [] } }),
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return jsonOk({ updated: result.count });
});
