/**
 * Working-day SLA calculator.
 *
 * Deadlines are measured in working days: weekends are skipped and any date
 * present in the holiday calendar (global, or scoped to the case's region) is
 * skipped. All functions are pure so the engine can be unit-tested without a
 * database; callers pass the holiday list in.
 */

export type HolidayLike = { date: Date; regionId?: string | null };

export function toDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** A day is a working day when it is Mon-Fri and not in the holiday set. */
export function isWorkingDay(date: Date, holidays: Set<string>): boolean {
  const dow = date.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !holidays.has(toDateKey(date));
}

export function buildHolidaySet(holidays: HolidayLike[], regionId?: string | null): Set<string> {
  const set = new Set<string>();
  for (const h of holidays) {
    // A holiday with no region is national; a scoped one applies only to its region.
    if (h.regionId && regionId && h.regionId !== regionId) continue;
    if (h.regionId && !regionId) continue;
    set.add(toDateKey(new Date(h.date)));
  }
  return set;
}

/** Adds N working days to a start date, returning the first working day after the last. */
export function addWorkingDays(start: Date, days: number, holidays: Set<string> = new Set()): Date {
  const cursor = new Date(start.getTime());
  if (days <= 0) return cursor;
  let remaining = days;
  let guard = 0;
  while (remaining > 0 && guard < 3650) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
    if (isWorkingDay(cursor, holidays)) remaining -= 1;
  }
  return cursor;
}

/** Counts working days strictly between two instants (exclusive start, inclusive end). */
export function countWorkingDays(from: Date, to: Date, holidays: Set<string> = new Set()): number {
  if (to <= from) return 0;
  const cursor = new Date(from.getTime());
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to.getTime());
  let count = 0;
  let guard = 0;
  while (cursor < end && guard < 3650) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
    if (cursor <= end && isWorkingDay(cursor, holidays)) count += 1;
  }
  return count;
}

export type SlaClassification = "ON_TRACK" | "DUE_SOON" | "OVERDUE";

export const DUE_SOON_THRESHOLD = 0.8;

/**
 * Classifies a live case. Elapsed is measured in working days against the
 * stage's allowance, so a case that has used 80% or more of its window is
 * "due soon" and anything past 100% is "overdue".
 */
export function classifySla(
  enteredAt: Date,
  now: Date,
  slaWorkingDays: number,
  holidays: Set<string> = new Set(),
  dueSoonThreshold = DUE_SOON_THRESHOLD,
): { state: SlaClassification; elapsed: number; remaining: number; percent: number } {
  const elapsed = countWorkingDays(enteredAt, now, holidays);
  const allowance = Math.max(1, slaWorkingDays);
  const percent = elapsed / allowance;
  const remaining = allowance - elapsed;
  let state: SlaClassification = "ON_TRACK";
  if (elapsed >= allowance) state = "OVERDUE";
  else if (percent >= dueSoonThreshold) state = "DUE_SOON";
  return { state, elapsed, remaining, percent };
}

/** Effective due date = stage entry + SLA days, shifted past weekends and holidays. */
export function computeDueDate(
  enteredAt: Date,
  slaWorkingDays: number,
  holidays: Set<string> = new Set(),
): Date {
  return addWorkingDays(enteredAt, slaWorkingDays, holidays);
}

/**
 * Rebuilds the deadline for a paused case. The clock does not run while the
 * case waits on the institution, so we subtract the accumulated pause and then
 * re-apply working-day arithmetic from the resumed point.
 */
export function resumeDueDate(
  originalDueAt: Date,
  pausedAt: Date,
  resumedAt: Date,
  slaWorkingDays: number,
  holidays: Set<string> = new Set(),
): { dueAt: Date; pausedMs: number } {
  const pausedMs = Math.max(0, resumedAt.getTime() - pausedAt.getTime());
  const workedSoFar = countWorkingDays(
    new Date(originalDueAt.getTime() - slaWorkingDays * 86400000),
    pausedAt,
    holidays,
  );
  const remaining = Math.max(0, slaWorkingDays - workedSoFar);
  const dueAt = addWorkingDays(resumedAt, remaining, holidays);
  return { dueAt, pausedMs };
}

export function formatWorkingDays(days: number): string {
  if (days === 0) return "due today";
  if (days === 1) return "1 working day";
  return `${days} working days`;
}
