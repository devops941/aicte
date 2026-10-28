import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApplicationType, Role } from "@prisma/client";
import type { Actor } from "@/lib/auth/rbac";

/**
 * Route-boundary (end-to-end API) coverage for the two new flows.
 *
 * The handlers are invoked with a real Request and a stubbed session, so the
 * full path runs — schema parsing, permission check, row-level scope, conflict
 * detection, transaction and audit write — against the real database. Only the
 * session lookup is stubbed, because there is no HTTP server or cookie jar in
 * the test environment; everything else is the production code.
 */
const PREFIX = `EVCE2E-${Date.now()}`;

const holder: { actor: Actor | null } = { actor: null };

vi.mock("@/lib/auth/session", () => ({
  currentActor: async () => holder.actor,
  requireActor: async () => holder.actor,
  requirePageActor: async () => holder.actor,
}));

const { prisma } = await import("@/lib/db");
const evcRoute = await import("@/app/api/evc/route");
const escalationRoute = await import("@/app/api/admin/escalation/route");

let regionId = "";
let otherRegionId = "";
let institutionId = "";
let applicationId = "";
let definitionId = "";
let memberId = "";
let otherMemberId = "";
let nonMemberId = "";
let regionalOfficerId = "";
let auditorId = "";

const asRegionalOfficer = (): Actor => ({
  id: regionalOfficerId,
  email: `${PREFIX}-ro@test.local`,
  name: "Regional Officer",
  role: "REGIONAL_OFFICER" as Role,
  regionId,
  institutionId: null,
});

const asAuditor = (): Actor => ({
  id: auditorId,
  email: `${PREFIX}-auditor@test.local`,
  name: "Auditor",
  role: "AUDITOR" as Role,
  regionId: null,
  institutionId: null,
});

function post(body: unknown): Request {
  return new Request("http://test.local/api/evc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({}) };
}

beforeAll(async () => {
  const [region, other] = await Promise.all([
    prisma.region.create({ data: { code: `${PREFIX}-R1`, name: `${PREFIX} Region` } }),
    prisma.region.create({ data: { code: `${PREFIX}-R2`, name: `${PREFIX} Other` } }),
  ]);
  regionId = region.id;
  otherRegionId = other.id;

  const institution = await prisma.institution.create({
    data: { aicteId: `${PREFIX}-INST`, name: `${PREFIX} Institute`, state: "TS", regionId },
  });
  institutionId = institution.id;

  const users = await Promise.all([
    prisma.user.create({ data: { email: `${PREFIX}-m1@test.local`, name: "M1", passwordHash: "x", role: "EVC_MEMBER" as Role, regionId } }),
    prisma.user.create({ data: { email: `${PREFIX}-m2@test.local`, name: "M2", passwordHash: "x", role: "EVC_MEMBER" as Role, regionId } }),
    prisma.user.create({ data: { email: `${PREFIX}-ro2@test.local`, name: "RO2", passwordHash: "x", role: "REGIONAL_OFFICER" as Role, regionId } }),
    prisma.user.create({ data: { email: `${PREFIX}-aud@test.local`, name: "Aud", passwordHash: "x", role: "AUDITOR" as Role } }),
  ]);
  memberId = users[0].id;
  otherMemberId = users[1].id;
  nonMemberId = users[2].id;
  regionalOfficerId = users[2].id;
  auditorId = users[3].id;

  const definition = await prisma.workflowDefinition.create({
    data: { code: `${PREFIX}-WF`, applicationType: "NEW_ENGINEERING" as ApplicationType, name: `${PREFIX} WF`, version: 99, isActive: false },
  });
  definitionId = definition.id;
  const stage = await prisma.workflowStage.create({
    data: { definitionId: definition.id, code: "EVC", name: "EVC", sequence: 1, slaWorkingDays: 20, assigneeRole: "EVC_MEMBER" as Role },
  });
  const application = await prisma.application.create({
    data: {
      appNo: `${PREFIX}-APP`,
      type: "NEW_ENGINEERING" as ApplicationType,
      title: `${PREFIX} case`,
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
  await prisma.notification.deleteMany({ where: { userId: { in: [memberId, otherMemberId] } } });
  await prisma.application.deleteMany({ where: { id: applicationId } });
  await prisma.workflowStage.deleteMany({ where: { definitionId } });
  await prisma.workflowDefinition.deleteMany({ where: { id: definitionId } });
  await prisma.escalationPolicy.deleteMany({ where: { description: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.institution.deleteMany({ where: { id: institutionId } });
  await prisma.region.deleteMany({ where: { id: { in: [regionId, otherRegionId] } } });
  await prisma.$disconnect();
});

describe("POST /api/evc", () => {
  const future = () => new Date(Date.now() + 10 * 86400000).toISOString();

  it("rejects an unauthenticated request with 401", async () => {
    holder.actor = null;
    const res = await evcRoute.POST(post({ applicationId, scheduledFor: future(), memberIds: [memberId] }), ctx());
    expect(res.status).toBe(401);
  });

  it("rejects a role without evc:schedule with 403", async () => {
    holder.actor = asAuditor();
    const res = await evcRoute.POST(post({ applicationId, scheduledFor: future(), memberIds: [memberId] }), ctx());
    expect(res.status).toBe(403);
  });

  it("rejects a non-date scheduledFor with 422", async () => {
    holder.actor = asRegionalOfficer();
    const res = await evcRoute.POST(post({ applicationId, scheduledFor: "not-a-date", memberIds: [memberId] }), ctx());
    expect(res.status).toBe(422);
  });

  it("rejects a past date with 422", async () => {
    holder.actor = asRegionalOfficer();
    const res = await evcRoute.POST(post({ applicationId, scheduledFor: "2000-01-01T00:00:00.000Z", memberIds: [memberId] }), ctx());
    expect(res.status).toBe(422);
  });

  it("rejects a member who is not an active EVC member with 422", async () => {
    holder.actor = asRegionalOfficer();
    const res = await evcRoute.POST(post({ applicationId, scheduledFor: future(), memberIds: [nonMemberId] }), ctx());
    expect(res.status).toBe(422);
  });

  it("rejects unknown fields with 422", async () => {
    holder.actor = asRegionalOfficer();
    const res = await evcRoute.POST(post({ applicationId, scheduledFor: future(), memberIds: [memberId], committee: [] }), ctx());
    expect(res.status).toBe(422);
  });

  it("schedules a visit, persists it and writes an audit entry", async () => {
    holder.actor = asRegionalOfficer();
    const res = await evcRoute.POST(post({ applicationId, scheduledFor: future(), memberIds: [memberId, otherMemberId], venue: "Campus" }), ctx());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);

    const stored = await prisma.evcSchedule.findUnique({ where: { id: json.data.id } });
    expect(stored?.memberIds).toEqual([memberId, otherMemberId]);
    expect(stored?.status).toBe("SCHEDULED");

    const audit = await prisma.auditLog.findFirst({ where: { action: "EVC_SCHEDULED", entityId: json.data.id } });
    expect(audit).not.toBeNull();

    const reminder = await prisma.notification.findFirst({ where: { userId: memberId, kind: "EVC_REMINDER" } });
    expect(reminder).not.toBeNull();
  });

  it("refuses a second active visit for the same case with 409", async () => {
    holder.actor = asRegionalOfficer();
    const res = await evcRoute.POST(post({ applicationId, scheduledFor: future(), memberIds: [memberId] }), ctx());
    expect(res.status).toBe(409);
  });

  it("refuses a case outside the actor's region with 404", async () => {
    holder.actor = { ...asRegionalOfficer(), regionId: otherRegionId };
    const res = await evcRoute.POST(post({ applicationId, scheduledFor: future(), memberIds: [memberId] }), ctx());
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/evc", () => {
  function patch(body: unknown): Request {
    return new Request("http://test.local/api/evc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("reschedules an existing visit and audits the change", async () => {
    holder.actor = asRegionalOfficer();
    const existing = await prisma.evcSchedule.findFirst({ where: { applicationId } });
    expect(existing).not.toBeNull();
    const newDate = new Date(Date.now() + 20 * 86400000).toISOString();
    const res = await evcRoute.PATCH(patch({ id: existing!.id, scheduledFor: newDate, venue: "New venue" }), ctx());
    expect(res.status).toBe(200);
    const reloaded = await prisma.evcSchedule.findUnique({ where: { id: existing!.id } });
    expect(reloaded?.venue).toBe("New venue");
    const audit = await prisma.auditLog.findFirst({ where: { action: "EVC_UPDATED", entityId: existing!.id } });
    expect(audit).not.toBeNull();
  });

  it("cancels a visit", async () => {
    holder.actor = asRegionalOfficer();
    const existing = await prisma.evcSchedule.findFirst({ where: { applicationId } });
    const res = await evcRoute.PATCH(patch({ id: existing!.id, status: "CANCELLED" }), ctx());
    expect(res.status).toBe(200);
    const reloaded = await prisma.evcSchedule.findUnique({ where: { id: existing!.id } });
    expect(reloaded?.status).toBe("CANCELLED");
  });

  it("returns 404 for an unknown visit", async () => {
    holder.actor = asRegionalOfficer();
    const res = await evcRoute.PATCH(patch({ id: "3f1c2b4a-1d2e-4f6a-8b9c-0d1e2f3a4b5c", status: "CANCELLED" }), ctx());
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/escalation", () => {
  const rung = (over: Record<string, unknown> = {}) => ({
    level: 1,
    afterWorkingDays: 3,
    targetRole: "REGIONAL_OFFICER",
    channel: "IN_APP",
    // Region-scoped so the tests do not collide with the seeded global ladder.
    regionId: otherRegionId,
    description: `${PREFIX} rung`,
    ...over,
  });

  function postEsc(body: unknown): Request {
    return new Request("http://test.local/api/admin/escalation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejects a role without admin:config with 403", async () => {
    holder.actor = asRegionalOfficer();
    const res = await escalationRoute.POST(postEsc(rung()), ctx());
    expect(res.status).toBe(403);
  });

  it("rejects an out-of-range level with 422", async () => {
    holder.actor = asAuditor();
    holder.actor = { ...asAuditor(), role: "SYSTEM_ADMIN" as Role };
    const res = await escalationRoute.POST(postEsc(rung({ level: 0 })), ctx());
    expect(res.status).toBe(422);
  });

  it("creates a rung as System Admin and audits it", async () => {
    holder.actor = { ...asAuditor(), role: "SYSTEM_ADMIN" as Role };
    const res = await escalationRoute.POST(postEsc(rung()), ctx());
    expect(res.status).toBe(201);
    const json = await res.json();
    const stored = await prisma.escalationPolicy.findUnique({ where: { id: json.data.id } });
    expect(stored?.level).toBe(1);
    const audit = await prisma.auditLog.findFirst({ where: { action: "ESCALATION_CREATED", entityId: json.data.id } });
    expect(audit).not.toBeNull();
  });

  it("rejects a duplicate level with 422 (explicit check beats the NULL-unique index)", async () => {
    holder.actor = { ...asAuditor(), role: "SYSTEM_ADMIN" as Role };
    const res = await escalationRoute.POST(postEsc(rung({ afterWorkingDays: 4 })), ctx());
    expect(res.status).toBe(422);
  });

  it("updates an existing rung and audits the change", async () => {
    holder.actor = { ...asAuditor(), role: "SYSTEM_ADMIN" as Role };
    const existing = await prisma.escalationPolicy.findFirst({ where: { description: `${PREFIX} rung` } });
    const res = await escalationRoute.POST(postEsc(rung({ id: existing!.id, afterWorkingDays: 5, isActive: false })), ctx());
    expect(res.status).toBe(200);
    const stored = await prisma.escalationPolicy.findUnique({ where: { id: existing!.id } });
    expect(stored?.afterWorkingDays).toBe(5);
    expect(stored?.isActive).toBe(false);
    const audit = await prisma.auditLog.findFirst({ where: { action: "ESCALATION_UPDATED", entityId: existing!.id } });
    expect(audit).not.toBeNull();
  });

  it("rejects a rung that would fire out of order with 422", async () => {
    holder.actor = { ...asAuditor(), role: "SYSTEM_ADMIN" as Role };
    const ok = await escalationRoute.POST(postEsc(rung({ level: 4, afterWorkingDays: 7, description: `${PREFIX} level four` })), ctx());
    expect(ok.status).toBe(201);
    // Level 3 must not be reached later than level 4.
    const res = await escalationRoute.POST(postEsc(rung({ level: 3, afterWorkingDays: 10, description: `${PREFIX} out of order` })), ctx());
    expect(res.status).toBe(422);
  });
});
