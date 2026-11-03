import { z } from "zod";
import { jsonOk, parseBody, withAuth } from "@/lib/api";
import { performTransition } from "@/lib/workflow/service";
import { assertCan } from "@/lib/auth/rbac";

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
 * Applies one workflow move. Checks permission appropriate for the specific action,
 * allowing institutions to submit/withdraw/respond and officers to scrutinize/forward/decide.
 * The service enforces the transition guard, role rules, remarks and row-level scope.
 */
export const POST = withAuth(null, async ({ actor, req, ip, userAgent }, params) => {
  const body = parseBody(schema, await req.json());

  if (body.action === "SUBMIT" || body.action === "RESUBMIT") {
    assertCan(actor, "application:submit");
  } else if (body.action === "WITHDRAW") {
    assertCan(actor, "application:withdraw");
  } else if (body.action === "RESPOND_CLARIFICATION") {
    assertCan(actor, "clarification:respond");
  } else if (body.action === "APPROVE" || body.action === "REJECT") {
    assertCan(actor, "decision:record");
  } else {
    assertCan(actor, "workflow:transition");
  }

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
