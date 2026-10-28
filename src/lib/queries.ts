import "server-only";
import { prisma } from "@/lib/db";
import { applicationScope, institutionScope, type Actor } from "@/lib/auth/rbac";
import { buildHolidaySet, classifySla, countWorkingDays, type HolidayLike } from "@/lib/sla/calendar";
import type { Prisma } from "@prisma/client";

/**
 * Read model for the portals. Every list function takes the actor and applies
 * the row-level scope, so no page has to remember to filter and no page can
 * accidentally read outside the viewer's region or institution.
 */

export async function holidaySetFor(regionIds: (string | null)[]) {
  const unique = [...new Set(regionIds.filter((r): r is string => Boolean(r)))];
  const holidays = await prisma.holiday.findMany({
    where: { OR: [{ regionId: null }, ...(unique.length ? [{ regionId: { in: unique } }] : [])] },
    select: { date: true, regionId: true },
  });
  return { holidays: holidays as HolidayLike[], build: (regionId: string | null) => buildHolidaySet(holidays as HolidayLike[], regionId) };
}

export type CaseListFilters = {
  status?: string[];
  type?: string[];
  slaState?: string[];
  search?: string;
  regionId?: string;
  institutionId?: string;
  stageId?: string;
  page?: number;
  pageSize?: number;
  sort?: "recent" | "oldest" | "due" | "overdue";
};

export async function listCases(actor: Actor, filters: CaseListFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));

  const extra: Prisma.ApplicationWhereInput = {};
  if (filters.status?.length) extra.status = { in: filters.status as never };
  if (filters.type?.length) extra.type = { in: filters.type as never };
  if (filters.slaState?.length) extra.slaState = { in: filters.slaState as never };
  if (filters.regionId) extra.regionId = filters.regionId;
  if (filters.institutionId) extra.institutionId = filters.institutionId;
  if (filters.stageId) extra.currentStageId = filters.stageId;
  if (filters.search) {
    const q = filters.search.trim();
    extra.OR = [
      { appNo: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { institution: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const scope = applicationScope(actor);
  const where: Prisma.ApplicationWhereInput =
    Object.keys(scope).length === 0 ? extra : { AND: [scope, extra] };

  const orderBy: Prisma.ApplicationOrderByWithRelationInput =
    filters.sort === "oldest"
      ? { createdAt: "asc" }
      : filters.sort === "due"
        ? { slaDueAt: "asc" }
        : filters.sort === "overdue"
          ? { slaState: "desc" }
          : { updatedAt: "desc" };

  const [rows, total] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        institution: { select: { id: true, name: true, state: true, aicteId: true } },
        currentStage: { select: { id: true, name: true, slaWorkingDays: true, assigneeRole: true } },
        assignments: { where: { releasedAt: null }, select: { user: { select: { id: true, name: true } } } },
        _count: { select: { documents: true, clarifications: true } },
      },
    }),
    prisma.application.count({ where }),
  ]);

  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function dashboardStats(actor: Actor) {
  const scope = applicationScope(actor);
  const where: Prisma.ApplicationWhereInput = Object.keys(scope).length === 0 ? {} : scope;

  const [total, byStatus, bySla, overdue, dueSoon, openClarifications, unassigned] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.application.groupBy({ by: ["slaState"], where, _count: { _all: true } }),
    prisma.application.count({ where: { AND: [where, { slaState: "OVERDUE" }] } }),
    prisma.application.count({ where: { AND: [where, { slaState: "DUE_SOON" }] } }),
    prisma.clarificationRequest.count({
      where: { status: "OPEN", application: where },
    }),
    prisma.application.count({
      where: { AND: [where, { status: { notIn: ["APPROVED", "REJECTED", "WITHDRAWN", "DRAFT"] }, assignments: { none: { releasedAt: null } } }] },
    }),
  ]);

  return {
    total,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Record<string, number>,
    bySla: Object.fromEntries(bySla.map((r) => [r.slaState, r._count._all])) as Record<string, number>,
    overdue,
    dueSoon,
    openClarifications,
    unassigned,
  };
}

/** Stage-wise average days and overdue counts for bottleneck analysis. */
export async function stageAnalytics(actor: Actor) {
  const scope = applicationScope(actor);
  const where: Prisma.ApplicationWhereInput = Object.keys(scope).length === 0 ? {} : scope;

  const history = await prisma.applicationStageHistory.findMany({
    where: { application: where, exitedAt: { not: null }, daysInStage: { not: null } },
    select: {
      daysInStage: true,
      slaMet: true,
      stage: { select: { id: true, name: true, slaWorkingDays: true } },
    },
  });

  const buckets = new Map<string, { name: string; total: number; count: number; breaches: number; sla: number }>();
  for (const h of history) {
    if (!h.stage) continue;
    const key = h.stage.id;
    const entry = buckets.get(key) ?? { name: h.stage.name, total: 0, count: 0, breaches: 0, sla: h.stage.slaWorkingDays };
    entry.total += h.daysInStage ?? 0;
    entry.count += 1;
    if (h.slaMet === false) entry.breaches += 1;
    buckets.set(key, entry);
  }

  return [...buckets.values()]
    .map((b) => ({
      stage: b.name,
      avgDays: b.count ? Math.round((b.total / b.count) * 10) / 10 : 0,
      cases: b.count,
      breaches: b.breaches,
      sla: b.sla,
    }))
    .sort((a, b) => b.avgDays - a.avgDays);
}

export async function regionAnalytics(actor: Actor) {
  const scope = applicationScope(actor);
  const where: Prisma.ApplicationWhereInput = Object.keys(scope).length === 0 ? {} : scope;

  const regions = await prisma.region.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      _count: { select: { institutions: true } },
    },
    orderBy: { name: "asc" },
  });

  const grouped = await prisma.application.groupBy({
    by: ["regionId", "slaState"],
    where,
    _count: { _all: true },
  });

  return regions.map((r) => {
    const rows = grouped.filter((g) => g.regionId === r.id);
    const total = rows.reduce((s, g) => s + g._count._all, 0);
    const overdue = rows.filter((g) => g.slaState === "OVERDUE").reduce((s, g) => s + g._count._all, 0);
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      institutions: r._count.institutions,
      total,
      overdue,
      onTime: total - overdue,
    };
  });
}

export async function officerWorkload(actor: Actor) {
  const scope = applicationScope(actor);
  const where: Prisma.ApplicationWhereInput = Object.keys(scope).length === 0 ? {} : scope;

  const assignments = await prisma.assignment.findMany({
    where: { releasedAt: null, application: where },
    select: {
      user: { select: { id: true, name: true, role: true } },
      application: { select: { id: true, slaState: true } },
    },
  });

  const map = new Map<string, { name: string; role: string; open: number; overdue: number }>();
  for (const a of assignments) {
    const entry = map.get(a.user.id) ?? { name: a.user.name, role: a.user.role, open: 0, overdue: 0 };
    entry.open += 1;
    if (a.application.slaState === "OVERDUE") entry.overdue += 1;
    map.set(a.user.id, entry);
  }
  return [...map.values()].sort((a, b) => b.open - a.open);
}

export async function caseDetail(actor: Actor, applicationId: string) {
  const scope = applicationScope(actor);
  const where: Prisma.ApplicationWhereInput =
    Object.keys(scope).length === 0 ? { id: applicationId } : { AND: [scope, { id: applicationId }] };

  const application = await prisma.application.findFirst({
    where,
    include: {
      institution: { select: { id: true, name: true, aicteId: true, state: true, regionId: true } },
      currentStage: true,
      workflowVersion: {
        include: { stages: { include: { outgoing: true }, orderBy: { sequence: "asc" } } },
      },
      stageHistory: {
        orderBy: { enteredAt: "asc" },
        include: { stage: { select: { name: true, code: true } }, actor: { select: { name: true, role: true } } },
      },
      assignments: {
        orderBy: { assignedAt: "desc" },
        include: { user: { select: { id: true, name: true, role: true } }, stage: { select: { name: true } } },
      },
      clarifications: {
        orderBy: { createdAt: "desc" },
        include: {
          raisedBy: { select: { name: true, role: true } },
          respondedBy: { select: { name: true, role: true } },
        },
      },
      evcSchedules: { orderBy: { scheduledFor: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      undertakings: { orderBy: { dueAt: "asc" } },
    },
  });

  return application;
}

export async function notificationsFor(actorId: string, limit = 60) {
  return prisma.notification.findMany({
    where: { userId: actorId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function complianceOverview(actor: Actor) {
  const instScope = institutionScope(actor);
  const undertakings = await prisma.undertaking.findMany({
    where: { institution: instScope },
    orderBy: { dueAt: "asc" },
    include: {
      institution: { select: { id: true, name: true } },
      submissions: {
        orderBy: { submittedAt: "desc" },
        include: { verifier: { select: { name: true } } },
      },
      application: { select: { id: true, appNo: true } },
    },
  });

  const expiring = await prisma.document.findMany({
    where: {
      expiresAt: { not: null, lte: new Date(Date.now() + 60 * 86400000) },
      application: { institution: instScope },
    },
    orderBy: { expiresAt: "asc" },
    take: 20,
    include: { application: { select: { id: true, appNo: true } } },
  });

  return { undertakings, expiring };
}

export async function evcList(actor: Actor) {
  const scope = applicationScope(actor);
  const where: Prisma.ApplicationWhereInput = Object.keys(scope).length === 0 ? {} : scope;
  return prisma.evcSchedule.findMany({
    where: { application: where },
    orderBy: { scheduledFor: "asc" },
    include: {
      application: {
        select: {
          id: true,
          appNo: true,
          title: true,
          institution: { select: { name: true, state: true } },
        },
      },
    },
  });
}

export async function workerHealth() {
  const rows = await prisma.workerHeartbeat.findMany({ orderBy: { job: "asc" } });
  const now = Date.now();
  return rows.map((r) => {
    const ageMinutes = Math.round((now - r.lastRunAt.getTime()) / 60000);
    return {
      ...r,
      runCount: Number(r.runCount),
      ageMinutes,
      stale: ageMinutes > 30,
    };
  });
}

export async function auditPage(limit = 100, offset = 0) {
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { seq: "desc" },
      take: limit,
      skip: offset,
      include: { actor: { select: { name: true, role: true } } },
    }),
    prisma.auditLog.count(),
  ]);
  return { rows, total };
}

export async function regionOptions() {
  return prisma.region.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } });
}

export async function workflowList() {
  return prisma.workflowDefinition.findMany({
    orderBy: [{ applicationType: "asc" }, { version: "desc" }],
    include: {
      stages: { orderBy: { sequence: "asc" }, include: { outgoing: true } },
      _count: { select: { applications: true } },
    },
  });
}

export async function userList(actor: Actor) {
  // Users are scoped by their own fields: an institution admin sees only their
  // own institution's users, a regional officer only their region's.
  const where: Prisma.UserWhereInput =
    actor.role === "SYSTEM_ADMIN"
      ? {}
      : actor.role === "INSTITUTION_ADMIN" && actor.institutionId
        ? { institutionId: actor.institutionId }
        : actor.role === "REGIONAL_OFFICER" && actor.regionId
          ? { regionId: actor.regionId }
          : { id: actor.id };

  return prisma.user.findMany({
    where,
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      isActive: true,
      totpEnabled: true,
      lastLoginAt: true,
      lockedUntil: true,
      region: { select: { name: true } },
      institution: { select: { name: true } },
    },
  });
}

export async function escalationPolicies() {
  return prisma.escalationPolicy.findMany({
    orderBy: [{ level: "asc" }],
    include: { region: { select: { name: true } } },
  });
}

export async function holidaysList() {
  return prisma.holiday.findMany({
    orderBy: { date: "asc" },
    include: { region: { select: { name: true, code: true } } },
  });
}

/** Live SLA position for a row, recomputed so the UI never shows a stale colour. */
export function liveSla(
  dueAt: Date | null,
  pausedAt: Date | null,
  slaWorkingDays: number,
  holidays: Set<string>,
  now = new Date(),
) {
  if (pausedAt) return { state: "PAUSED" as const, elapsed: 0, remaining: 0, percent: 0 };
  if (!dueAt) return { state: "ON_TRACK" as const, elapsed: 0, remaining: slaWorkingDays, percent: 0 };
  const entered = new Date(dueAt.getTime() - slaWorkingDays * 86400000);
  const c = classifySla(entered, now, slaWorkingDays, holidays);
  if (now > dueAt) return { state: "OVERDUE" as const, elapsed: c.elapsed, remaining: 0, percent: 100 };
  const remaining = countWorkingDays(now, dueAt, holidays);
  return { state: c.state, elapsed: c.elapsed, remaining, percent: c.percent };
}
