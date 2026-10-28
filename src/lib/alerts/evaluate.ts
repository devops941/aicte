import type { ApplicationType, Role } from "@prisma/client";

/**
 * Escalation selection.
 *
 * Policies are keyed by level with a delay in working days. For a case that is
 * `daysOverdue` past its stage deadline we pick every policy whose delay has
 * been reached but not yet superseded, i.e. the highest level that currently
 * applies. Pure function, so the selection rules are unit-testable.
 */

export type PolicyRow = {
  id: string;
  scope: ApplicationType | null;
  regionId: string | null;
  level: number;
  afterWorkingDays: number;
  targetRole: Role;
  channel: "IN_APP" | "EMAIL";
  isActive: boolean;
};

export type EscalationInput = {
  applicationType: ApplicationType;
  regionId: string | null;
  daysOverdue: number;
  policies: PolicyRow[];
};

export type SelectedEscalation = {
  policy: PolicyRow;
  level: number;
  targetRole: Role;
};

/**
 * Policies are filtered to the most specific match first: a policy scoped to
 * the case's application type beats a general one, and a region-scoped policy
 * beats a national one. Ties are broken by the higher level so the more urgent
 * policy wins.
 */
export function selectEscalation(input: EscalationInput): SelectedEscalation | null {
  const { applicationType, regionId, daysOverdue, policies } = input;

  const applicable = policies
    .filter((p) => p.isActive)
    .filter((p) => p.scope === null || p.scope === applicationType)
    .filter((p) => p.regionId === null || p.regionId === regionId)
    .filter((p) => p.afterWorkingDays <= daysOverdue);

  if (applicable.length === 0) return null;

  const specificity = (p: PolicyRow) => (p.scope ? 2 : 0) + (p.regionId ? 1 : 0);

  const best = applicable.reduce((a, b) => {
    if (specificity(b) !== specificity(a)) return specificity(b) > specificity(a) ? b : a;
    if (b.afterWorkingDays !== a.afterWorkingDays) return b.afterWorkingDays > a.afterWorkingDays ? b : a;
    return b.level > a.level ? b : a;
  });

  return { policy: best, level: best.level, targetRole: best.targetRole };
}

export type LadderRung = SelectedEscalation & { reached: boolean };

/** The full ladder with each rung marked reached or pending, for the UI. */
export function escalationLadder(input: EscalationInput): LadderRung[] {
  return input.policies
    .filter((p) => p.isActive)
    .filter((p) => p.scope === null || p.scope === input.applicationType)
    .filter((p) => p.regionId === null || p.regionId === input.regionId)
    .sort((a, b) => a.level - b.level)
    .map((p) => ({
      policy: p,
      level: p.level,
      targetRole: p.targetRole,
      reached: p.afterWorkingDays <= input.daysOverdue,
    }));
}

export const DEFAULT_ESCALATION_LADDER: Omit<PolicyRow, "id">[] = [
  { scope: null, regionId: null, level: 1, afterWorkingDays: 3, targetRole: "REGIONAL_OFFICER", channel: "IN_APP", isActive: true },
  { scope: null, regionId: null, level: 2, afterWorkingDays: 7, targetRole: "BUREAU_OFFICER", channel: "IN_APP", isActive: true },
  { scope: null, regionId: null, level: 3, afterWorkingDays: 15, targetRole: "COMPETENT_AUTHORITY", channel: "EMAIL", isActive: true },
];
