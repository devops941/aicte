import type { WorkflowAction } from "@prisma/client";

export const ACTION_LABEL_MAP: Record<WorkflowAction, string> = {
  SUBMIT: "Submitted",
  SCRUTINIZE: "Scrutinised",
  RETURN_FOR_CLARIFICATION: "Returned for clarification",
  RESPOND_CLARIFICATION: "Clarification answered",
  FORWARD: "Forwarded",
  RE_SCRUTINIZE: "Re-scrutinised",
  SCHEDULE_EVC: "EVC scheduled",
  COMPLETE_EVC: "EVC completed",
  RECOMMEND: "Recommended",
  APPROVE: "Approved",
  REJECT: "Rejected",
  WITHDRAW: "Withdrawn",
  RESUBMIT: "Resubmitted",
};

export function actionLabel(action: WorkflowAction | string): string {
  return ACTION_LABEL_MAP[action as WorkflowAction] ?? String(action).replace(/_/g, " ").toLowerCase();
}
