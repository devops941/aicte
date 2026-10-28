import { describe, expect, it } from "vitest";
import {
  availableActions,
  guardTransition,
  isClosed,
  statusAfterTransition,
  type StageRow,
  type TransitionRow,
} from "@/lib/workflow/engine";
import type { ApplicationStatus, Role, WorkflowAction } from "@prisma/client";

const stage = (over: Partial<StageRow> & { id: string; code: string }): StageRow => ({
  name: over.code,
  sequence: 0,
  slaWorkingDays: 10,
  isInitial: false,
  isTerminal: false,
  assigneeRole: "REGIONAL_OFFICER" as Role,
  ...over,
});

const STAGES: StageRow[] = [
  stage({ id: "s-sub", code: "SUBMITTED", isInitial: true, assigneeRole: "INSTITUTION_ADMIN" as Role }),
  stage({ id: "s-scr", code: "SCRUTINY", sequence: 1 }),
  stage({ id: "s-clar", code: "CLARIFICATION", sequence: 2, assigneeRole: "INSTITUTION_ADMIN" as Role }),
  stage({ id: "s-dec", code: "DECISION", sequence: 3, assigneeRole: "COMPETENT_AUTHORITY" as Role }),
  stage({ id: "s-app", code: "APPROVED", sequence: 4, isTerminal: true, assigneeRole: "COMPETENT_AUTHORITY" as Role }),
];

const tr = (
  fromStageId: string,
  toStageId: string,
  action: WorkflowAction,
  requiredRole: Role,
  requiresRemark = false,
): TransitionRow => ({ id: `${fromStageId}-${action}`, fromStageId, toStageId, action, requiredRole, requiresRemark });

const TRANSITIONS: TransitionRow[] = [
  tr("s-sub", "s-scr", "SUBMIT", "INSTITUTION_ADMIN" as Role),
  tr("s-scr", "s-clar", "RETURN_FOR_CLARIFICATION", "REGIONAL_OFFICER" as Role, true),
  tr("s-clar", "s-scr", "RESPOND_CLARIFICATION", "INSTITUTION_ADMIN" as Role, true),
  tr("s-scr", "s-dec", "FORWARD", "REGIONAL_OFFICER" as Role, true),
  tr("s-dec", "s-app", "APPROVE", "COMPETENT_AUTHORITY" as Role, true),
];

function guard(over: {
  status?: ApplicationStatus;
  currentStageId?: string | null;
  action: WorkflowAction;
  actorRole: Role;
  remark?: string;
  hasOpenClarification?: boolean;
}) {
  return guardTransition({
    snapshot: {
      id: "app-1",
      status: over.status ?? ("IN_PROCESS" as ApplicationStatus),
      currentStageId: over.currentStageId === undefined ? "s-scr" : over.currentStageId,
    },
    stages: STAGES,
    transitions: TRANSITIONS,
    action: over.action,
    actorRole: over.actorRole,
    remark: over.remark,
    hasOpenClarification: over.hasOpenClarification,
  });
}

describe("workflow transition guard", () => {
  it("allows a configured move for the right role", () => {
    const result = guard({ action: "FORWARD", actorRole: "REGIONAL_OFFICER" as Role, remark: "Verified documents" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.to.code).toBe("DECISION");
      expect(result.pausesClock).toBe(false);
      expect(result.resumesClock).toBe(false);
    }
  });

  it("rejects a move that is not defined from this stage", () => {
    const result = guard({ action: "APPROVE", actorRole: "COMPETENT_AUTHORITY" as Role, remark: "Approved" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNKNOWN_ACTION");
  });

  it("rejects a move made by the wrong role", () => {
    const result = guard({ action: "FORWARD", actorRole: "BUREAU_OFFICER" as Role, remark: "Forwarding" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ROLE_NOT_ALLOWED");
  });

  it("rejects a move that needs a remark but has none", () => {
    const result = guard({ action: "FORWARD", actorRole: "REGIONAL_OFFICER" as Role });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REMARK_REQUIRED");
  });

  it("rejects a remark that is too short to be meaningful", () => {
    const result = guard({ action: "FORWARD", actorRole: "REGIONAL_OFFICER" as Role, remark: "ok" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REMARK_REQUIRED");
  });

  it("marks return-for-clarification as pausing the clock", () => {
    const result = guard({
      action: "RETURN_FOR_CLARIFICATION",
      actorRole: "REGIONAL_OFFICER" as Role,
      remark: "Faculty list mismatch",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pausesClock).toBe(true);
  });

  it("marks responding as resuming the clock", () => {
    const result = guard({
      status: "RETURNED_FOR_CLARIFICATION" as ApplicationStatus,
      currentStageId: "s-clar",
      action: "RESPOND_CLARIFICATION",
      actorRole: "INSTITUTION_ADMIN" as Role,
      remark: "Revised list attached",
      hasOpenClarification: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resumesClock).toBe(true);
  });

  it("refuses a second return while a clarification is already open", () => {
    const result = guard({
      action: "RETURN_FOR_CLARIFICATION",
      actorRole: "REGIONAL_OFFICER" as Role,
      remark: "Still incomplete",
      hasOpenClarification: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ALREADY_AWAITING_INSTITUTION");
  });

  it("refuses a response when no clarification is open", () => {
    const result = guard({
      status: "RETURNED_FOR_CLARIFICATION" as ApplicationStatus,
      currentStageId: "s-clar",
      action: "RESPOND_CLARIFICATION",
      actorRole: "INSTITUTION_ADMIN" as Role,
      remark: "Here you go",
      hasOpenClarification: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NO_OPEN_CLARIFICATION");
  });

  it("refuses to move a draft through scrutiny without submitting", () => {
    const result = guard({
      status: "DRAFT" as ApplicationStatus,
      currentStageId: "s-sub",
      action: "FORWARD",
      actorRole: "REGIONAL_OFFICER" as Role,
      remark: "Trying to skip submission",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_SUBMITTED");
  });

  it("refuses any move on a closed case", () => {
    const result = guard({
      status: "APPROVED" as ApplicationStatus,
      action: "FORWARD",
      actorRole: "REGIONAL_OFFICER" as Role,
      remark: "Attempt after approval",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TERMINAL_CASE");
  });

  it("identifies closed statuses", () => {
    expect(isClosed("APPROVED" as ApplicationStatus)).toBe(true);
    expect(isClosed("REJECTED" as ApplicationStatus)).toBe(true);
    expect(isClosed("WITHDRAWN" as ApplicationStatus)).toBe(true);
    expect(isClosed("IN_PROCESS" as ApplicationStatus)).toBe(false);
  });
});

describe("status after transition", () => {
  const decision = STAGES.find((s) => s.code === "DECISION")!;
  const approved = STAGES.find((s) => s.code === "APPROVED")!;
  const clarification = STAGES.find((s) => s.code === "CLARIFICATION")!;

  it("maps approve and reject to their terminal statuses", () => {
    expect(statusAfterTransition("APPROVE" as WorkflowAction, approved, "PENDING_DECISION" as ApplicationStatus)).toBe("APPROVED");
    expect(statusAfterTransition("REJECT" as WorkflowAction, approved, "PENDING_DECISION" as ApplicationStatus)).toBe("REJECTED");
    expect(statusAfterTransition("WITHDRAW" as WorkflowAction, decision, "IN_PROCESS" as ApplicationStatus)).toBe("WITHDRAWN");
  });

  it("maps a return to the awaiting-institution status", () => {
    expect(statusAfterTransition("RETURN_FOR_CLARIFICATION" as WorkflowAction, clarification, "IN_PROCESS" as ApplicationStatus)).toBe(
      "RETURNED_FOR_CLARIFICATION",
    );
  });

  it("sends a case to pending decision when it lands on the authority's stage", () => {
    expect(statusAfterTransition("FORWARD" as WorkflowAction, decision, "IN_PROCESS" as ApplicationStatus)).toBe("PENDING_DECISION");
  });
});

describe("available actions", () => {
  it("lists only moves the actor's role may perform", () => {
    const regional = availableActions({
      snapshot: { id: "app-1", status: "IN_PROCESS" as ApplicationStatus, currentStageId: "s-scr" },
      stages: STAGES,
      transitions: TRANSITIONS,
      actorRole: "REGIONAL_OFFICER" as Role,
    });
    expect(regional.map((t) => t.action).sort()).toEqual(["FORWARD", "RETURN_FOR_CLARIFICATION"]);
  });

  it("hides the return action when a clarification is already open", () => {
    const regional = availableActions({
      snapshot: { id: "app-1", status: "RETURNED_FOR_CLARIFICATION" as ApplicationStatus, currentStageId: "s-scr" },
      stages: STAGES,
      transitions: TRANSITIONS,
      actorRole: "REGIONAL_OFFICER" as Role,
      hasOpenClarification: true,
    });
    expect(regional.map((t) => t.action)).toEqual(["FORWARD"]);
  });

  it("returns nothing for a closed case", () => {
    const actions = availableActions({
      snapshot: { id: "app-1", status: "APPROVED" as ApplicationStatus, currentStageId: "s-app" },
      stages: STAGES,
      transitions: TRANSITIONS,
      actorRole: "COMPETENT_AUTHORITY" as Role,
    });
    expect(actions).toHaveLength(0);
  });

  it("never offers an approval to a non-authority role", () => {
    const actions = availableActions({
      snapshot: { id: "app-1", status: "PENDING_DECISION" as ApplicationStatus, currentStageId: "s-dec" },
      stages: STAGES,
      transitions: TRANSITIONS,
      actorRole: "SYSTEM_ADMIN" as Role,
    });
    expect(actions).toHaveLength(0);
  });
});
