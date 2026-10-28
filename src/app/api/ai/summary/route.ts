import { z } from "zod";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { caseDetail } from "@/lib/queries";
import { summariseCase } from "@/lib/ai";

const schema = z.object({ applicationId: z.string().uuid() });

/**
 * Short case summary with citations to the underlying history entries. It is
 * never saved as a remark: the officer must write that themselves.
 */
export const POST = withAuth("application:read", async ({ actor, req }) => {
  const body = parseBody(schema, await req.json());
  const application = await caseDetail(actor, body.applicationId);
  if (!application) return jsonError("Application not found in your scope", 404);

  const summary = summariseCase(
    application.stageHistory.map((h) => ({
      id: h.id,
      action: h.action,
      remark: h.remark,
      at: h.enteredAt,
      actor: h.actor?.name ?? null,
    })),
    `${application.appNo} ${application.title}`,
  );

  return jsonOk({ summary });
});
