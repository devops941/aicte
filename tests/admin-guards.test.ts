import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/db";
import type { Role } from "@prisma/client";
import { assertMayAssignRole, assertNotLastSuperAdmin, assertNotSelfDemotion, emailTaken, manageableUserScope } from "@/lib/auth/admin-guards";
import { ForbiddenError, ValidationError, type Actor } from "@/lib/auth/rbac";

/**
 * Integration coverage for the administrative guards, against the real database.
 * These are the rules that stop the platform locking itself out or a lesser
 * administrator escalating privileges, so they are worth exercising against
 * actual rows rather than only in isolation.
 *
 * Everything it creates is namespaced and removed in afterAll.
 */
const prisma = createPrismaClient();
const PREFIX = `AGTEST-${Date.now()}`;

const actor = (over: Partial<Actor> & { role: Role }): Actor => ({
  id: "u1",
  email: `${PREFIX}-actor@aicte.gov.in`,
  name: "Test Actor",
  regionId: null,
  institutionId: null,
  ...over,
});

let soloSuperAdminId = "";
let parked: { id: string; isActive: boolean }[] = [];

beforeAll(async () => {
  // The rule under test is about the *last* active Super Admin, so any that the
  // environment already has are temporarily parked and restored afterwards.
  const existing = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN", isActive: true },
    select: { id: true, isActive: true },
  });
  parked = existing;
  if (existing.length > 0) {
    await prisma.user.updateMany({ where: { id: { in: existing.map((u) => u.id) } }, data: { isActive: false } });
  }

  // Now this is the only active Super Admin, so the "last one" rule has
  // something to protect.
  const solo = await prisma.user.create({
    data: {
      email: `${PREFIX}-solo@aicte.gov.in`,
      name: `${PREFIX} Solo Super Admin`,
      passwordHash: "x",
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });
  soloSuperAdminId = solo.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  for (const u of parked) {
    await prisma.user.update({ where: { id: u.id }, data: { isActive: u.isActive } });
  }
  await prisma.$disconnect();
});

describe("last Super Admin protection", () => {
  it("refuses to deactivate the only active Super Admin", async () => {
    await expect(assertNotLastSuperAdmin(soloSuperAdminId, { deactivating: true })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("refuses to demote the only active Super Admin", async () => {
    await expect(assertNotLastSuperAdmin(soloSuperAdminId, { newRole: "AUDITOR" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("allows the change once a second Super Admin exists", async () => {
    const second = await prisma.user.create({
      data: {
        email: `${PREFIX}-second@aicte.gov.in`,
        name: `${PREFIX} Second Super Admin`,
        passwordHash: "x",
        role: "SUPER_ADMIN",
        isActive: true,
      },
    });
    await expect(assertNotLastSuperAdmin(soloSuperAdminId, { newRole: "AUDITOR" })).resolves.toBeUndefined();
    await prisma.user.delete({ where: { id: second.id } });
  });

  it("does not interfere with a non-Super-Admin account", async () => {
    const auditor = await prisma.user.create({
      data: {
        email: `${PREFIX}-auditor@aicte.gov.in`,
        name: `${PREFIX} Auditor`,
        passwordHash: "x",
        role: "AUDITOR",
        isActive: true,
      },
    });
    await expect(assertNotLastSuperAdmin(auditor.id, { deactivating: true })).resolves.toBeUndefined();
    await prisma.user.delete({ where: { id: auditor.id } });
  });
});

describe("privilege escalation guards", () => {
  it("stops a System Admin from granting Super Admin", () => {
    expect(() => assertMayAssignRole(actor({ role: "SYSTEM_ADMIN" }), "SUPER_ADMIN")).toThrow(ForbiddenError);
  });

  it("lets a Super Admin grant Super Admin", () => {
    expect(() => assertMayAssignRole(actor({ role: "SUPER_ADMIN" }), "SUPER_ADMIN")).not.toThrow();
  });

  it("stops anyone from deactivating themselves", () => {
    const self = actor({ role: "SUPER_ADMIN", id: "self-1" });
    expect(() => assertNotSelfDemotion(self, "self-1", undefined, true)).toThrow(ValidationError);
  });

  it("stops anyone from changing their own role", () => {
    const self = actor({ role: "SUPER_ADMIN", id: "self-2" });
    expect(() => assertNotSelfDemotion(self, "self-2", "AUDITOR", undefined)).toThrow(ValidationError);
  });
});

describe("email uniqueness helper", () => {
  it("matches case-insensitively and can exclude one id", async () => {
    const existing = await prisma.user.findUniqueOrThrow({ where: { id: soloSuperAdminId } });
    expect(await emailTaken(existing.email.toUpperCase())).toBe(true);
    expect(await emailTaken(existing.email, soloSuperAdminId)).toBe(false);
    expect(await emailTaken(`${PREFIX}-nobody@aicte.gov.in`)).toBe(false);
  });
});

describe("manageable user scope", () => {
  it("gives system administrators every account", () => {
    expect(manageableUserScope(actor({ role: "SUPER_ADMIN" }))).toEqual({});
    expect(manageableUserScope(actor({ role: "SYSTEM_ADMIN" }))).toEqual({});
  });

  it("narrows a regional officer to their region", () => {
    expect(manageableUserScope(actor({ role: "REGIONAL_OFFICER", regionId: "r1" }))).toEqual({ regionId: "r1" });
  });

  it("narrows an institution admin to their institution", () => {
    expect(manageableUserScope(actor({ role: "INSTITUTION_ADMIN", institutionId: "i1" }))).toEqual({
      institutionId: "i1",
    });
  });
});
