import { notFound } from "next/navigation";
import { requirePageActor } from "@/lib/auth/session";
import { caseDetail, holidaySetFor, liveSla } from "@/lib/queries";
import { availableActions, type StageRow, type TransitionRow } from "@/lib/workflow/engine";
import { CaseDetail } from "@/components/case-detail";
import { can } from "@/lib/auth/rbac";

/**
 * Shared loader for the officer and institution case pages. Both render the same
 * detail view; only the route prefix differs, so the data shaping lives here.
 */
export async function CaseDetailRoute({ id }: { id: string }) {
  const actor = await requirePageActor();
  const application = await caseDetail(actor, id);
  if (!application) notFound();

  const stages = (application.workflowVersion?.stages ?? []) as unknown as StageRow[];
  const transitions = (application.workflowVersion?.stages ?? []).flatMap((s) => s.outgoing) as unknown as TransitionRow[];
  const hasOpenClarification = application.clarifications.some((c) => c.status === "OPEN");

  const { build } = await holidaySetFor([application.regionId]);
  const slaDays = application.currentStage?.slaWorkingDays ?? 10;
  const sla = liveSla(application.slaDueAt, application.slaPausedAt, slaDays, build(application.regionId));

  const actions = availableActions({
    snapshot: { id: application.id, status: application.status, currentStageId: application.currentStageId },
    stages,
    transitions,
    actorRole: actor.role,
    hasOpenClarification,
  });

  return (
    <CaseDetail
      application={{
        id: application.id,
        appNo: application.appNo,
        title: application.title,
        type: application.type,
        status: application.status,
        summary: application.summary,
        submittedAt: application.submittedAt?.toISOString() ?? null,
        slaDueAt: application.slaDueAt?.toISOString() ?? null,
        slaPausedAt: application.slaPausedAt?.toISOString() ?? null,
        currentStageId: application.currentStageId,
        institution: {
          name: application.institution.name,
          aicteId: application.institution.aicteId,
          state: application.institution.state,
        },
      }}
      stages={stages.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        sequence: s.sequence,
        slaWorkingDays: s.slaWorkingDays,
        isInitial: s.isInitial,
        isTerminal: s.isTerminal,
        assigneeRole: s.assigneeRole,
      }))}
      actions={actions.map((a) => ({
        action: a.action,
        label: a.label ?? null,
        requiresRemark: a.requiresRemark,
        requiredRole: a.requiredRole,
      }))}
      sla={sla}
      history={application.stageHistory.map((h) => ({
        id: h.id,
        action: h.action,
        remark: h.remark,
        enteredAt: h.enteredAt.toISOString(),
        exitedAt: h.exitedAt?.toISOString() ?? null,
        daysInStage: h.daysInStage,
        slaMet: h.slaMet,
        stage: h.stage ? { name: h.stage.name, code: h.stage.code } : null,
        actor: h.actor ? { name: h.actor.name, role: h.actor.role } : null,
      }))}
      clarifications={application.clarifications.map((c) => ({
        id: c.id,
        reason: c.reason,
        response: c.response,
        status: c.status,
        dueAt: c.dueAt?.toISOString() ?? null,
        respondedAt: c.respondedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        raisedBy: c.raisedBy ? { name: c.raisedBy.name, role: c.raisedBy.role } : null,
        respondedBy: c.respondedBy ? { name: c.respondedBy.name, role: c.respondedBy.role } : null,
      }))}
      documents={application.documents.map((d) => ({
        id: d.id,
        kind: d.kind,
        label: d.label,
        fileName: d.fileName,
        createdAt: d.createdAt.toISOString(),
        expiresAt: d.expiresAt?.toISOString() ?? null,
      }))}
      evcSchedules={application.evcSchedules.map((e) => ({
        id: e.id,
        scheduledFor: e.scheduledFor.toISOString(),
        status: e.status,
        memberIds: e.memberIds,
        venue: e.venue,
      }))}
      canRespond={can(actor.role, "clarification:respond")}
      canUpload={can(actor.role, "application:update")}
    />
  );
}
