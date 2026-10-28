import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/auth/rbac";
import { UnauthorizedError } from "@/lib/auth/rbac";

/**
 * Resolves the current session into an Actor. The token carries the role and
 * scope, but the actor is re-read from the database so a deactivated or
 * re-scoped user loses access immediately rather than at token expiry.
 */
export async function currentActor(): Promise<Actor | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      regionId: true,
      institutionId: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    regionId: user.regionId,
    institutionId: user.institutionId,
  };
}

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw new UnauthorizedError();
  return actor;
}

/** For pages: redirects to login rather than throwing. */
export async function requirePageActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  return actor;
}

/** Human-readable scope description shown in the topbar. */
export async function describeScope(actor: Actor): Promise<string> {
  if (actor.institutionId) {
    const inst = await prisma.institution.findUnique({
      where: { id: actor.institutionId },
      select: { name: true },
    });
    return inst?.name ?? "";
  }
  if (actor.regionId) {
    const region = await prisma.region.findUnique({
      where: { id: actor.regionId },
      select: { name: true },
    });
    return region?.name ?? "";
  }
  return "All regions";
}

export async function unreadCount(actorId: string): Promise<number> {
  return prisma.notification.count({ where: { userId: actorId, status: "SENT", readAt: null } });
}
