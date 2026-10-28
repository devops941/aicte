import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { buildHolidaySet, classifySla, countWorkingDays, type HolidayLike } from "@/lib/sla/calendar";
import { selectEscalation, type PolicyRow } from "@/lib/alerts/evaluate";
import {
  dayBucket,
  documentExpiryKey,
  escalationKey,
  evcReminderKey,
  monthBucket,
  slaDueSoonKey,
  slaOverdueKey,
  undertakingDueKey,
  type OutboxItem,
} from "@/lib/notifications/outbox";
import { sendMail } from "@/lib/notifications/mailer";

/**
 * The alert engine. It runs on a schedule, reads the world, and writes two
 * kinds of rows: notifications (the outbox) and audit entries. It never moves a
 * case, never approves anything, and never changes a deadline. Every row it
 * creates carries a dedupe key, so running the same scan twice in one window
 * produces the same set of alerts exactly once.
 */

export type ScanSummary = {
  job: string;
  scanned: number;
  queued: number;
  dispatched: number;
  failed: number;
  escalated: number;
  detail?: string;
};

const OPEN_STATUSES = ["SUBMITTED", "IN_PROCESS", "SCHEDULED_EVC", "PENDING_DECISION", "RETURNED_FOR_CLARIFICATION"];

async function heartbeat(job: string, status: string, detail?: string) {
  await prisma.workerHeartbeat.upsert({
    where: { job },
    update: { lastRunAt: new Date(), status, detail: detail ?? null, runCount: { increment: 1 } },
    create: { job, status, detail: detail ?? null, runCount: 1 },
  });
}

async function queue(items: OutboxItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const seen = new Set<string>();
  const unique = items.filter((i) => (seen.has(i.dedupeKey) ? false : (seen.add(i.dedupeKey), true)));
  const result = await prisma.notification.createMany({ data: unique, skipDuplicates: true });
  return result.count;
}

async function loadHolidays(regionIds: string[]): Promise<HolidayLike[]> {
  return prisma.holiday.findMany({
    where: { OR: [{ regionId: null }, { regionId: { in: regionIds } }] },
    select: { date: true, regionId: true },
  });
}

/** Finds cases approaching or past their stage deadline and queues reminders. */
export async function scanSla(now = new Date()): Promise<ScanSummary> {
  const applications = await prisma.application.findMany({
    where: { status: { in: OPEN_STATUSES as never }, slaDueAt: { not: null }, slaPausedAt: null },
    select: {
      id: true,
      appNo: true,
      title: true,
      type: true,
      regionId: true,
      slaDueAt: true,
      slaState: true,
      currentStage: { select: { id: true, name: true, slaWorkingDays: true } },
      assignments: { where: { releasedAt: null }, select: { userId: true } },
      institution: { select: { id: true } },
    },
  });

  const holidays = await loadHolidays([...new Set(applications.map((a) => a.regionId))]);
  const items: OutboxItem[] = [];
  const bucket = dayBucket(now);
  let overdueCount = 0;

  for (const app of applications) {
    if (!app.slaDueAt || !app.currentStage) continue;
    const due = app.slaDueAt;
    const owners = app.assignments.map((a) => a.userId);

    // Recipients fall back to the institution when nobody holds the case.
    let recipients = owners;
    if (recipients.length === 0) {
      const instUsers = await prisma.user.findMany({
        where: { role: "INSTITUTION_ADMIN", institutionId: app.institution.id, isActive: true },
        select: { id: true },
      });
      recipients = instUsers.map((u) => u.id);
    }

    const isOverdue = due < now;
    if (isOverdue) overdueCount += 1;

    const stageStart = new Date(due.getTime() - app.currentStage.slaWorkingDays * 86400000);
    const remaining = countWorkingDays(now, due, buildHolidaySet(holidays, app.regionId));

    // "Due soon" fires once per day once 80% of the allowance is used.
    if (!isOverdue && remaining <= Math.max(1, Math.round(app.currentStage.slaWorkingDays * 0.2))) {
      for (const userId of recipients) {
        items.push({
          userId,
          kind: "SLA_DUE_SOON",
          dedupeKey: slaDueSoonKey(app.id, app.currentStage.id, `${bucket}:${userId}`),
          channel: "IN_APP",
          title: `${app.appNo} is due soon at ${app.currentStage.name}`,
          body: `About ${remaining} working day(s) remain.`,
          link: `/cases/${app.id}`,
          entityType: "Application",
          entityId: app.id,
        });
      }
    }

    // "Overdue" fires once per case and stage, not once per run.
    if (isOverdue) {
      const daysOverdue = countWorkingDays(due, now, buildHolidaySet(holidays, app.regionId));
      for (const userId of recipients) {
        items.push({
          userId,
          kind: "SLA_OVERDUE",
          dedupeKey: slaOverdueKey(app.id, app.currentStage.id) + `:${userId}`,
          channel: "IN_APP",
          title: `${app.appNo} is overdue at ${app.currentStage.name}`,
          body: `Overdue by about ${daysOverdue} working day(s).`,
          link: `/cases/${app.id}`,
          entityType: "Application",
          entityId: app.id,
        });
      }
    }

    // Keep the stored SLA state in step with the clock.
    const nextState = isOverdue ? "OVERDUE" : items.some((i) => i.entityId === app.id) ? "DUE_SOON" : "ON_TRACK";
    if (nextState !== app.slaState) {
      await prisma.application.update({ where: { id: app.id }, data: { slaState: nextState } });
    }

    void stageStart;
  }

  const queued = await queue(items);
  await heartbeat("sla-scan", "OK", `${applications.length} cases scanned, ${queued} alerts queued`);
  return { job: "sla-scan", scanned: applications.length, queued, dispatched: 0, failed: 0, escalated: 0, detail: `${overdueCount} overdue` };
}

/** Applies the escalation ladder to overdue cases. */
export async function scanEscalations(now = new Date()): Promise<ScanSummary> {
  const policies = (await prisma.escalationPolicy.findMany({ where: { isActive: true } })) as unknown as PolicyRow[];
  if (policies.length === 0) {
    await heartbeat("escalation-scan", "SKIPPED", "No active escalation policies");
    return { job: "escalation-scan", scanned: 0, queued: 0, dispatched: 0, failed: 0, escalated: 0 };
  }

  const applications = await prisma.application.findMany({
    where: { status: { in: OPEN_STATUSES as never }, slaDueAt: { lt: now }, slaPausedAt: null },
    select: {
      id: true,
      appNo: true,
      type: true,
      regionId: true,
      slaDueAt: true,
      currentStage: { select: { name: true } },
      institution: { select: { id: true, name: true } },
    },
  });

  const holidays = await loadHolidays([...new Set(applications.map((a) => a.regionId))]);
  const items: OutboxItem[] = [];
  let escalated = 0;

  for (const app of applications) {
    if (!app.slaDueAt) continue;
    const daysOverdue = countWorkingDays(app.slaDueAt, now, buildHolidaySet(holidays, app.regionId));
    const chosen = selectEscalation({
      applicationType: app.type,
      regionId: app.regionId,
      daysOverdue,
      policies,
    });
    if (!chosen) continue;

    const recipients = await prisma.user.findMany({
      where: { role: chosen.targetRole, isActive: true, ...(chosen.policy.regionId ? { regionId: app.regionId } : {}) },
      select: { id: true },
    });
    if (recipients.length === 0) continue;

    escalated += 1;
    for (const r of recipients) {
      items.push({
        userId: r.id,
        kind: "ESCALATION",
        dedupeKey: `${escalationKey(app.id, chosen.level, dayBucket(now))}:${r.id}`,
        channel: chosen.policy.channel,
        title: `Escalation L${chosen.level}: ${app.appNo} overdue`,
        body: `${app.institution.name} — ${daysOverdue} working day(s) past the deadline at ${app.currentStage?.name ?? "current stage"}.`,
        link: `/cases/${app.id}`,
        entityType: "Application",
        entityId: app.id,
      });
    }
  }

  const queued = await queue(items);
  await heartbeat("escalation-scan", "OK", `${escalated} cases escalated, ${queued} alerts queued`);
  return { job: "escalation-scan", scanned: applications.length, queued, dispatched: 0, failed: 0, escalated };
}

/** Reminds EVC members 7 and 1 day before a scheduled visit. */
export async function scanEvcReminders(now = new Date()): Promise<ScanSummary> {
  const upcoming = await prisma.evcSchedule.findMany({
    where: { status: { in: ["PROPOSED", "SCHEDULED"] }, scheduledFor: { gte: now } },
    select: {
      id: true,
      scheduledFor: true,
      venue: true,
      memberIds: true,
      application: { select: { id: true, appNo: true, title: true } },
    },
  });

  const items: OutboxItem[] = [];
  for (const evc of upcoming) {
    const daysAway = Math.ceil((evc.scheduledFor.getTime() - now.getTime()) / 86400000);
    for (const daysBefore of [7, 1]) {
      if (daysAway > daysBefore) continue;
      // Fire only in the window for this threshold, so a 3-day-away visit
      // produces the 7-day reminder once and the 1-day reminder later.
      if (daysAway < daysBefore - 1 && daysBefore !== 1) continue;
      for (const memberId of evc.memberIds) {
        items.push({
          userId: memberId,
          kind: "EVC_REMINDER",
          dedupeKey: `${evcReminderKey(evc.id, daysBefore)}:${memberId}`,
          channel: "EMAIL",
          title: `EVC visit for ${evc.application.appNo} in ${daysAway} day(s)`,
          body: `${evc.application.title}${evc.venue ? ` at ${evc.venue}` : ""}.`,
          link: `/evc`,
          entityType: "Application",
          entityId: evc.application.id,
        });
      }
    }
  }

  const queued = await queue(items);
  await heartbeat("evc-reminders", "OK", `${upcoming.length} visits scanned, ${queued} reminders queued`);
  return { job: "evc-reminders", scanned: upcoming.length, queued, dispatched: 0, failed: 0, escalated: 0 };
}

/** Flags documents that are expired or expiring within 30 days. */
export async function scanDocumentExpiry(now = new Date()): Promise<ScanSummary> {
  const horizon = new Date(now.getTime() + 30 * 86400000);
  const documents = await prisma.document.findMany({
    where: { expiresAt: { not: null, lte: horizon } },
    select: {
      id: true,
      kind: true,
      label: true,
      expiresAt: true,
      application: { select: { id: true, appNo: true, regionId: true, institutionId: true } },
    },
  });

  const items: OutboxItem[] = [];
  for (const doc of documents) {
    const institutionId = doc.application?.institutionId;
    const recipients = institutionId
      ? await prisma.user.findMany({
          where: { role: "INSTITUTION_ADMIN", institutionId, isActive: true },
          select: { id: true },
        })
      : [];
    const expired = doc.expiresAt! < now;
    for (const r of recipients) {
      items.push({
        userId: r.id,
        kind: "DOCUMENT_EXPIRY",
        dedupeKey: `${documentExpiryKey(doc.id, monthBucket(now))}:${r.id}`,
        channel: "EMAIL",
        title: `${doc.label ?? doc.kind} ${expired ? "has expired" : "expires soon"}`,
        body: `${doc.application?.appNo ?? "Institution document"} — valid until ${doc.expiresAt!.toISOString().slice(0, 10)}.`,
        link: doc.application ? `/applications/${doc.application.id}` : "/compliance",
        entityType: "Document",
        entityId: doc.id,
      });
    }
  }

  const queued = await queue(items);
  await heartbeat("document-expiry", "OK", `${documents.length} documents scanned, ${queued} alerts queued`);
  return { job: "document-expiry", scanned: documents.length, queued, dispatched: 0, failed: 0, escalated: 0 };
}

/** Raises alerts for undertakings that are due or overdue. */
export async function scanUndertakings(now = new Date()): Promise<ScanSummary> {
  const horizon = new Date(now.getTime() + 7 * 86400000);
  const undertakings = await prisma.undertaking.findMany({
    where: { status: { in: ["OPEN"] }, dueAt: { lte: horizon } },
    select: {
      id: true,
      title: true,
      dueAt: true,
      institutionId: true,
      application: { select: { id: true, appNo: true } },
    },
  });

  const items: OutboxItem[] = [];
  const bucket = dayBucket(now);
  for (const u of undertakings) {
    const recipients = await prisma.user.findMany({
      where: { role: "INSTITUTION_ADMIN", institutionId: u.institutionId, isActive: true },
      select: { id: true },
    });
    const overdue = u.dueAt < now;
    if (overdue && u.id) {
      await prisma.undertaking.update({ where: { id: u.id }, data: { status: "OVERDUE" } }).catch(() => undefined);
    }
    for (const r of recipients) {
      items.push({
        userId: r.id,
        kind: "UNDERTAKING_DUE",
        dedupeKey: `${undertakingDueKey(u.id, bucket)}:${r.id}`,
        channel: "EMAIL",
        title: `${overdue ? "Overdue" : "Upcoming"} undertaking: ${u.title}`,
        body: `Due ${u.dueAt.toISOString().slice(0, 10)}${u.application ? ` for ${u.application.appNo}` : ""}.`,
        link: "/compliance",
        entityType: "Undertaking",
        entityId: u.id,
      });
    }
  }

  const queued = await queue(items);
  await heartbeat("undertaking-scan", "OK", `${undertakings.length} undertakings scanned, ${queued} alerts queued`);
  return { job: "undertaking-scan", scanned: undertakings.length, queued, dispatched: 0, failed: 0, escalated: 0 };
}

/**
 * Delivers queued notifications and retries failures up to a limit. Delivery is
 * separated from evaluation so a mail outage never blocks deadline scanning.
 */
export async function dispatchNotifications(limit = 50): Promise<ScanSummary> {
  const MAX_ATTEMPTS = 3;
  const pending = await prisma.notification.findMany({
    where: { status: { in: ["QUEUED", "FAILED"] }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { user: { select: { email: true, name: true } } },
  });

  let dispatched = 0;
  let failed = 0;

  for (const n of pending) {
    // In-app rows are delivered by definition; only email rows need a transport.
    if (n.channel === "IN_APP") {
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
      });
      dispatched += 1;
      continue;
    }

    const result = await sendMail({
      to: n.user.email,
      subject: n.title,
      text: n.body ?? n.title,
    });

    if (result.delivered) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
      dispatched += 1;
    } else {
      const attempts = n.attempts + 1;
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "QUEUED",
          attempts,
          lastError: result.error ?? "delivery failed",
        },
      });
      failed += 1;
    }
  }

  await heartbeat("notification-dispatch", "OK", `${dispatched} delivered, ${failed} failed`);
  return { job: "notification-dispatch", scanned: pending.length, queued: 0, dispatched, failed, escalated: 0 };
}

/** Runs every scan in order and records a single audit entry for the cycle. */
export async function runAllScans(now = new Date()) {
  const results = [
    await scanSla(now),
    await scanEscalations(now),
    await scanEvcReminders(now),
    await scanDocumentExpiry(now),
    await scanUndertakings(now),
    await dispatchNotifications(),
  ];

  const totals = results.reduce(
    (acc, r) => ({
      queued: acc.queued + r.queued,
      dispatched: acc.dispatched + r.dispatched,
      failed: acc.failed + r.failed,
      escalated: acc.escalated + r.escalated,
    }),
    { queued: 0, dispatched: 0, failed: 0, escalated: 0 },
  );

  await writeAudit({
    actorEmail: "worker@aicte.gov.in",
    action: "WORKER_CYCLE",
    entityType: "System",
    entityId: null,
    after: { results, totals, ranAt: now.toISOString() },
  });

  return { results, totals };
}

export type { Prisma };
