import { z } from "zod";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { caseDetail } from "@/lib/queries";
import { outstandingChecklist } from "@/lib/ai";
import { CHECKLIST_BY_TYPE } from "@/lib/constants";

const schema = z.object({ applicationId: z.string().uuid() });

/** Outstanding checklist items, derived from configuration, not from a model. */
export const POST = withAuth("application:read", async ({ actor, req }) => {
  const body = parseBody(schema, await req.json());
  const application = await caseDetail(actor, body.applicationId);
  if (!application) return jsonError("Application not found in your scope", 404);

  const required = CHECKLIST_BY_TYPE[application.type] ?? [];
  const result = outstandingChecklist({
    applicationType: application.type,
    submittedKinds: application.documents.map((d) => d.kind),
    required,
  });

  return jsonOk({ checklist: result, required });
});
