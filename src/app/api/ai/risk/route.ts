import { z } from "zod";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { caseDetail, stageAnalytics, officerWorkload, holidaySetFor, liveSla } from "@/lib/queries";
import { delayRisk } from "@/lib/ai";

const schema = z.object({ applicationId: z.string().uuid() });

/**
 * Delay-risk score. Rule-based, and every contributing factor is returned so
 * the officer can see why a case was flagged rather than trusting a bare label.
 */
export const POST = withAuth("application:read", async ({ actor, req }) => {
  const body = parseBody(schema, await req.json());
  const application = await caseDetail(actor, body.applicationId);
  if (!application) return jsonError("Application not found in your scope", 404);

  const [stages, workload] = await Promise.all([stageAnalytics(actor), officerWorkload(actor)]);
  const { build } = await holidaySetFor([application.regionId]);

  const slaDays = application.currentStage?.slaWorkingDays ?? 10;
  const position = liveSla(application.slaDueAt, application.slaPausedAt, slaDays, build(application.regionId));
  const owner = application.assignments[0]?.user.name;

  const risk = delayRisk({
    stageAgeWorkingDays: position.elapsed,
    slaWorkingDays: slaDays,
    openCasesForOwner: workload.find((w) => w.name === owner)?.open ?? 0,
    clarificationsRaised: application.clarifications.length,
    avgStageDaysForType: stages.find((s) => s.stage === application.currentStage?.name)?.avgDays ?? 0,
  });

  return jsonOk({ risk, position });
});
