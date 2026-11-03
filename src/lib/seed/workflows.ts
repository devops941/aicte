import { type ApplicationType, type Role, type PrismaClient } from "@prisma/client";

type StageDef = {
  code: string;
  name: string;
  sla: number;
  role: Role;
  initial?: boolean;
  terminal?: boolean;
  description?: string;
};

type EdgeDef = {
  from: string;
  to: string;
  action: string;
  role: Role;
  remark?: boolean;
  label?: string;
};

/** Illustrative default routes. Replace SLA days with the current handbook values. */
export const WORKFLOWS: Record<ApplicationType, { code: string; name: string; stages: StageDef[]; edges: EdgeDef[] }> = {
  NEW_ENGINEERING: {
    code: "WF-NEW-ENG",
    name: "New Engineering Institution Approval",
    stages: [
      { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN", initial: true },
      { code: "SCRUTINY", name: "Scrutiny", sla: 10, role: "REGIONAL_OFFICER" },
      { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" },
      { code: "EVC", name: "Expert Visit Committee", sla: 20, role: "EVC_MEMBER" },
      { code: "BUREAU_REVIEW", name: "Bureau Review", sla: 12, role: "BUREAU_OFFICER" },
      { code: "DECISION", name: "Competent Authority Decision", sla: 15, role: "COMPETENT_AUTHORITY" },
      { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
      { code: "REJECTED", name: "Rejected", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
    ],
    edges: [
      { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" },
      { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER", remark: true },
      { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN", remark: true },
      { from: "SCRUTINY", to: "EVC", action: "FORWARD", role: "REGIONAL_OFFICER", remark: true },
      { from: "EVC", to: "BUREAU_REVIEW", action: "COMPLETE_EVC", role: "EVC_MEMBER", remark: true },
      { from: "BUREAU_REVIEW", to: "DECISION", action: "FORWARD", role: "BUREAU_OFFICER", remark: true },
      { from: "DECISION", to: "APPROVED", action: "APPROVE", role: "COMPETENT_AUTHORITY", remark: true },
      { from: "DECISION", to: "REJECTED", action: "REJECT", role: "COMPETENT_AUTHORITY", remark: true },
    ],
  },
  EXTENSION_OF_APPROVAL: {
    code: "WF-EOA",
    name: "Extension of Approval",
    stages: [
      { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN", initial: true },
      { code: "SCRUTINY", name: "Scrutiny", sla: 8, role: "REGIONAL_OFFICER" },
      { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" },
      { code: "BUREAU_REVIEW", name: "Bureau Review", sla: 10, role: "BUREAU_OFFICER" },
      { code: "DECISION", name: "Competent Authority Decision", sla: 12, role: "COMPETENT_AUTHORITY" },
      { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
      { code: "REJECTED", name: "Rejected", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
    ],
    edges: [
      { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" },
      { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER", remark: true },
      { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN", remark: true },
      { from: "SCRUTINY", to: "BUREAU_REVIEW", action: "FORWARD", role: "REGIONAL_OFFICER", remark: true },
      { from: "BUREAU_REVIEW", to: "DECISION", action: "FORWARD", role: "BUREAU_OFFICER", remark: true },
      { from: "DECISION", to: "APPROVED", action: "APPROVE", role: "COMPETENT_AUTHORITY", remark: true },
      { from: "DECISION", to: "REJECTED", action: "REJECT", role: "COMPETENT_AUTHORITY", remark: true },
    ],
  },
  INCREASE_IN_INTAKE: {
    code: "WF-INTAKE",
    name: "Increase in Intake",
    stages: [
      { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN", initial: true },
      { code: "SCRUTINY", name: "Scrutiny", sla: 7, role: "REGIONAL_OFFICER" },
      { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" },
      { code: "EVC", name: "Expert Visit Committee", sla: 15, role: "EVC_MEMBER" },
      { code: "DECISION", name: "Competent Authority Decision", sla: 10, role: "COMPETENT_AUTHORITY" },
      { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
      { code: "REJECTED", name: "Rejected", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
    ],
    edges: [
      { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" },
      { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER", remark: true },
      { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN", remark: true },
      { from: "SCRUTINY", to: "EVC", action: "FORWARD", role: "REGIONAL_OFFICER", remark: true },
      { from: "EVC", to: "DECISION", action: "COMPLETE_EVC", role: "EVC_MEMBER", remark: true },
      { from: "DECISION", to: "APPROVED", action: "APPROVE", role: "COMPETENT_AUTHORITY", remark: true },
      { from: "DECISION", to: "REJECTED", action: "REJECT", role: "COMPETENT_AUTHORITY", remark: true },
    ],
  },
  NEW_COURSE: {
    code: "WF-COURSE",
    name: "New Course Approval",
    stages: [
      { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN", initial: true },
      { code: "SCRUTINY", name: "Scrutiny", sla: 8, role: "REGIONAL_OFFICER" },
      { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" },
      { code: "BUREAU_REVIEW", name: "Bureau Review", sla: 10, role: "BUREAU_OFFICER" },
      { code: "DECISION", name: "Competent Authority Decision", sla: 12, role: "COMPETENT_AUTHORITY" },
      { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
      { code: "REJECTED", name: "Rejected", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
    ],
    edges: [
      { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" },
      { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER", remark: true },
      { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN", remark: true },
      { from: "SCRUTINY", to: "BUREAU_REVIEW", action: "FORWARD", role: "REGIONAL_OFFICER", remark: true },
      { from: "BUREAU_REVIEW", to: "DECISION", action: "FORWARD", role: "BUREAU_OFFICER", remark: true },
      { from: "DECISION", to: "APPROVED", action: "APPROVE", role: "COMPETENT_AUTHORITY", remark: true },
      { from: "DECISION", to: "REJECTED", action: "REJECT", role: "COMPETENT_AUTHORITY", remark: true },
    ],
  },
  CLOSURE: {
    code: "WF-CLOSURE",
    name: "Institution Closure",
    stages: [
      { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN", initial: true },
      { code: "SCRUTINY", name: "Scrutiny", sla: 10, role: "REGIONAL_OFFICER" },
      { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" },
      { code: "DECISION", name: "Competent Authority Decision", sla: 15, role: "COMPETENT_AUTHORITY" },
      { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
      { code: "REJECTED", name: "Rejected", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
    ],
    edges: [
      { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" },
      { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER", remark: true },
      { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN", remark: true },
      { from: "SCRUTINY", to: "DECISION", action: "FORWARD", role: "REGIONAL_OFFICER", remark: true },
      { from: "DECISION", to: "APPROVED", action: "APPROVE", role: "COMPETENT_AUTHORITY", remark: true },
      { from: "DECISION", to: "REJECTED", action: "REJECT", role: "COMPETENT_AUTHORITY", remark: true },
    ],
  },
  OTHERS: {
    code: "WF-OTHERS",
    name: "Other Applications",
    stages: [
      { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN", initial: true },
      { code: "SCRUTINY", name: "Scrutiny", sla: 10, role: "REGIONAL_OFFICER" },
      { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" },
      { code: "DECISION", name: "Competent Authority Decision", sla: 15, role: "COMPETENT_AUTHORITY" },
      { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
      { code: "REJECTED", name: "Rejected", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
    ],
    edges: [
      { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" },
      { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER", remark: true },
      { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN", remark: true },
      { from: "SCRUTINY", to: "DECISION", action: "FORWARD", role: "REGIONAL_OFFICER", remark: true },
      { from: "DECISION", to: "APPROVED", action: "APPROVE", role: "COMPETENT_AUTHORITY", remark: true },
      { from: "DECISION", to: "REJECTED", action: "REJECT", role: "COMPETENT_AUTHORITY", remark: true },
    ],
  },
};

export async function seedWorkflows(db: PrismaClient): Promise<void> {
  const created: Record<string, string> = {};
  for (const [type, def] of Object.entries(WORKFLOWS)) {
    const existing = await db.workflowDefinition.findFirst({
      where: { code: def.code, version: 1 },
      select: { id: true },
    });
    const definition =
      existing ??
      (await db.workflowDefinition.create({
        data: {
          code: def.code,
          name: def.name,
          applicationType: type as ApplicationType,
          version: 1,
          isActive: true,
          description: `Default routing for ${def.name}. Stage names and SLA days are illustrative; update from the Approval Process Handbook.`,
        },
        select: { id: true },
      }));

    if (existing) {
      created[type] = existing.id;
      continue;
    }

    const stageIds: Record<string, string> = {};
    for (const [index, stage] of def.stages.entries()) {
      const row = await db.workflowStage.create({
        data: {
          definitionId: definition.id,
          code: stage.code,
          name: stage.name,
          sequence: index,
          slaWorkingDays: stage.sla,
          isInitial: Boolean(stage.initial),
          isTerminal: Boolean(stage.terminal),
          assigneeRole: stage.role,
          description: stage.description ?? null,
        },
        select: { id: true },
      });
      stageIds[stage.code] = row.id;
    }

    for (const edge of def.edges) {
      await db.workflowTransition.create({
        data: {
          fromStageId: stageIds[edge.from],
          toStageId: stageIds[edge.to],
          action: edge.action as never,
          requiredRole: edge.role,
          requiresRemark: Boolean(edge.remark),
          label: edge.label ?? null,
        },
      });
    }
    created[type] = definition.id;
    console.log(`  workflow ${def.code} v1 created`);
  }
  return void created;
}
