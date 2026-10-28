import { z } from "zod";
import { jsonOk, parseBody, withAuth } from "@/lib/api";
import { performTransition } from "@/lib/workflow/service";

const schema = z.object({
  action: z.enum([
    "SUBMIT",
    "SCRUTINIZE",
    "RETURN_FOR_CLARIFICATION",
    "RESPOND_CLARIFICATION",
    "FORWARD",
    "RE_SCRUTINIZE",
    "SCHEDULE_EVC",
    "COMPLETE_EVC",
    "RECOMMEND",
    "APPROVE",
    "REJECT",
    "WITHDRAW",
    "RESUBMIT",
  ]),
  remark: z.string().max(4000).optional().nullable(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Applies one workflow move. The service enforces the transition guard, role,
 * remark rule and row-level scope; this handler only parses and reports.
 */
export const POST = withAuth("workflow:transition", async ({ actor, req, ip, userAgent }, params) => {
  const body = parseBody(schema, await req.json());
  const outcome = await performTransition({
    actor,
    applicationId: params.id,
    action: body.action,
    remark: body.remark,
    payload: body.payload,
    ip,
    userAgent,
  });
  return jsonOk(outcome);
});
