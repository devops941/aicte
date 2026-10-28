import type { Prisma, Role } from "@prisma/client";

/**
 * Role-based access control with row-level scoping.
 *
 * The important property here is that scope is returned as a Prisma `where`
 * fragment which the caller must merge into its query. Scoping is therefore
 * applied *inside* the SQL, not filtered out of the result afterwards, so a
 * regional officer physically cannot load another region's rows.
 */

export type Actor = {
  id: string;
  email: string;
  name: string;
  role: Role;
  regionId: string | null;
  institutionId: string | null;
};

export type Permission =
  | "application:create"
  | "application:read"
  | "application:update"
  | "application:submit"
  | "application:withdraw"
  | "workflow:transition"
  | "workflow:configure"
  | "clarification:raise"
  | "clarification:respond"
  | "evc:schedule"
  | "evc:record"
  | "compliance:submit"
  | "compliance:verify"
  | "undertaking:create"
  | "assignment:manage"
  | "decision:record"
  | "notification:read"
  | "report:read"
  | "audit:read"
  | "admin:users"
  | "admin:config";

const MATRIX: Record<Role, Permission[]> = {
  INSTITUTION_ADMIN: [
    "application:create",
    "application:read",
    "application:update",
    "application:submit",
    "application:withdraw",
    "clarification:respond",
    "compliance:submit",
    "notification:read",
    "report:read",
  ],
  REGIONAL_OFFICER: [
    "application:read",
    "workflow:transition",
    "clarification:raise",
    "evc:schedule",
    "compliance:verify",
    "undertaking:create",
    "notification:read",
    "report:read",
  ],
  BUREAU_OFFICER: [
    "application:read",
    "workflow:transition",
    "clarification:raise",
    "evc:schedule",
    "evc:record",
    "compliance:verify",
    "assignment:manage",
    "notification:read",
    "report:read",
  ],
  EVC_MEMBER: [
    "application:read",
    "evc:record",
    "notification:read",
  ],
  COMPETENT_AUTHORITY: [
    "application:read",
    "workflow:transition",
    "decision:record",
    "notification:read",
    "report:read",
    "audit:read",
  ],
  SYSTEM_ADMIN: [
    "application:read",
    "workflow:configure",
    "assignment:manage",
    "admin:users",
    "admin:config",
    "notification:read",
    "report:read",
    "audit:read",
  ],
  AUDITOR: [
    "application:read",
    "report:read",
    "audit:read",
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) {
    throw new ForbiddenError(`Role ${actor.role} is not permitted to ${permission}`);
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ValidationError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Unrestricted scope, used for system-wide roles. */
const ALL: Prisma.ApplicationWhereInput = {};

/**
 * Returns the row filter an actor may see for applications. It is intentionally
 * narrow: institution admins are pinned to their institution, regional officers
 * to their region, EVC members to cases they are assigned, bureau officers to
 * cases assigned to them or their region, and read-only roles to everything.
 */
export function applicationScope(actor: Actor): Prisma.ApplicationWhereInput {
  switch (actor.role) {
    case "INSTITUTION_ADMIN":
      if (!actor.institutionId) return { id: "__none__" };
      return { institutionId: actor.institutionId };
    case "REGIONAL_OFFICER":
      if (!actor.regionId) return { id: "__none__" };
      return { regionId: actor.regionId };
    case "EVC_MEMBER":
      return {
        OR: [
          { evcSchedules: { some: { memberIds: { has: actor.id } } } },
          { assignments: { some: { userId: actor.id, releasedAt: null } } },
        ],
      };
    case "BUREAU_OFFICER":
      return {
        OR: [
          { assignments: { some: { userId: actor.id, releasedAt: null } } },
          ...(actor.regionId ? [{ regionId: actor.regionId }] : []),
        ],
      };
    case "COMPETENT_AUTHORITY":
    case "SYSTEM_ADMIN":
    case "AUDITOR":
      return ALL;
    default:
      return { id: "__none__" };
  }
}

/** Combines the actor's scope with an additional filter using AND. */
export function scopedWhere(
  actor: Actor,
  extra: Prisma.ApplicationWhereInput = {},
): Prisma.ApplicationWhereInput {
  const scope = applicationScope(actor);
  if (Object.keys(scope).length === 0) return extra;
  if (Object.keys(extra).length === 0) return scope;
  return { AND: [scope, extra] };
}

export function institutionScope(actor: Actor): Prisma.InstitutionWhereInput {
  if (actor.role === "INSTITUTION_ADMIN" && actor.institutionId) {
    return { id: actor.institutionId };
  }
  if (actor.role === "REGIONAL_OFFICER" && actor.regionId) {
    return { regionId: actor.regionId };
  }
  return {};
}

/** Only these roles may author a statutory decision; AI and timers never can. */
export const DECISION_ROLES: Role[] = ["COMPETENT_AUTHORITY"];

export function canRecordDecision(actor: Actor): boolean {
  return DECISION_ROLES.includes(actor.role);
}

export function permissionsFor(role: Role): Permission[] {
  return MATRIX[role] ?? [];
}
