import type { ApplicationStatus, Role, WorkflowAction } from "@prisma/client";

/**
 * Workflow transition guard.
 *
 * Routing is data, not code: a move is legal only when a `workflow_transitions`
 * row exists for (fromStage, action) on the case's pinned workflow version and
 * the actor's role matches. This module holds the pure decision logic so it can
 * be tested without a database; `engine.ts` supplies the rows.
 */

export type StageRow = {
  id: string;
  code: string;
  name: string;
  sequence: number;
  slaWorkingDays: number;
  isInitial: boolean;
  isTerminal: boolean;
  assigneeRole: Role;
};

export type TransitionRow = {
  id: string;
  fromStageId: string;
  toStageId: string;
  action: WorkflowAction;
  requiredRole: Role;
  requiresRemark: boolean;
  label?: string | null;
};

export type CaseSnapshot = {
  id: string;
  status: ApplicationStatus;
  currentStageId: string | null;
};

export type GuardInput = {
  snapshot: CaseSnapshot;
  stages: StageRow[];
  transitions: TransitionRow[];
  action: WorkflowAction;
  actorRole: Role;
  remark?: string | null;
  /** When set, the case is already awaiting the institution and must not be re-returned. */
  hasOpenClarification?: boolean;
};

export type GuardResult =
  | { ok: true; transition: TransitionRow; from: StageRow; to: StageRow; pausesClock: boolean; resumesClock: boolean }
  | { ok: false; code: GuardCode; message: string };

export type GuardCode =
  | "TERMINAL_CASE"
  | "NOT_SUBMITTED"
  | "NO_CURRENT_STAGE"
  | "UNKNOWN_ACTION"
  | "ROLE_NOT_ALLOWED"
  | "REMARK_REQUIRED"
  | "ALREADY_AWAITING_INSTITUTION"
  | "NO_OPEN_CLARIFICATION";

/** Actions that pause the SLA clock while the institution is responsible. */
const PAUSING_ACTIONS: WorkflowAction[] = ["RETURN_FOR_CLARIFICATION"];
/** Actions that restart the clock once the institution has answered. */
const RESUMING_ACTIONS: WorkflowAction[] = ["RESPOND_CLARIFICATION", "RESUBMIT"];

const CLOSED_STATUSES: ApplicationStatus[] = ["APPROVED", "REJECTED", "WITHDRAWN"];

export function isClosed(status: ApplicationStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

/**
 * Evaluates one requested move. Returns either the matched transition (with
 * pause/resume hints) or a machine-readable reason the move is rejected, which
 * the caller turns into a user-facing message and an audit entry.
 */
export function guardTransition(input: GuardInput): GuardResult {
  const { snapshot, stages, transitions, action, actorRole, remark, hasOpenClarification } = input;

  if (isClosed(snapshot.status)) {
    return { ok: false, code: "TERMINAL_CASE", message: `Case is already ${snapshot.status.toLowerCase()} and cannot be moved.` };
  }

  if (action !== "SUBMIT" && snapshot.status === "DRAFT") {
    return { ok: false, code: "NOT_SUBMITTED", message: "Submit the application before moving it through scrutiny." };
  }

  if (!snapshot.currentStageId) {
    return { ok: false, code: "NO_CURRENT_STAGE", message: "This case has no current stage; it may not be submitted yet." };
  }

  const from = stages.find((s) => s.id === snapshot.currentStageId);
  if (!from) {
    return { ok: false, code: "NO_CURRENT_STAGE", message: "Current stage is missing from the workflow version." };
  }

  if (from.isTerminal && !RESUMING_ACTIONS.includes(action)) {
    return { ok: false, code: "TERMINAL_CASE", message: `Stage "${from.name}" is terminal.` };
  }

  if (action === "RETURN_FOR_CLARIFICATION" && hasOpenClarification) {
    return {
      ok: false,
      code: "ALREADY_AWAITING_INSTITUTION",
      message: "A clarification request is already open for this case.",
    };
  }

  if ((action === "RESPOND_CLARIFICATION" || action === "RESUBMIT") && !hasOpenClarification) {
    return {
      ok: false,
      code: "NO_OPEN_CLARIFICATION",
      message: "There is no open clarification request to respond to.",
    };
  }

  const transition = transitions.find((t) => t.fromStageId === from.id && t.action === action);

  if (!transition) {
    return {
      ok: false,
      code: "UNKNOWN_ACTION",
      message: `Action ${action} is not defined from stage "${from.name}".`,
    };
  }

  if (transition.requiredRole !== actorRole) {
    return {
      ok: false,
      code: "ROLE_NOT_ALLOWED",
      message: `Action ${action} requires the ${transition.requiredRole} role; you are ${actorRole}.`,
    };
  }

  if (transition.requiresRemark && !(remark && remark.trim().length >= 3)) {
    return {
      ok: false,
      code: "REMARK_REQUIRED",
      message: `Action ${action} requires a remark of at least 3 characters.`,
    };
  }

  const to = stages.find((s) => s.id === transition.toStageId);
  if (!to) {
    return { ok: false, code: "UNKNOWN_ACTION", message: "Transition target stage is missing." };
  }

  return {
    ok: true,
    transition,
    from,
    to,
    pausesClock: PAUSING_ACTIONS.includes(action),
    resumesClock: RESUMING_ACTIONS.includes(action),
  };
}

/** The status a case carries once it lands on `stage` after `action`. */
export function statusAfterTransition(
  action: WorkflowAction,
  stage: StageRow,
  current: ApplicationStatus,
): ApplicationStatus {
  if (action === "WITHDRAW") return "WITHDRAWN";
  if (action === "REJECT") return "REJECTED";
  if (action === "APPROVE" || stage.isTerminal) {
    if (stage.code === "APPROVED") return "APPROVED";
    if (stage.code === "REJECTED") return "REJECTED";
    if (stage.isTerminal && current === "PENDING_DECISION") return "APPROVED";
  }
  if (action === "RETURN_FOR_CLARIFICATION") return "RETURNED_FOR_CLARIFICATION";
  if (action === "SCHEDULE_EVC") return "SCHEDULED_EVC";
  if (stage.code === "EVC" || stage.code === "EVC_VISIT") return "SCHEDULED_EVC";
  if (stage.code === "DECISION" || stage.assigneeRole === "COMPETENT_AUTHORITY") return "PENDING_DECISION";
  return "IN_PROCESS";
}

/** Every move the actor could legally make right now, for rendering buttons. */
export function availableActions(input: Omit<GuardInput, "action" | "remark">): TransitionRow[] {
  if (isClosed(input.snapshot.status)) return [];
  const from = input.stages.find((s) => s.id === input.snapshot.currentStageId);
  if (!from) return [];
  return input.transitions.filter((t) => {
    if (t.fromStageId !== from.id) return false;
    if (t.requiredRole !== input.actorRole) return false;
    if (t.action === "RETURN_FOR_CLARIFICATION" && input.hasOpenClarification) return false;
    if ((t.action === "RESPOND_CLARIFICATION" || t.action === "RESUBMIT") && !input.hasOpenClarification) return false;
    return true;
  });
}

/** Role that owns the case at a given stage, used to route notifications. */
export function stageOwnerRole(stage: StageRow): Role {
  return stage.assigneeRole;
}
