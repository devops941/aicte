import { z } from "zod";
import { authenticator } from "otplib";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";

const schema = z.object({
  action: z.enum(["begin", "confirm", "disable"]),
  secret: z.string().optional(),
  code: z.string().optional(),
});

/**
 * TOTP enrolment. The secret is only persisted after a code has been verified,
 * so an abandoned setup leaves the account exactly as it was.
 */
export const POST = withAuth(null, async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(schema, await req.json());

  if (body.action === "begin") {
    const secret = authenticator.generateSecret();
    const uri = authenticator.keyuri(actor.email, "AICTE Approval Portal", secret);
    return jsonOk({ secret, uri });
  }

  if (body.action === "confirm") {
    if (!body.secret || !body.code) return jsonError("A secret and a code are required", 422);
    const ok = authenticator.verify({ token: body.code.replace(/\s/g, ""), secret: body.secret });
    if (!ok) return jsonError("That code was not accepted. Check the time on your device and try again.", 422);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.id },
        data: { totpSecret: body.secret, totpEnabled: true },
      });
      await writeAudit(
        {
          actorId: actor.id,
          actorEmail: actor.email,
          action: "TOTP_ENABLED",
          entityType: "User",
          entityId: actor.id,
          ip,
          userAgent,
        },
        tx,
      );
    });
    return jsonOk({ enabled: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: { totpSecret: null, totpEnabled: false },
    });
    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "TOTP_DISABLED",
        entityType: "User",
        entityId: actor.id,
        ip,
        userAgent,
      },
      tx,
    );
  });
  return jsonOk({ enabled: false });
});
