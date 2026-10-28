import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { can } from "@/lib/auth/rbac";
import {
  assertMayAssignRole,
  assertNotLastSuperAdmin,
  assertNotSelfDemotion,
  emailTaken,
  manageableUserScope,
} from "@/lib/auth/admin-guards";
import type { Prisma } from "@prisma/client";
import {
  ROLE,
  userCreateSchema as createSchema,
  userUpdateSchema as updateSchema,
  userPasswordSchema as passwordSchema,
} from "@/lib/admin-schemas";

/**
 * User and role administration.
 *
 * Every rule that protects the platform's integrity lives on the server: only a
 * Super Admin can grant the Super Admin role, nobody can demote themselves, and
 * the last active Super Admin cannot be removed. A password hash is never
 * selected into a response.
 */
export const GET = withAuth("admin:users", async ({ actor, req }) => {
  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim();
  const role = url.searchParams.get("role");

  const scope = manageableUserScope(actor);
  const extra: Prisma.UserWhereInput = {};
  if (search) {
    extra.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (role && ROLE.safeParse(role).success) extra.role = role as never;

  const where: Prisma.UserWhereInput = Object.keys(scope).length === 0 ? extra : { AND: [scope, extra] };

  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      phone: true,
      isActive: true,
      totpEnabled: true,
      failedLoginCount: true,
      lastLoginAt: true,
      lockedUntil: true,
      createdAt: true,
      region: { select: { id: true, name: true } },
      institution: { select: { id: true, name: true } },
    },
  });

  return jsonOk({ rows });
});

/** Creates an account. The password is hashed here; the plaintext is never stored. */
export const POST = withAuth("admin:users", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(createSchema, await req.json());

  assertMayAssignRole(actor, body.role);
  if (await emailTaken(body.email)) return jsonError("An account with that email already exists", 409);

  if (body.role === "REGIONAL_OFFICER" && !body.regionId) {
    return jsonError("A regional officer needs a region", 422);
  }
  if (body.role === "INSTITUTION_ADMIN" && !body.institutionId) {
    return jsonError("An institution admin needs an institution", 422);
  }

  const passwordHash = await bcrypt.hash(body.password, 12);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.user.create({
      data: {
        email: body.email.trim().toLowerCase(),
        name: body.name.trim(),
        role: body.role,
        passwordHash,
        regionId: body.regionId ?? null,
        institutionId: body.institutionId ?? null,
        designation: body.designation?.trim() || null,
        phone: body.phone?.trim() || null,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "USER_CREATED",
        entityType: "User",
        entityId: row.id,
        // The password and its hash are deliberately absent from the audit trail.
        after: {
          email: row.email,
          role: row.role,
          regionId: body.regionId ?? null,
          institutionId: body.institutionId ?? null,
        },
        ip,
        userAgent,
      },
      tx,
    );
    return row;
  });

  return jsonOk(created, 201);
});

/** Edits an account: profile fields, role, scope and activation. */
export const PATCH = withAuth("admin:users", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(updateSchema, await req.json());

  const existing = await prisma.user.findUnique({ where: { id: body.id } });
  if (!existing) return jsonError("User not found", 404);

  // Row scope: an institution admin cannot edit a user outside their institution.
  const scope = manageableUserScope(actor);
  if (Object.keys(scope).length > 0) {
    const inScope = await prisma.user.findFirst({ where: { AND: [scope, { id: body.id }] } });
    if (!inScope) return jsonError("That account is outside your scope", 403);
  }

  // Privilege-escalation guards.
  if (body.role !== undefined) {
    assertMayAssignRole(actor, body.role);
    // A non-Super-Admin must not be able to touch an existing Super Admin either.
    if (existing.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
      return jsonError("Only a Super Admin may modify a Super Admin account", 403);
    }
  }
  assertNotSelfDemotion(actor, body.id, body.role, body.isActive === false);
  await assertNotLastSuperAdmin(body.id, {
    deactivating: body.isActive === false,
    newRole: body.role,
  });

  const data: Prisma.UserUpdateInput = {
    ...(body.name !== undefined ? { name: body.name.trim() } : {}),
    ...(body.role !== undefined ? { role: body.role } : {}),
    ...(body.designation !== undefined ? { designation: body.designation?.trim() || null } : {}),
    ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    ...(body.regionId !== undefined
      ? { region: body.regionId ? { connect: { id: body.regionId } } : { disconnect: true } }
      : {}),
    ...(body.institutionId !== undefined
      ? { institution: body.institutionId ? { connect: { id: body.institutionId } } : { disconnect: true } }
      : {}),
  };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: body.id },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true, regionId: true, institutionId: true },
    });

    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action:
          body.role !== undefined && body.role !== existing.role
            ? "USER_ROLE_CHANGED"
            : body.isActive === false
              ? "USER_DEACTIVATED"
              : body.isActive === true
                ? "USER_ACTIVATED"
                : "USER_UPDATED",
        entityType: "User",
        entityId: row.id,
        before: {
          role: existing.role,
          isActive: existing.isActive,
          regionId: existing.regionId,
          institutionId: existing.institutionId,
        },
        after: {
          role: row.role,
          isActive: row.isActive,
          regionId: row.regionId,
          institutionId: row.institutionId,
          reason: body.reason?.trim() || null,
        },
        ip,
        userAgent,
      },
      tx,
    );
    return row;
  });

  return jsonOk(updated);
});

/**
 * Resets a password. The new secret is returned exactly once so an administrator
 * can hand it over; it is never written to the audit trail. A reset also clears
 * any lockout so a locked-out user can sign in again.
 */
export const PUT = withAuth("admin:users", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(passwordSchema, await req.json());

  const existing = await prisma.user.findUnique({ where: { id: body.id }, select: { id: true, role: true } });
  if (!existing) return jsonError("User not found", 404);
  if (existing.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN" && !can(actor.role, "system:maintain")) {
    return jsonError("Only a Super Admin may reset a Super Admin password", 403);
  }

  const plaintext = body.password ?? randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(plaintext, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: body.id },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "USER_PASSWORD_RESET",
        entityType: "User",
        entityId: body.id,
        after: { generated: !body.password },
        ip,
        userAgent,
      },
      tx,
    );
  });

  return jsonOk({ id: body.id, password: plaintext });
});
