import { jsonError, jsonOk, withAuth } from "@/lib/api";
import { caseDetail } from "@/lib/queries";
import { holidaySetFor, liveSla } from "@/lib/queries";
import { availableActions } from "@/lib/workflow/engine";
import type { StageRow, TransitionRow } from "@/lib/workflow/engine";

export const GET = withAuth("application:read", async ({ actor }, params) => {
  const application = await caseDetail(actor, params.id);
  if (!application) return jsonError("Application not found in your scope", 404);

  const stages = (application.workflowVersion?.stages ?? []) as unknown as StageRow[];
  const transitions = (application.workflowVersion?.stages ?? []).flatMap((s) => s.outgoing) as unknown as TransitionRow[];

  const { build } = await holidaySetFor([application.regionId]);
  const sla = liveSla(
    application.slaDueAt,
    application.slaPausedAt,
    application.currentStage?.slaWorkingDays ?? 10,
    build(application.regionId),
  );

  const actions = availableActions({
    snapshot: {
      id: application.id,
      status: application.status,
      currentStageId: application.currentStageId,
    },
    stages,
    transitions,
    actorRole: actor.role,
    hasOpenClarification: application.clarifications.some((c) => c.status === "OPEN"),
  });

  return jsonOk({ application, sla, actions });
});
