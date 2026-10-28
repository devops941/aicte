import { describe, expect, it } from "vitest";
import { applicationScope, can, permissionsFor, scopedWhere, type Actor } from "@/lib/auth/rbac";
import { dedupe, slaOverdueKey, dayBucket } from "@/lib/notifications/outbox";
import { escalationLadder, selectEscalation, type PolicyRow } from "@/lib/alerts/evaluate";
import type { ApplicationType, Role } from "@prisma/client";

const actor = (over: Partial<Actor> & { role: Role }): Actor => ({
  id: "u1",
  email: "user@aicte.gov.in",
  name: "Test User",
  regionId: null,
  institutionId: null,
  ...over,
});

describe("row-level scoping", () => {
  it("pins an institution admin to their own institution", () => {
    const scope = applicationScope(actor({ role: "INSTITUTION_ADMIN" as Role, institutionId: "inst-1" }));
    expect(scope).toEqual({ institutionId: "inst-1" });
  });

  it("returns an impossible filter when an institution admin has no institution", () => {
    const scope = applicationScope(actor({ role: "INSTITUTION_ADMIN" as Role }));
    expect(scope).toEqual({ id: "__none__" });
  });

  it("pins a regional officer to their own region", () => {
    const scope = applicationScope(actor({ role: "REGIONAL_OFFICER" as Role, regionId: "region-south" }));
    expect(scope).toEqual({ regionId: "region-south" });
  });

  it("returns an impossible filter when a regional officer has no region", () => {
    expect(applicationScope(actor({ role: "REGIONAL_OFFICER" as Role }))).toEqual({ id: "__none__" });
  });

  it("limits an EVC member to visits and assignments", () => {
    const scope = applicationScope(actor({ role: "EVC_MEMBER" as Role }));
    expect(scope).toHaveProperty("OR");
  });

  it("gives a system admin an unrestricted scope", () => {
    expect(applicationScope(actor({ role: "SYSTEM_ADMIN" as Role }))).toEqual({});
  });

  it("combines scope with an extra filter using AND", () => {
    const where = scopedWhere(actor({ role: "REGIONAL_OFFICER" as Role, regionId: "r1" }), { status: "IN_PROCESS" as never });
    expect(where).toEqual({ AND: [{ regionId: "r1" }, { status: "IN_PROCESS" }] });
  });

  it("does not wrap a single condition unnecessarily", () => {
    const where = scopedWhere(actor({ role: "SYSTEM_ADMIN" as Role }), { status: "IN_PROCESS" as never });
    expect(where).toEqual({ status: "IN_PROCESS" });
  });
});

describe("permission matrix", () => {
  it("does not let an institution admin record a decision", () => {
    expect(can("INSTITUTION_ADMIN" as Role, "decision:record")).toBe(false);
    expect(can("INSTITUTION_ADMIN" as Role, "workflow:transition")).toBe(false);
  });

  it("lets a competent authority record a decision", () => {
    expect(can("COMPETENT_AUTHORITY" as Role, "decision:record")).toBe(true);
  });

  it("keeps the auditor read-only", () => {
    const perms = permissionsFor("AUDITOR" as Role);
    expect(perms).toContain("audit:read");
    expect(perms).toContain("report:read");
    expect(perms.some((p) => p.startsWith("workflow:") || p.startsWith("application:create") || p.startsWith("admin:"))).toBe(false);
  });

  it("gives a regional officer no configuration rights", () => {
    expect(can("REGIONAL_OFFICER" as Role, "admin:config")).toBe(false);
    expect(can("REGIONAL_OFFICER" as Role, "admin:users")).toBe(false);
  });

  it("lets only the system admin configure workflows", () => {
    expect(can("SYSTEM_ADMIN" as Role, "workflow:configure")).toBe(true);
    expect(can("COMPETENT_AUTHORITY" as Role, "workflow:configure")).toBe(false);
    expect(can("BUREAU_OFFICER" as Role, "workflow:configure")).toBe(false);
  });

  it("does not let an EVC member see unassigned cases or change configuration", () => {
    expect(can("EVC_MEMBER" as Role, "workflow:transition")).toBe(false);
    expect(can("EVC_MEMBER" as Role, "evc:record")).toBe(true);
  });
});

describe("notification dedupe", () => {
  it("collapses duplicate dedupe keys", () => {
    const items = [
      { userId: "u1", kind: "SLA_OVERDUE" as const, dedupeKey: "a", channel: "IN_APP" as const, title: "t" },
      { userId: "u1", kind: "SLA_OVERDUE" as const, dedupeKey: "a", channel: "IN_APP" as const, title: "t" },
      { userId: "u2", kind: "SLA_OVERDUE" as const, dedupeKey: "b", channel: "IN_APP" as const, title: "t" },
    ];
    expect(dedupe(items)).toHaveLength(2);
  });

  it("keeps distinct users separate even for the same case", () => {
    const items = [
      { userId: "u1", kind: "SLA_OVERDUE" as const, dedupeKey: "case:1:u1", channel: "IN_APP" as const, title: "t" },
      { userId: "u2", kind: "SLA_OVERDUE" as const, dedupeKey: "case:1:u2", channel: "IN_APP" as const, title: "t" },
    ];
    expect(dedupe(items)).toHaveLength(2);
  });

  it("produces a stable key for the same case and stage", () => {
    expect(slaOverdueKey("app-1", "stage-1")).toBe(slaOverdueKey("app-1", "stage-1"));
    expect(slaOverdueKey("app-1", "stage-1")).not.toBe(slaOverdueKey("app-1", "stage-2"));
  });

  it("buckets by day so a reminder fires once per day", () => {
    const morning = new Date("2026-03-04T06:00:00.000Z");
    const evening = new Date("2026-03-04T22:00:00.000Z");
    const nextDay = new Date("2026-03-05T06:00:00.000Z");
    expect(dayBucket(morning)).toBe(dayBucket(evening));
    expect(dayBucket(morning)).not.toBe(dayBucket(nextDay));
  });
});

describe("escalation selection", () => {
  const policies: PolicyRow[] = [
    { id: "p1", scope: null, regionId: null, level: 1, afterWorkingDays: 3, targetRole: "REGIONAL_OFFICER" as Role, channel: "IN_APP", isActive: true },
    { id: "p2", scope: null, regionId: null, level: 2, afterWorkingDays: 7, targetRole: "BUREAU_OFFICER" as Role, channel: "IN_APP", isActive: true },
    { id: "p3", scope: null, regionId: null, level: 3, afterWorkingDays: 15, targetRole: "COMPETENT_AUTHORITY" as Role, channel: "EMAIL", isActive: true },
  ];

  it("selects nothing when the case is not yet overdue enough", () => {
    expect(
      selectEscalation({ applicationType: "NEW_ENGINEERING" as ApplicationType, regionId: null, daysOverdue: 1, policies }),
    ).toBeNull();
  });

  it("selects level 1 at three working days overdue", () => {
    const chosen = selectEscalation({ applicationType: "NEW_ENGINEERING" as ApplicationType, regionId: null, daysOverdue: 3, policies });
    expect(chosen?.level).toBe(1);
    expect(chosen?.targetRole).toBe("REGIONAL_OFFICER");
  });

  it("selects the highest elapsed level", () => {
    const chosen = selectEscalation({ applicationType: "NEW_ENGINEERING" as ApplicationType, regionId: null, daysOverdue: 20, policies });
    expect(chosen?.level).toBe(3);
  });

  it("prefers a more specific policy when both match", () => {
    const specific: PolicyRow[] = [
      ...policies,
      { id: "p4", scope: "NEW_ENGINEERING" as ApplicationType, regionId: null, level: 1, afterWorkingDays: 2, targetRole: "BUREAU_OFFICER" as Role, channel: "IN_APP", isActive: true },
    ];
    const chosen = selectEscalation({ applicationType: "NEW_ENGINEERING" as ApplicationType, regionId: null, daysOverdue: 3, policies: specific });
    expect(chosen?.policy.id).toBe("p4");
  });

  it("ignores a policy scoped to a different region", () => {
    const scoped: PolicyRow[] = [
      { id: "p5", scope: null, regionId: "region-west", level: 1, afterWorkingDays: 1, targetRole: "REGIONAL_OFFICER" as Role, channel: "IN_APP", isActive: true },
    ];
    expect(
      selectEscalation({ applicationType: "NEW_ENGINEERING" as ApplicationType, regionId: "region-south", daysOverdue: 10, policies: scoped }),
    ).toBeNull();
  });

  it("ignores inactive policies", () => {
    const inactive: PolicyRow[] = [{ ...policies[0], isActive: false }];
    expect(
      selectEscalation({ applicationType: "NEW_ENGINEERING" as ApplicationType, regionId: null, daysOverdue: 30, policies: inactive }),
    ).toBeNull();
  });

  it("marks each rung of the ladder as reached or pending", () => {
    const ladder = escalationLadder({ applicationType: "NEW_ENGINEERING" as ApplicationType, regionId: null, daysOverdue: 8, policies });
    expect(ladder.map((r) => r.reached)).toEqual([true, true, false]);
  });
});
