import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ForbiddenError, ValidationError } from "@/lib/auth/rbac";
import type { Actor } from "@/lib/auth/rbac";

/**
 * Cross-cutting guards for administrative mutations. Keeping them here means
 * the same invariants hold no matter which route performs the write, rather
 * than each handler remembering to check them.
 */

/**
 * Blocks an operation that would leave the platform with no way in: the last
 * active Super Admin cannot be deactivated, demoted or deleted. Without this a
 * single click could lock every administrator out of the system.
 */
export async function assertNotLastSuperAdmin(
  targetUserId: string,
  change: { deactivating?: boolean; newRole?: Role },
): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { role: true, isActive: true },
  });
  if (!target) throw new ValidationError("User not found");

  const losesSuperAdmin =
    target.role === "SUPER_ADMIN" &&
    (change.deactivating === true || (change.newRole !== undefined && change.newRole !== "SUPER_ADMIN"));

  if (!losesSuperAdmin) return;

  const remaining = await prisma.user.count({
    where: { role: "SUPER_ADMIN", isActive: true, id: { not: targetUserId } },
  });
  if (remaining === 0) {
    throw new ValidationError(
      "This is the last active Super Admin. Promote or create another Super Admin first, or the system would be left with no administrator.",
    );
  }
}

/**
 * Rules for what a system administrator may assign. Only a Super Admin may
 * create or promote another Super Admin, so a System Admin cannot escalate
 * their own privileges by minting a peer and logging in as them.
 */
export function assertMayAssignRole(actor: Actor, role: Role): void {
  if (role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only a Super Admin may grant the Super Admin role");
  }
}

/**
 * Prevents a user from changing their own role or deactivating themselves in a
 * way that would drop their current session's authority mid-flight.
 */
export function assertNotSelfDemotion(actor: Actor, targetUserId: string, newRole?: Role, deactivating?: boolean): void {
  if (actor.id !== targetUserId) return;
  if (deactivating) throw new ValidationError("You cannot deactivate your own account");
  if (newRole && newRole !== actor.role) {
    throw new ValidationError("You cannot change your own role");
  }
}

/** Case-insensitive uniqueness check for a user email, excluding one id. */
export async function emailTaken(email: string, exceptId?: string): Promise<boolean> {
  const found = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return Boolean(found);
}

export type ScopedUserWhere = Prisma.UserWhereInput;

/**
 * Row filter for who an actor may administer. A Super Admin and System Admin
 * see every account; a Regional Officer sees their region; an Institution Admin
 * sees their institution; everyone else sees only themselves.
 */
export function manageableUserScope(actor: Actor): ScopedUserWhere {
  switch (actor.role) {
    case "SUPER_ADMIN":
    case "SYSTEM_ADMIN":
      return {};
    case "REGIONAL_OFFICER":
      return actor.regionId ? { regionId: actor.regionId } : { id: actor.id };
    case "INSTITUTION_ADMIN":
      return actor.institutionId ? { institutionId: actor.institutionId } : { id: actor.id };
    default:
      return { id: actor.id };
  }
}
