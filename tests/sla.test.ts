import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  buildHolidaySet,
  classifySla,
  computeDueDate,
  countWorkingDays,
  isWorkingDay,
  toDateKey,
} from "@/lib/sla/calendar";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("working-day calendar", () => {
  it("treats weekends as non-working", () => {
    const holidays = new Set<string>();
    // 2026-01-24 is a Saturday, 2026-01-25 a Sunday.
    expect(isWorkingDay(d("2026-01-23"), holidays)).toBe(true);
    expect(isWorkingDay(d("2026-01-24"), holidays)).toBe(false);
    expect(isWorkingDay(d("2026-01-25"), holidays)).toBe(false);
    expect(isWorkingDay(d("2026-01-26"), holidays)).toBe(true);
  });

  it("skips holidays as well as weekends", () => {
    const holidays = new Set(["2026-01-26"]);
    expect(isWorkingDay(d("2026-01-26"), holidays)).toBe(false);
  });

  it("adds working days across a weekend", () => {
    const holidays = new Set<string>();
    // Friday + 1 working day lands on Monday.
    expect(toDateKey(addWorkingDays(d("2026-01-23"), 1, holidays))).toBe("2026-01-26");
  });

  it("adds working days across a weekend and a holiday", () => {
    const holidays = new Set(["2026-01-26"]);
    expect(toDateKey(addWorkingDays(d("2026-01-23"), 1, holidays))).toBe("2026-01-27");
  });

  it("counts zero for the same instant", () => {
    expect(countWorkingDays(d("2026-01-23"), d("2026-01-23"))).toBe(0);
  });

  it("counts working days between two dates, excluding weekends", () => {
    // Mon 2026-01-19 to Fri 2026-01-23 inclusive of the end day = 4 working days.
    expect(countWorkingDays(d("2026-01-19"), d("2026-01-23"))).toBe(4);
  });

  it("ignores holidays scoped to another region", () => {
    const holidays = [{ date: d("2026-02-02"), regionId: "region-a" }];
    const forA = buildHolidaySet(holidays, "region-a");
    const forB = buildHolidaySet(holidays, "region-b");
    expect(forA.has("2026-02-02")).toBe(true);
    expect(forB.has("2026-02-02")).toBe(false);
  });

  it("applies national holidays to every region", () => {
    const holidays = [{ date: d("2026-01-26"), regionId: null }];
    expect(buildHolidaySet(holidays, "region-a").has("2026-01-26")).toBe(true);
    expect(buildHolidaySet(holidays, "region-b").has("2026-01-26")).toBe(true);
  });

  it("classifies on track, due soon and overdue at the right boundaries", () => {
    const start = d("2026-01-05"); // Monday
    const now = d("2026-01-05");
    expect(classifySla(start, now, 10).state).toBe("ON_TRACK");

    // 8 of 10 working days used = 80% => due soon.
    const eightDaysLater = addWorkingDays(start, 8);
    expect(classifySla(start, eightDaysLater, 10).state).toBe("DUE_SOON");

    // 10 of 10 used => overdue.
    const tenDaysLater = addWorkingDays(start, 10);
    expect(classifySla(start, tenDaysLater, 10).state).toBe("OVERDUE");
  });

  it("computes a due date that never lands on a weekend", () => {
    const holidays = new Set<string>();
    const due = computeDueDate(d("2026-01-19"), 5, holidays);
    expect([0, 6]).not.toContain(due.getUTCDay());
  });

  it("is idempotent when adding zero working days", () => {
    const start = d("2026-01-19");
    expect(toDateKey(addWorkingDays(start, 0))).toBe("2026-01-19");
  });
});
