import type { NotificationChannel, NotificationKind } from "@prisma/client";

/**
 * Dedupe keys make the alert engine idempotent. A reminder is identified by the
 * thing it is about plus the point in time it fires (a bucket), never by the
 * moment the job happened to run. Running the worker twice in the same window
 * therefore produces one notification, not two.
 */

export function slaDueSoonKey(applicationId: string, stageId: string, bucket: string): string {
  return `sla:due-soon:${applicationId}:${stageId}:${bucket}`;
}

export function slaOverdueKey(applicationId: string, stageId: string): string {
  return `sla:overdue:${applicationId}:${stageId}`;
}

export function escalationKey(applicationId: string, level: number, bucket: string): string {
  return `escalation:${applicationId}:L${level}:${bucket}`;
}

export function evcReminderKey(evcId: string, daysBefore: number): string {
  return `evc:reminder:${evcId}:${daysBefore}d`;
}

export function documentExpiryKey(documentId: string, bucket: string): string {
  return `doc:expiry:${documentId}:${bucket}`;
}

export function undertakingDueKey(undertakingId: string, bucket: string): string {
  return `undertaking:due:${undertakingId}:${bucket}`;
}

export function clarificationKey(clarificationId: string, kind: "raised" | "responded"): string {
  return `clarification:${kind}:${clarificationId}`;
}

export function decisionKey(applicationId: string, action: string): string {
  return `decision:${action}:${applicationId}`;
}

export function assignmentKey(assignmentId: string): string {
  return `assignment:${assignmentId}`;
}

/** A stable day bucket so a "due soon" nudge fires at most once per day. */
export function dayBucket(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A stable month bucket for slower-moving reminders such as document expiry. */
export function monthBucket(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export type OutboxItem = {
  userId: string;
  kind: NotificationKind;
  dedupeKey: string;
  channel: NotificationChannel;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
};

/**
 * Inserts outbox rows, skipping any whose dedupe key already exists. Uses
 * `createMany` with `skipDuplicates` so a concurrent worker cannot create a
 * second copy of the same alert.
 */
export function dedupe(items: OutboxItem[]): OutboxItem[] {
  const seen = new Set<string>();
  const out: OutboxItem[] = [];
  for (const item of items) {
    if (seen.has(item.dedupeKey)) continue;
    seen.add(item.dedupeKey);
    out.push(item);
  }
  return out;
}
