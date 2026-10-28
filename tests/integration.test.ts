import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/db";
import type { ApplicationType, Role } from "@prisma/client";
import { guardTransition, statusAfterTransition, type StageRow, type TransitionRow } from "@/lib/workflow/engine";
import { addWorkingDays, buildHolidaySet, countWorkingDays } from "@/lib/sla/calendar";
import { writeAudit } from "@/lib/audit/writer";
import { computeEntryHash, GENESIS_HASH, verifyChain, type ChainEntry } from "@/lib/audit/chain";
import { buildHolidaySet as buildSet } from "@/lib/sla/calendar";

/**
 * Integration coverage against the real database. It walks a case through
 * submit, scrutinise, return, respond and forward, then checks that the stored
 * history, SLA clock and audit chain agree with what the engine decided.
 *
 * Everything it creates is namespaced and removed in afterAll, so it can run
 * against the development database without leaving residue.
 */
const prisma = createPrismaClient();
const PREFIX = `ITEST-${Date.now()}`;

let regionId = "";
let institutionId = "";
let institutionAdminId = "";
let regionalOfficerId = "";
let applicationId = "";
let stageIds: Record<string, string> = {};
let transitions: TransitionRow[] = [];
let stages: StageRow[] = [];
let definitionId = "";

beforeAll(async () => {
  const region = await prisma.region.create({
    data: { code: `${PREFIX}-REG`, name: `${PREFIX} Region` },
  });
  regionId = region.id;

  const institution = await prisma.institution.create({
    data: {
      aicteId: `${PREFIX}-INST`,
      name: `${PREFIX} Institute`,
      state: "Test State",
      regionId,
    },
  });
  institutionId = institution.id;

  const [admin, officer] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}-admin@test.local`,
        name: "Integration Admin",
        passwordHash: "not-used",
        role: "INSTITUTION_ADMIN" as Role,
        institutionId,
        regionId,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}-officer@test.local`,
        name: "Integration Officer",
        passwordHash: "not-used",
        role: "REGIONAL_OFFICER" as Role,
        regionId,
      },
    }),
  ]);
  institutionAdminId = admin.id;
  regionalOfficerId = officer.id;

  // A minimal, self-contained workflow so the test does not depend on seed data.
  const definition = await prisma.workflowDefinition.create({
    data: {
      code: `${PREFIX}-WF`,
      name: `${PREFIX} Workflow`,
      applicationType: "NEW_ENGINEERING" as ApplicationType,
      version: 1,
      isActive: true,
    },
  });
  definitionId = definition.id;

  const stageDefs = [
    { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN" as Role, initial: true },
    { code: "SCRUTINY", name: "Scrutiny", sla: 10, role: "REGIONAL_OFFICER" as Role },
    { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" as Role },
    { code: "DECISION", name: "Decision", sla: 12, role: "COMPETENT_AUTHORITY" as Role },
    { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY" as Role, terminal: true },
  ];

  for (const [i, s] of stageDefs.entries()) {
    const row = await prisma.workflowStage.create({
      data: {
        definitionId,
        code: s.code,
        name: s.name,
        sequence: i,
        slaWorkingDays: s.sla,
        isInitial: Boolean(s.initial),
        isTerminal: Boolean(s.terminal),
        assigneeRole: s.role,
      },
    });
    stageIds[s.code] = row.id;
  }

  const edgeDefs = [
    { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" as Role, remark: false },
    { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER" as Role, remark: true },
    { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN" as Role, remark: true },
    { from: "SCRUTINY", to: "DECISION", action: "FORWARD", role: "REGIONAL_OFFICER" as Role, remark: true },
  ];

  for (const e of edgeDefs) {
    await prisma.workflowTransition.create({
      data: {
        fromStageId: stageIds[e.from],
        toStageId: stageIds[e.to],
        action: e.action as never,
        requiredRole: e.role,
        requiresRemark: e.remark,
      },
    });
  }

  const loaded = await prisma.workflowDefinition.findUnique({
    where: { id: definitionId },
    include: { stages: { include: { outgoing: true } } },
  });
  stages = (loaded?.stages ?? []) as unknown as StageRow[];
  transitions = (loaded?.stages ?? []).flatMap((s) => s.outgoing) as unknown as TransitionRow[];

  const application = await prisma.application.create({
    data: {
      appNo: `${PREFIX}-APP`,
      type: "NEW_ENGINEERING" as ApplicationType,
      title: `${PREFIX} New Engineering Application`,
      institutionId,
      regionId,
      workflowVersionId: definitionId,
      currentStageId: stageIds.SUBMITTED,
      status: "DRAFT",
      createdById: institutionAdminId,
    },
  });
  applicationId = application.id;

  // Mirror the service, which records the initial stage on creation so the
  // first stage's dwell time can be measured.
  await prisma.applicationStageHistory.create({
    data: {
      applicationId,
      stageId: stageIds.SUBMITTED,
      action: "CREATED",
      actorId: institutionAdminId,
      actorRole: "INSTITUTION_ADMIN" as Role,
      remark: "Application created as a draft",
      enteredAt: application.createdAt,
    },
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { OR: [{ entityId: applicationId }, { user: { email: { startsWith: PREFIX } } }] },
  });
  await prisma.assignment.deleteMany({ where: { applicationId } });
  await prisma.clarificationRequest.deleteMany({ where: { applicationId } });
  await prisma.applicationStageHistory.deleteMany({ where: { applicationId } });
  await prisma.application.deleteMany({ where: { id: applicationId } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: { startsWith: PREFIX } } });
  await prisma.workflowTransition.deleteMany({ where: { fromStage: { definitionId } } });
  await prisma.workflowStage.deleteMany({ where: { definitionId } });
  await prisma.workflowDefinition.deleteMany({ where: { id: definitionId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.institution.deleteMany({ where: { id: institutionId } });
  await prisma.region.deleteMany({ where: { id: regionId } });
  await prisma.$disconnect();
});

/** Mirrors the service's write path so the test exercises real rows. */
async function applyTransition(action: string, actorId: string, actorRole: Role, remark?: string) {
  return prisma.$transaction(async (tx) => {
    const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId } });
    const openClarification = await tx.clarificationRequest.findFirst({
      where: { applicationId, status: "OPEN" },
    });

    const guard = guardTransition({
      snapshot: { id: app.id, status: app.status, currentStageId: app.currentStageId },
      stages,
      transitions,
      action: action as never,
      actorRole,
      remark,
      hasOpenClarification: Boolean(openClarification),
    });

    if (!guard.ok) throw new Error(`${guard.code}: ${guard.message}`);

    const now = new Date();
    const holidays = new Set<string>();

    if (app.currentStageId) {
      const open = await tx.applicationStageHistory.findFirst({
        where: { applicationId, stageId: app.currentStageId, exitedAt: null },
      });
      if (open) {
        const days = countWorkingDays(open.enteredAt, now, holidays);
        await tx.applicationStageHistory.update({
          where: { id: open.id },
          data: { exitedAt: now, daysInStage: days, slaMet: days <= guard.from.slaWorkingDays },
        });
      }
    }

    const newStatus = statusAfterTransition(action as never, guard.to, app.status);
    const dueAt = guard.pausesClock ? app.slaDueAt : addWorkingDays(now, guard.to.slaWorkingDays, holidays);

    await tx.application.update({
      where: { id: applicationId },
      data: {
        currentStageId: guard.to.id,
        status: newStatus,
        slaDueAt: dueAt,
        slaPausedAt: guard.pausesClock ? now : null,
      },
    });

    await tx.applicationStageHistory.create({
      data: {
        applicationId,
        stageId: guard.to.id,
        fromStageId: guard.from.id,
        action: action as never,
        actorId,
        actorRole,
        remark: remark ?? null,
        enteredAt: now,
      },
    });

    if (action === "RETURN_FOR_CLARIFICATION") {
      await tx.clarificationRequest.create({
        data: {
          applicationId,
          stageId: guard.from.id,
          raisedById: actorId,
          reason: remark ?? "Clarification required",
          dueAt: addWorkingDays(now, 7, holidays),
          status: "OPEN",
        },
      });
    }
    if (action === "RESPOND_CLARIFICATION") {
      await tx.clarificationRequest.updateMany({
        where: { applicationId, status: "OPEN" },
        data: { status: "RESPONDED", response: remark, respondedById: actorId, respondedAt: now },
      });
    }

    await writeAudit(
      {
        actorId,
        actorEmail: `${PREFIX}-actor@test.local`,
        action: `TRANSITION:${action}`,
        entityType: "Application",
        entityId: applicationId,
        before: { status: app.status, currentStageId: app.currentStageId },
        after: { status: newStatus, currentStageId: guard.to.id },
      },
      tx,
    );

    return { newStatus, dueAt, toStage: guard.to.code };
  });
}

describe("full application lifecycle against the database", () => {
  it("starts as a draft with no SLA deadline", async () => {
    const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(app.status).toBe("DRAFT");
    expect(app.slaDueAt).toBeNull();
  });

  it("submits and moves to scrutiny with a computed deadline", async () => {
    const result = await applyTransition("SUBMIT", institutionAdminId, "INSTITUTION_ADMIN" as Role);
    expect(result.newStatus).toBe("IN_PROCESS");
    expect(result.toStage).toBe("SCRUTINY");

    const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(app.currentStageId).toBe(stageIds.SCRUTINY);
    expect(app.slaDueAt).not.toBeNull();
    // The deadline must fall on a working day.
    expect([0, 6]).not.toContain(app.slaDueAt!.getUTCDay());
  });

  it("rejects a scrutiny move made by the wrong role", async () => {
    await expect(
      applyTransition("RETURN_FOR_CLARIFICATION", institutionAdminId, "INSTITUTION_ADMIN" as Role, "Not my job"),
    ).rejects.toThrow(/ROLE_NOT_ALLOWED/);
  });

  it("returns for clarification, pausing the clock and opening a request", async () => {
    const before = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    const result = await applyTransition(
      "RETURN_FOR_CLARIFICATION",
      regionalOfficerId,
      "REGIONAL_OFFICER" as Role,
      "Faculty list does not match the submitted intake",
    );
    expect(result.newStatus).toBe("RETURNED_FOR_CLARIFICATION");

    const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(app.slaPausedAt).not.toBeNull();
    // Pausing must not silently move the deadline.
    expect(app.slaDueAt?.getTime()).toBe(before.slaDueAt?.getTime());

    const open = await prisma.clarificationRequest.findFirst({ where: { applicationId, status: "OPEN" } });
    expect(open).not.toBeNull();
    expect(open!.reason).toContain("Faculty list");
  });

  it("refuses a second return while the first is still open", async () => {
    await expect(
      applyTransition("RETURN_FOR_CLARIFICATION", regionalOfficerId, "REGIONAL_OFFICER" as Role, "Again"),
    ).rejects.toThrow(/ALREADY_AWAITING_INSTITUTION/);
  });

  it("accepts the institution's response and restarts the clock", async () => {
    const result = await applyTransition(
      "RESPOND_CLARIFICATION",
      institutionAdminId,
      "INSTITUTION_ADMIN" as Role,
      "Revised faculty list attached with credentials",
    );
    expect(result.toStage).toBe("SCRUTINY");

    const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(app.slaPausedAt).toBeNull();
    expect(app.slaDueAt).not.toBeNull();

    const clarification = await prisma.clarificationRequest.findFirst({
      where: { applicationId, status: "RESPONDED" },
    });
    expect(clarification?.response).toContain("Revised faculty list");
  });

  it("forwards to the decision stage", async () => {
    const result = await applyTransition("FORWARD", regionalOfficerId, "REGIONAL_OFFICER" as Role, "Documents verified");
    expect(result.toStage).toBe("DECISION");
    expect(result.newStatus).toBe("PENDING_DECISION");
  });

  it("records a complete, ordered stage history", async () => {
    const history = await prisma.applicationStageHistory.findMany({
      where: { applicationId },
      orderBy: { enteredAt: "asc" },
      include: { stage: true },
    });
    const codes = history.map((h) => h.stage?.code);
    expect(codes).toContain("SUBMITTED");
    expect(codes).toContain("SCRUTINY");
    expect(codes).toContain("CLARIFICATION");
    expect(codes).toContain("DECISION");
    // Every exited stage carries a measured duration.
    const exited = history.filter((h) => h.exitedAt !== null);
    expect(exited.length).toBeGreaterThan(0);
    expect(exited.every((h) => h.daysInStage !== null)).toBe(true);
  });

  it("wrote an audit entry for every accepted move", async () => {
    const entries = await prisma.auditLog.findMany({
      where: { entityId: applicationId },
      orderBy: { seq: "asc" },
    });
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(entries.some((e) => e.action === "TRANSITION:SUBMIT")).toBe(true);
    expect(entries.some((e) => e.action === "TRANSITION:FORWARD")).toBe(true);
  });

  it("has a verifiable audit chain covering the lifecycle entries", async () => {
    const rows = await prisma.auditLog.findMany({ orderBy: { seq: "asc" }, take: 5000 });
    const result = verifyChain(rows as unknown as ChainEntry[]);
    expect(result.valid).toBe(true);
  });

  it("detects a tampered audit row when one is altered", async () => {
    const rows = await prisma.auditLog.findMany({ orderBy: { seq: "asc" }, take: 5000 });
    const entries = rows as unknown as ChainEntry[];
    const index = entries.findIndex((e) => e.entityId === applicationId);
    expect(index).toBeGreaterThanOrEqual(0);

    const tampered = [...entries];
    tampered[index] = { ...tampered[index], after: { status: "APPROVED" } };
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAtId).toBe(entries[index].id);
  });
});
