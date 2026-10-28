import { z } from "zod";
import { jsonOk, parseBody, withAuth } from "@/lib/api";
import { performTransition } from "@/lib/workflow/service";

const schema = z.object({
  response: z.string().min(3).max(4000),
});

/**
 * The institution's answer to a clarification request. This is the transition
 * that restarts the SLA clock, so it goes through the same guarded path as any
 * other move rather than writing to the clarification row directly.
 */
export const POST = withAuth("clarification:respond", async ({ actor, req, ip, userAgent }, params) => {
  const body = parseBody(schema, await req.json());
  const outcome = await performTransition({
    actor,
    applicationId: params.id,
    action: "RESPOND_CLARIFICATION",
    remark: body.response,
    ip,
    userAgent,
  });
  return jsonOk(outcome);
});
