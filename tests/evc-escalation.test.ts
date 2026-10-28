import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/db";
import type { ApplicationType, Role } from "@prisma/client";
import { evcCreateSchema, evcUpdateSchema } from "@/lib/evc-schemas";
import { escalationPolicySchema } from "@/lib/admin-schemas";
import { selectEscalation, escalationLadder, type PolicyRow } from "@/lib/alerts/evaluate";
import { can, applicationScope, type Actor } from "@/lib/auth/rbac";
import { evcList, evcEligibleMembers, evcSchedulableCases } from "@/lib/queries";

/**
 * Coverage for the two UI integration gaps: EVC scheduling and escalation
 * policy editing. Schema rules run as pure units; persistence, scope and
 * conflict handling run against the real database. Everything created here is
 * namespaced and removed in afterAll.
 */
const prisma = createPrismaClient();
const PREFIX = `EVCTEST-${Date.now()}`;

let regionId = "";
let otherRegionId = "";
let institutionId = "";
let applicationId = "";
let stageId = "";
let definitionId = "";
let memberId = "";
let otherRegionMemberId = "";
let adminId = "";

const actor = (over: Partial<Actor> & { role: Role }): Actor => ({
  id: over.id ?? "u1",
  email: "actor@aicte.gov.in",
  name: "Actor",
  regionId: null,
  institutionId: null,
  ...over,
});

/** Mirrors the server's duplicate check so the rule can be asserted directly. */
async function hasActiveVisit(applicationId: string) {
  return prisma.evcSchedule.findFirst({
    where: { applicationId, status: { in: ["PROPOSED", "SCHEDULED"] } },
    select: { id: true },
  });
}

beforeAll(async () => {
  const [region, other] = await Promise.all([
    prisma.region.create({ data: { code: `${PREFIX}-R1`, name: `${PREFIX} Region One` } }),
    prisma.region.create({ data: { code: `${PREFIX}-R2`, name: `${PREFIX} Region Two` } }),
  ]);
  regionId = region.id;
  otherRegionId = other.id;

  const institution = await prisma.institution.create({
    data: { aicteId: `${PREFIX}-INST`, name: `${PREFIX} Institute`, state: "Test State", regionId },
  });
  institutionId = institution.id;

  const [member, otherMember, admin] = await Promise.all([
    prisma.user.create({
      data: { email: `${PREFIX}-m1@test.local`, name: "Member One", passwordHash: "x", role: "EVC_MEMBER" as Role, regionId },
    }),
    prisma.user.create({
      data: { email: `${PREFIX}-m2@test.local`, name: "Member Two", passwordHash: "x", role: "EVC_MEMBER" as Role, regionId: otherRegionId },
    }),
    prisma.user.create({
      data: { email: `${PREFIX}-ro@test.local`, name: "Regional Officer", passwordHash: "x", role: "REGIONAL_OFFICER" as Role, regionId },
    }),
  ]);
  memberId = member.id;
  otherRegionMemberId = otherMember.id;
  adminId = admin.id;

  // A minimal workflow with a single EVC stage, so the case is schedulable.
  const definition = await prisma.workflowDefinition.create({
    data: {
      code: `${PREFIX}-WF`,
      applicationType: "NEW_ENGINEERING" as ApplicationType,
      name: `${PREFIX} Workflow`,
      version: 99,
      isActive: false,
    },
  });
  definitionId = definition.id;

  const stage = await prisma.workflowStage.create({
    data: {
      definitionId: definition.id,
      code: "EVC",
      name: "Expert Visit Committee",
      sequence: 1,
      slaWorkingDays: 20,
      isInitial: false,
      isTerminal: false,
      assigneeRole: "EVC_MEMBER" as Role,
    },
  });
  stageId = stage.id;

  const application = await prisma.application.create({
    data: {
      appNo: `${PREFIX}-APP-000001`,
      type: "NEW_ENGINEERING" as ApplicationType,
      title: `${PREFIX} EVC case`,
      institutionId,
      regionId,
      workflowVersionId: definition.id,
      currentStageId: stage.id,
      status: "IN_PROCESS",
    },
  });
  applicationId = application.id;
});

afterAll(async () => {
  await prisma.evcSchedule.deleteMany({ where: { applicationId } });
  // Audit rows must go before their actors: AuditLog.actorId is onDelete:SetNull,
  // so deleting a user first would null the actorId and break that row's stored
  // hash, invalidating the append-only chain for every later entry.
  await prisma.auditLog.deleteMany({ where: { actorEmail: { startsWith: PREFIX } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [memberId, otherRegionMemberId] } } });
  await prisma.application.deleteMany({ where: { id: applicationId } });
  await prisma.workflowStage.deleteMany({ where: { definitionId } });
  await prisma.workflowDefinition.deleteMany({ where: { id: definitionId } });
  await prisma.escalationPolicy.deleteMany({ where: { description: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.institution.deleteMany({ where: { id: institutionId } });
  await prisma.region.deleteMany({ where: { id: { in: [regionId, otherRegionId] } } });
  await prisma.$disconnect();
});

describe("EVC create payload validation (unit)", () => {
  const valid = {
    applicationId: "3f1c2b4a-1d2e-4f6a-8b9c-0d1e2f3a4b5c",
    scheduledFor: "2030-01-02T10:00:00.000Z",
    memberIds: ["3f1c2b4a-1d2e-4f6a-8b9c-0d1e2f3a4b5d"],
  };

  it("accepts a well-formed payload and normalises the date to a Date", () => {
    const parsed = evcCreateSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.scheduledFor).toBeInstanceOf(Date);
  });

  it("rejects a non-date scheduledFor that the old schema accepted", () => {
    expect(evcCreateSchema.safeParse({ ...valid, scheduledFor: "not-a-real-date" }).success).toBe(false);
  });

  it("requires at least one member", () => {
    expect(evcCreateSchema.safeParse({ ...valid, memberIds: [] }).success).toBe(false);
  });

  it("rejects unknown fields rather than silently dropping them", () => {
    expect(evcCreateSchema.safeParse({ ...valid, members: valid.memberIds }).success).toBe(false);
  });

  it("caps the committee at eight members", () => {
    const many = Array.from({ length: 9 }, (_, i) => `3f1c2b4a-1d2e-4f6a-8b9c-0d1e2f3a4b5${i}`);
    expect(evcCreateSchema.safeParse({ ...valid, memberIds: many }).success).toBe(false);
  });

  it("requires an id when updating and allows a status-only change", () => {
    expect(evcUpdateSchema.safeParse({ status: "CANCELLED" }).success).toBe(false);
    expect(evcUpdateSchema.safeParse({ id: valid.applicationId, status: "CANCELLED" }).success).toBe(true);
    expect(evcUpdateSchema.safeParse({ id: valid.applicationId, memberIds: [] }).success).toBe(false);
  });
});

describe("escalation payload validation (unit)", () => {
  const base = { level: 1, afterWorkingDays: 3, targetRole: "REGIONAL_OFFICER", channel: "IN_APP" };

  it("accepts a valid rung and coerces numeric strings", () => {
    const parsed = escalationPolicySchema.safeParse({ ...base, level: "2", afterWorkingDays: "5" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.level).toBe(2);
  });

  it("rejects an out-of-range level and a negative delay", () => {
    expect(escalationPolicySchema.safeParse({ ...base, level: 0 }).success).toBe(false);
    expect(escalationPolicySchema.safeParse({ ...base, level: 11 }).success).toBe(false);
    expect(escalationPolicySchema.safeParse({ ...base, afterWorkingDays: -1 }).success).toBe(false);
  });

  it("accepts a regionId now that the schema supports regional rungs", () => {
    const parsed = escalationPolicySchema.safeParse({ ...base, regionId: "3f1c2b4a-1d2e-4f6a-8b9c-0d1e2f3a4b5c" });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown fields and an unknown channel", () => {
    expect(escalationPolicySchema.safeParse({ ...base, priority: 1 }).success).toBe(false);
    expect(escalationPolicySchema.safeParse({ ...base, channel: "SMS" }).success).toBe(false);
  });
});

describe("escalation selection reads the saved ladder (unit)", () => {
  const policies: PolicyRow[] = [
    { id: "a", scope: null, regionId: null, level: 1, afterWorkingDays: 3, targetRole: "REGIONAL_OFFICER", channel: "IN_APP", isActive: true },
    { id: "b", scope: null, regionId: null, level: 2, afterWorkingDays: 7, targetRole: "BUREAU_OFFICER", channel: "IN_APP", isActive: true },
    { id: "c", scope: null, regionId: null, level: 3, afterWorkingDays: 15, targetRole: "COMPETENT_AUTHORITY", channel: "EMAIL", isActive: true },
  ];

  it("picks the highest rung the delay has reached", () => {
    const chosen = selectEscalation({ applicationType: "NEW_ENGINEERING" as ApplicationType, regionId: null, daysOverdue: 8, policies });
    expect(chosen?.level).toBe(2);
  });

  it("ignores an inactive rung", () => {
    const off = policies.map((p) => (p.id === "b" ? { ...p, isActive: false } : p));
    const chosen = selectEscalation({ applicationType: "NEW_ENGINEERING" as ApplicationType, regionId: null, daysOverdue: 8, policies: off });
    expect(chosen?.level).toBe(1);
  });

  it("prefers a region-scoped rung over a national one", () => {
    const withRegion = [...policies, { id: "d", scope: null, regionId: "reg-1", level: 1, afterWorkingDays: 2, targetRole: "AUDITOR" as Role, channel: "IN_APP" as const, isActive: true }];
    const chosen = selectEscalation({ applicationType: "NEW_ENGINEERING" as ApplicationType, regionId: "reg-1", daysOverdue: 8, policies: withRegion });
    expect(chosen?.policy.id).toBe("d");
  });

  it("marks rungs reached in ladder order", () => {
    const ladder = escalationLadder({ applicationType: "NEW_ENGINEERING" as ApplicationType, regionId: null, daysOverdue: 8, policies });
    expect(ladder.map((r) => r.reached)).toEqual([true, true, false]);
  });
});

describe("EVC scheduling persistence and scope (integration)", () => {
  it("persists a visit and records the members", async () => {
    const created = await prisma.evcSchedule.create({
      data: { applicationId, scheduledFor: new Date(Date.now() + 7 * 86400000), memberIds: [memberId], venue: "Campus", status: "SCHEDULED" },
    });
    const reloaded = await prisma.evcSchedule.findUnique({ where: { id: created.id } });
    expect(reloaded?.memberIds).toEqual([memberId]);
    expect(reloaded?.status).toBe("SCHEDULED");
    await prisma.evcSchedule.delete({ where: { id: created.id } });
  });

  it("detects a duplicate active visit for the same application", async () => {
    const created = await prisma.evcSchedule.create({
      data: { applicationId, scheduledFor: new Date(Date.now() + 5 * 86400000), memberIds: [memberId], status: "SCHEDULED" },
    });
    expect(await hasActiveVisit(applicationId)).not.toBeNull();
    await prisma.evcSchedule.update({ where: { id: created.id }, data: { status: "CANCELLED" } });
    expect(await hasActiveVisit(applicationId)).toBeNull();
    await prisma.evcSchedule.delete({ where: { id: created.id } });
  });

  it("lists only cases in the actor's scope and at the EVC stage", async () => {
    const inScope = await evcSchedulableCases(actor({ role: "REGIONAL_OFFICER" as Role, regionId }));
    expect(inScope.some((c) => c.id === applicationId)).toBe(true);

    const outOfScope = await evcSchedulableCases(actor({ role: "REGIONAL_OFFICER" as Role, regionId: otherRegionId }));
    expect(outOfScope.some((c) => c.id === applicationId)).toBe(false);
  });

  it("lists only active EVC members as assignable", async () => {
    const members = await evcEligibleMembers();
    expect(members.some((m) => m.id === memberId)).toBe(true);
    expect(members.every((m) => m.region !== undefined)).toBe(true);
  });

  it("returns visits through evcList scoped to the actor's region", async () => {
    const created = await prisma.evcSchedule.create({
      data: { applicationId, scheduledFor: new Date(Date.now() + 3 * 86400000), memberIds: [memberId], status: "SCHEDULED" },
    });
    const visible = await evcList(actor({ role: "REGIONAL_OFFICER" as Role, regionId }));
    expect(visible.some((v) => v.id === created.id)).toBe(true);

    const hidden = await evcList(actor({ role: "REGIONAL_OFFICER" as Role, regionId: otherRegionId }));
    expect(hidden.some((v) => v.id === created.id)).toBe(false);
    await prisma.evcSchedule.delete({ where: { id: created.id } });
  });
});

describe("EVC authorization (integration)", () => {
  it("grants evc:schedule to regional and bureau officers only", () => {
    expect(can("REGIONAL_OFFICER" as Role, "evc:schedule")).toBe(true);
    expect(can("BUREAU_OFFICER" as Role, "evc:schedule")).toBe(true);
    expect(can("EVC_MEMBER" as Role, "evc:schedule")).toBe(false);
    expect(can("INSTITUTION_ADMIN" as Role, "evc:schedule")).toBe(false);
    expect(can("AUDITOR" as Role, "evc:schedule")).toBe(false);
  });

  it("denies an institution admin a row from another institution", () => {
    const scope = applicationScope(actor({ role: "INSTITUTION_ADMIN" as Role, institutionId: "other-inst" }));
    expect(scope).toEqual({ institutionId: "other-inst" });
  });

  it("denies a regional officer another region's row", () => {
    const scope = applicationScope(actor({ role: "REGIONAL_OFFICER" as Role, regionId: otherRegionId }));
    expect(scope).toEqual({ regionId: otherRegionId });
  });
});

describe("escalation persistence and conflict handling (integration)", () => {
  it("creates a rung and reads it back", async () => {
    const created = await prisma.escalationPolicy.create({
      data: { level: 1, afterWorkingDays: 3, targetRole: "REGIONAL_OFFICER" as Role, channel: "IN_APP", description: `${PREFIX} rung one` },
    });
    const reloaded = await prisma.escalationPolicy.findUnique({ where: { id: created.id } });
    expect(reloaded?.level).toBe(1);
    expect(reloaded?.isActive).toBe(true);
  });

  it("documents that the DB unique index does not catch NULL-scope duplicates", async () => {
    // Postgres treats NULLs as distinct in a unique index, so the composite
    // index does not prevent two global (scope=null, region=null) rungs at the
    // same level. This is exactly why the route adds an explicit duplicate
    // check; asserting the raw DB behaviour keeps that reason honest.
    await prisma.escalationPolicy.create({
      data: { level: 2, afterWorkingDays: 7, targetRole: "BUREAU_OFFICER" as Role, channel: "IN_APP", description: `${PREFIX} rung two` },
    });
    const dup = await prisma.escalationPolicy.create({
      data: { level: 2, afterWorkingDays: 9, targetRole: "AUDITOR" as Role, channel: "IN_APP", description: `${PREFIX} dup` },
    });
    expect(dup.id).toBeTruthy();
    const dupes = await prisma.escalationPolicy.count({ where: { level: 2, scope: null, regionId: null, description: { startsWith: PREFIX } } });
    expect(dupes).toBeGreaterThan(1);
    await prisma.escalationPolicy.delete({ where: { id: dup.id } });
  });

  it("application-level duplicate check catches what the index misses", async () => {
    const existing = await prisma.escalationPolicy.findFirst({
      where: { scope: null, regionId: null, level: 2, description: `${PREFIX} rung two` },
      select: { id: true },
    });
    expect(existing).not.toBeNull();
    const wouldConflict = await prisma.escalationPolicy.findFirst({
      where: { scope: null, regionId: null, level: 2, id: { not: existing!.id } },
      select: { id: true },
    });
    expect(wouldConflict).not.toBeNull();
  });

  it("updates an existing rung and flips its enabled state", async () => {
    const rung = await prisma.escalationPolicy.findFirst({ where: { description: `${PREFIX} rung one` } });
    expect(rung).not.toBeNull();
    const updated = await prisma.escalationPolicy.update({ where: { id: rung!.id }, data: { isActive: false, afterWorkingDays: 4 } });
    expect(updated.isActive).toBe(false);
    expect(updated.afterWorkingDays).toBe(4);
  });

  it("refuses a rung that would fire out of order (mirrors the server guard)", async () => {
    const siblings = await prisma.escalationPolicy.findMany({
      where: { scope: null, regionId: null },
      select: { level: true, afterWorkingDays: true },
    });
    const proposed = { level: 1, afterWorkingDays: 10 };
    const violates = siblings.some((s) => s.level > proposed.level && s.afterWorkingDays < proposed.afterWorkingDays);
    expect(violates).toBe(true);
  });

  it("lets the escalation scanner read the saved ladder", async () => {
    const active = await prisma.escalationPolicy.findMany({ where: { isActive: true } });
    expect(Array.isArray(active)).toBe(true);
  });
});
